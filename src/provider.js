// -----------------------------------------------------------------------------
// The weather provider: caches, sources, alerts, pollen, UV, images.
//
//   getSnapshot    the MOSMIX forecast of the nearest station (10 days, hour
//                  by hour) with the current conditions of the nearest
//                  observing station; the last good snapshot (≤ 6 h) when it
//                  fails. Cached 15 minutes per location.
//   getAlerts      the official DWD warnings at the house, cached 5 minutes.
//   getPollen      the pollen forecast of the region, cached 1 hour.
//   getUv          the UV index forecast of the nearest city, cached 1 hour.
//   getWeather     the onWeatherGet answer, in the pivot format.
//   getImage       the onWeatherGetImage answer (radar).
//
// Concurrent requests for one location share the same in-flight promise:
// the dashboard, the chat and the background loop never multiply the calls.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  ALERTS_STALE_MAX_AGE,
  ALERTS_TTL,
  HTTP_TIMEOUT,
  MAX_CACHE_ENTRIES,
  MAX_OBSERVATION_DISTANCE_KM,
  MAX_STATION_DISTANCE_KM,
  OBSERVATION_MAX_AGE,
  POLLEN_STALE_MAX_AGE,
  POLLEN_TTL,
  RADAR_IMAGE_KEY,
  RADAR_TTL,
  REGION_LOOKUP_TTL,
  SNAPSHOT_STALE_MAX_AGE,
  SNAPSHOT_TTL,
  UV_TTL,
} from './constants.js';
import { DEFAULT_CONFIG } from './config.js';
import { isInGermanyArea, isValidLocation, locationKey } from './geo.js';
import { localDate, toPivot } from './pivot.js';
import { num } from './units.js';
import { findStation, nearestStation } from './stations.js';
import { utcOffsetMinutes } from './timezone.js';
import { sunElevation } from './sun.js';
import { pollenAlerts } from './assessment.js';
import { fetchMosmix, parseMosmix } from './sources/dwdMosmix.js';
import { currentObservation, fetchObservations } from './sources/dwdObservations.js';
import { fetchWarnings } from './sources/dwdWarnings.js';
import { fetchPollen, fetchPollenRegion } from './sources/dwdPollen.js';
import { fetchUv, nearestUvCity } from './sources/dwdUv.js';
import { buildRadarImage } from './sources/dwdRadar.js';

const defaultLogger = createLogger({ name: 'provider' });

export const RADAR_IMAGE = {
  key: RADAR_IMAGE_KEY,
  label: { en: 'Precipitation radar', fr: 'Radar de précipitations' },
};

export class NoStationError extends Error {
  constructor() {
    super('No DWD forecast point near this house: MOSMIX covers Europe');
    this.name = 'NoStationError';
  }
}

/** Map with a bounded size: the oldest inserted entry goes first. */
class BoundedMap extends Map {
  set(key, value) {
    this.delete(key);
    super.set(key, value);
    if (this.size > MAX_CACHE_ENTRIES) {
      this.delete(this.keys().next().value);
    }
    return this;
  }
}

/** Estimated UV index at an instant from the daily maximum (clear-sky shape). */
export function uvAt(instant, dailyMax, latitude, longitude) {
  if (!Number.isFinite(dailyMax)) {
    return undefined;
  }
  const elevation = sunElevation(instant, latitude, longitude);
  if (elevation <= 0) {
    return 0;
  }
  const noon = new Date(instant);
  // The highest sun of the day, approximately at 12:00 solar time.
  noon.setUTCHours(12 - Math.round(longitude / 15), 0, 0, 0);
  const peak = Math.max(sunElevation(noon.toISOString(), latitude, longitude), elevation, 1);
  const ratio = Math.sin((elevation * Math.PI) / 180) / Math.sin((peak * Math.PI) / 180);
  return Math.round(dailyMax * Math.min(1, ratio) * 10) / 10;
}

export class WeatherProvider {
  /**
   * @param {{ getConfig?: () => object, logger?: object, now?: () => number,
   *   onStatus?: (status: { ok: boolean, source?: string, error?: Error }) => void }} options
   */
  constructor({ getConfig, logger, now, onStatus } = {}) {
    this.getConfig = getConfig ?? (() => DEFAULT_CONFIG);
    this.logger = logger ?? defaultLogger;
    this.now = now ?? Date.now;
    this.onStatus = onStatus ?? (() => {});
    this.snapshots = new BoundedMap();
    this.alerts = new BoundedMap();
    this.pollen = new BoundedMap();
    this.regions = new BoundedMap();
    this.uv = new BoundedMap();
    this.inflight = new Map();
    this.radar = undefined;
    this.lastLocation = undefined;
  }

  /** Forget every cached value (config change). */
  clear() {
    this.snapshots.clear();
    this.alerts.clear();
    this.pollen.clear();
    this.uv.clear();
    this.radar = undefined;
  }

  // One shared promise per (kind, location) while a fetch runs.
  share(id, factory) {
    if (!this.inflight.has(id)) {
      const promise = factory().finally(() => this.inflight.delete(id));
      this.inflight.set(id, promise);
    }
    return this.inflight.get(id);
  }

  /** The forecast point and the observing station of a location. */
  stationsFor(latitude, longitude) {
    const wanted = this.getConfig().station;
    const forecast =
      (wanted ? findStation(wanted) : undefined) ??
      nearestStation(latitude, longitude, { maxKm: MAX_STATION_DISTANCE_KM });
    if (!forecast) {
      throw new NoStationError();
    }
    const observing = forecast.observed
      ? forecast
      : nearestStation(latitude, longitude, {
          filter: (s) => s.observed,
          maxKm: MAX_OBSERVATION_DISTANCE_KM,
        });
    return { forecast, observing };
  }

  async fetchSnapshot(latitude, longitude) {
    const { forecast, observing } = this.stationsFor(latitude, longitude);
    const now = this.now();
    const offset = utcOffsetMinutes(latitude, longitude, now);
    const [kml, observations] = await Promise.all([
      fetchMosmix(forecast.id, { timeout: HTTP_TIMEOUT }),
      observing
        ? fetchObservations(observing.id, { timeout: HTTP_TIMEOUT }).catch((err) => {
            this.logger.warn(`DWD observations of ${observing.id} failed: ${err.message}`);
            return [];
          })
        : [],
    ]);
    const snapshot = parseMosmix(kml, { latitude, longitude, utcOffsetMinutes: offset, now });
    const observed = currentObservation(observations, {
      latitude: observing?.latitude ?? latitude,
      longitude: observing?.longitude ?? longitude,
      now,
      maxAge: OBSERVATION_MAX_AGE,
    });
    // Without a fresh observation, the forecast of the current hour is "now".
    const first = snapshot.hours[0];
    snapshot.current = observed ?? {
      ...first,
      datetime: new Date(Math.min(now, Date.parse(first.datetime))).toISOString(),
      observed: false,
    };
    snapshot.forecastStation = {
      id: forecast.id,
      name: snapshot.station ?? forecast.name,
      distanceKm: forecast.distance,
    };
    snapshot.observingStation = observed
      ? { id: observing.id, name: observing.name, distanceKm: observing.distance ?? 0 }
      : undefined;
    snapshot.station = snapshot.forecastStation.name;
    return snapshot;
  }

  /** The cached snapshot of a location, without fetching. */
  cachedSnapshot(latitude, longitude) {
    return this.snapshots.get(locationKey(latitude, longitude));
  }

  async getSnapshot(latitude, longitude, { force = false } = {}) {
    const key = locationKey(latitude, longitude);
    const cached = this.snapshots.get(key);
    if (!force && cached && this.now() - cached.fetchedAt < SNAPSHOT_TTL) {
      return cached.snapshot;
    }
    return this.share(`snapshot:${key}`, () => this.refreshSnapshot(latitude, longitude, cached));
  }

  async refreshSnapshot(latitude, longitude, cached) {
    try {
      const snapshot = await this.fetchSnapshot(latitude, longitude);
      this.snapshots.set(locationKey(latitude, longitude), { snapshot, fetchedAt: this.now() });
      this.onStatus({ ok: true, source: snapshot.source });
      return snapshot;
    } catch (err) {
      this.logger.warn(`DWD forecast failed: ${err.message}`);
      this.onStatus({ ok: false, error: err });
      if (cached && this.now() - cached.fetchedAt < SNAPSHOT_STALE_MAX_AGE) {
        this.logger.warn('Serving the last known weather');
        return cached.snapshot;
      }
      throw err;
    }
  }

  /** Official DWD warnings at a location (empty when disabled or abroad). */
  async getAlerts(latitude, longitude, { force = false } = {}) {
    if (!this.getConfig().official_alerts || !isInGermanyArea(latitude, longitude)) {
      return [];
    }
    const key = locationKey(latitude, longitude);
    const cached = this.alerts.get(key);
    if (!force && cached && this.now() - cached.fetchedAt < ALERTS_TTL) {
      return cached.alerts;
    }
    return this.share(`alerts:${key}`, async () => {
      try {
        const alerts = await fetchWarnings(latitude, longitude, {
          timeout: HTTP_TIMEOUT,
          now: this.now(),
        });
        this.alerts.set(key, { alerts, fetchedAt: this.now() });
        return alerts;
      } catch (err) {
        this.logger.warn(`DWD warnings failed: ${err.message}`);
        // An alert must not vanish because of one failed call.
        if (cached && this.now() - cached.fetchedAt < ALERTS_STALE_MAX_AGE) {
          return cached.alerts;
        }
        return [];
      }
    });
  }

  /** The pollen region of a location (or null when outside), cached a day. */
  async findRegion(latitude, longitude) {
    const key = locationKey(latitude, longitude);
    const known = this.regions.get(key);
    if (known && this.now() - known.fetchedAt < REGION_LOOKUP_TTL) {
      return known.region;
    }
    const region =
      (await fetchPollenRegion(latitude, longitude, { timeout: HTTP_TIMEOUT })) ?? null;
    this.regions.set(key, { region, fetchedAt: this.now() });
    return region;
  }

  /**
   * The pollen forecast at a location: undefined outside Germany, or when
   * the DWD does not answer and nothing recent is known.
   */
  async getPollen(latitude, longitude, { force = false } = {}) {
    if (!isInGermanyArea(latitude, longitude)) {
      return undefined;
    }
    const key = locationKey(latitude, longitude);
    const cached = this.pollen.get(key);
    if (!force && cached && this.now() - cached.fetchedAt < POLLEN_TTL) {
      return cached.pollen;
    }
    return this.share(`pollen:${key}`, async () => {
      try {
        const region = await this.findRegion(latitude, longitude);
        const pollen = region ? await fetchPollen(region, { timeout: HTTP_TIMEOUT }) : undefined;
        this.pollen.set(key, { pollen, fetchedAt: this.now() });
        return pollen;
      } catch (err) {
        this.logger.warn(`DWD pollen failed: ${err.message}`);
        if (cached && this.now() - cached.fetchedAt < POLLEN_STALE_MAX_AGE) {
          return cached.pollen;
        }
        return undefined;
      }
    });
  }

  /** The UV index forecast of the nearest city: undefined far from one. */
  async getUv(latitude, longitude) {
    const city = nearestUvCity(latitude, longitude);
    if (!city) {
      return undefined;
    }
    const key = city.name;
    const cached = this.uv.get(key);
    if (cached && this.now() - cached.fetchedAt < UV_TTL) {
      return cached.uv;
    }
    return this.share(`uv:${key}`, async () => {
      try {
        const forecast = await fetchUv(city.name, { timeout: HTTP_TIMEOUT });
        const uv = forecast ? { ...forecast, distanceKm: city.distance } : undefined;
        this.uv.set(key, { uv, fetchedAt: this.now() });
        return uv;
      } catch (err) {
        this.logger.warn(`DWD UV index failed: ${err.message}`);
        return cached?.uv;
      }
    });
  }

  /** The snapshot with the UV index of the city laid over its hours and days. */
  withUv(snapshot, uv, latitude, longitude) {
    if (!uv) {
      return snapshot;
    }
    const offset = snapshot.utcOffsetMinutes ?? 0;
    const dailyMax = (instant) => uv.byDate[localDate(instant, offset)];
    const hours = snapshot.hours.map((hour) => {
      const value = uvAt(hour.datetime, dailyMax(hour.datetime), latitude, longitude);
      return value === undefined ? hour : { ...hour, uv_index: value };
    });
    const days = snapshot.days.map((day) => {
      const value = uv.byDate[day.date];
      return value === undefined ? day : { ...day, uv_index: value };
    });
    const nowUv = uvAt(
      snapshot.current.datetime,
      dailyMax(snapshot.current.datetime),
      latitude,
      longitude,
    );
    const current =
      nowUv === undefined ? snapshot.current : { ...snapshot.current, uv_index: nowUv };
    return { ...snapshot, current, hours, days };
  }

  /** Official alerts plus, when enabled, the pollen one. */
  combineAlerts(official, pollen) {
    const config = this.getConfig();
    const synthetic = config.pollen_alerts ? pollenAlerts(pollen, this.now()) : [];
    return [...official, ...synthetic];
  }

  images(latitude, longitude) {
    return this.getConfig().radar_image && isInGermanyArea(latitude, longitude)
      ? [RADAR_IMAGE]
      : [];
  }

  /** onWeatherGet: the pivot weather of a location. */
  async getWeather({ latitude, longitude, language, units }) {
    // num(): null and '' are not 0 (the Gulf of Guinea).
    const lat = num(latitude);
    const lon = num(longitude);
    if (!isValidLocation(lat, lon)) {
      throw new Error('The house has no valid coordinates');
    }
    this.lastLocation = { latitude: lat, longitude: lon };
    const [snapshot, official, pollen, uv] = await Promise.all([
      this.getSnapshot(lat, lon),
      this.getAlerts(lat, lon),
      this.getConfig().pollen_alerts ? this.getPollen(lat, lon) : undefined,
      this.getUv(lat, lon),
    ]);
    return toPivot(this.withUv(snapshot, uv, lat, lon), {
      latitude: lat,
      longitude: lon,
      units,
      language,
      alerts: this.combineAlerts(official, pollen),
      images: this.images(lat, lon),
      now: this.now(),
    });
  }

  /** Location used when Gladys has not asked for the weather yet. */
  setDefaultLocation(location) {
    this.lastLocation ??= location;
  }

  /**
   * onWeatherGetImage: images are instance-global in Gladys (no coordinates
   * in the request): the radar of the last location asked for.
   */
  async getImage(key) {
    if (key !== RADAR_IMAGE_KEY || !this.getConfig().radar_image) {
      throw new Error(`Unknown image "${key}"`);
    }
    if (!this.lastLocation) {
      throw new Error('No location known yet');
    }
    const { latitude, longitude } = this.lastLocation;
    const locKey = locationKey(latitude, longitude);
    if (this.radar?.key === locKey && this.now() - this.radar.fetchedAt < RADAR_TTL) {
      return this.radar.base64;
    }
    return this.share(`radar:${locKey}`, async () => {
      const base64 = await buildRadarImage(latitude, longitude, { timeout: HTTP_TIMEOUT });
      this.radar = { key: locKey, base64, fetchedAt: this.now() };
      return base64;
    });
  }
}
