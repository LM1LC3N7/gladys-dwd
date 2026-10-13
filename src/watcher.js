// -----------------------------------------------------------------------------
// Background loop: keeps the weather of the houses fresh and tells Gladys when
// something changed, instead of waiting for its 30-minute check.
//
// Every WATCH_INTERVAL (5 min), for each located house:
//   - forecasts: refreshed when older than SNAPSHOT_TTL (15 min);
//   - warnings: re-read; a changed set of alerts -> requestWeatherRefresh(),
//     so the core's "weather alert" scene trigger fires within minutes (the
//     core re-pulls through onWeatherGet, served from the fresh cache);
//   - pollen level: a scene event on every crossed level;
//   - new data -> requestWidgetRefresh() for the widgets.
//
// The houses come from getHouses() (manifest `location: true`), re-read every
// 30 min since Gladys has no "house changed" event. Without them, the last
// location Gladys asked the weather for is watched.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  HOUSES_REFRESH_INTERVAL,
  POLLEN_WIDGET,
  WARNINGS_WIDGET,
  WATCH_INTERVAL,
} from './constants.js';
import { isValidLocation, locationKey } from './geo.js';
import { localDate } from './pivot.js';
import { utcOffsetMinutes } from './timezone.js';
import { PollenTracker } from './sceneTriggers.js';

const defaultLogger = createLogger({ name: 'watcher' });

/** A signature of the alerts: changes when one appears, ends or changes level. */
export function alertsSignature(alerts) {
  return alerts
    .map((alert) => `${alert.id ?? alert.event.en}|${alert.severity}`)
    .sort()
    .join(';');
}

/** A signature of the pollen forecast: changes with a new issue. */
export function pollenSignature(pollen) {
  return pollen ? `${pollen.region.id}|${pollen.issued}` : 'none';
}

export class Watcher {
  /**
   * @param {{ gladys: object, provider: import('./provider.js').WeatherProvider,
   *   getPreferences: () => { language: string, units: string }, logger?: object,
   *   now?: () => number }} options
   */
  constructor({ gladys, provider, getPreferences, logger, now }) {
    this.gladys = gladys;
    this.provider = provider;
    this.getPreferences = getPreferences;
    this.logger = logger ?? defaultLogger;
    this.now = now ?? Date.now;
    this.pollenTracker = new PollenTracker();
    this.houses = [];
    this.housesReadAt = 0;
    this.signatures = new Map();
    this.pollenSignatures = new Map();
    this.timer = undefined;
    this.running = false;
  }

  start() {
    this.stop();
    this.housesReadAt = 0;
    this.tick();
    this.timer = setInterval(() => this.tick(), WATCH_INTERVAL);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async refreshHouses() {
    try {
      const houses = await this.gladys.getHouses();
      this.houses = houses
        .filter((h) => isValidLocation(h.latitude, h.longitude))
        .map((h) => ({ ...h, key: h.selector ?? locationKey(h.latitude, h.longitude) }));
      if (this.houses[0]) {
        this.provider.setDefaultLocation({
          latitude: this.houses[0].latitude,
          longitude: this.houses[0].longitude,
        });
      }
    } catch (err) {
      // 403 when the location access was refused: keep the last location.
      this.logger.warn(`Cannot read the houses: ${err.message}`);
    }
    this.housesReadAt = this.now();
  }

  /** The places to watch: the located houses, or the last requested location. */
  locations() {
    if (this.houses.length > 0) {
      return this.houses;
    }
    const last = this.provider.lastLocation;
    return last ? [{ ...last, key: locationKey(last.latitude, last.longitude), name: '' }] : [];
  }

  /** Find a house by name or selector; the first one when `query` is empty. */
  findHouse(query) {
    const wanted = String(query ?? '')
      .trim()
      .toLowerCase();
    const all = this.locations();
    if (!wanted) {
      return all[0];
    }
    return all.find(
      (h) => h.selector?.toLowerCase() === wanted || h.name?.toLowerCase() === wanted,
    );
  }

  async tick() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      if (this.now() - this.housesReadAt >= HOUSES_REFRESH_INTERVAL) {
        await this.refreshHouses();
      }
      let alertsChanged = false;
      let pollenChanged = false;
      for (const house of this.locations()) {
        const result = await this.watchHouse(house);
        alertsChanged ||= result.alertsChanged;
        pollenChanged ||= result.pollenChanged;
      }
      if (alertsChanged) {
        this.logger.info('Warnings changed -> asking Gladys to refresh the weather');
        this.gladys.requestWeatherRefresh();
        this.gladys.requestWidgetRefresh(WARNINGS_WIDGET);
      }
      if (pollenChanged) {
        this.gladys.requestWidgetRefresh(POLLEN_WIDGET);
      }
    } catch (err) {
      this.logger.error('Watch cycle failed', err);
    } finally {
      this.running = false;
    }
  }

  async watchHouse(house) {
    const { latitude, longitude, key } = house;
    const pollen = await this.provider.getPollen(latitude, longitude);
    const signature = pollenSignature(pollen);
    const pollenChanged = signature !== this.pollenSignatures.get(key);
    this.pollenSignatures.set(key, signature);
    const today = localDate(
      new Date(this.now()).toISOString(),
      utcOffsetMinutes(latitude, longitude, this.now()),
    );
    for (const event of this.pollenTracker.evaluate(house, pollen, today, this.getPreferences())) {
      await this.publish(event);
    }

    try {
      await this.provider.getSnapshot(latitude, longitude);
    } catch (err) {
      this.logger.warn(`No weather for ${house.name || key}: ${err.message}`);
    }
    const official = await this.provider.getAlerts(latitude, longitude, { force: true });
    const alerts = alertsSignature(this.provider.combineAlerts(official, pollen));
    const previous = this.signatures.get(key);
    this.signatures.set(key, alerts);
    return {
      alertsChanged: previous !== undefined && previous !== alerts,
      pollenChanged,
    };
  }

  // A refused event (429, 400) must never break the loop.
  async publish({ key, data }) {
    try {
      this.logger.info(`Scene event ${key}: ${data.previous_level} -> ${data.level}`);
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      this.logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }
}
