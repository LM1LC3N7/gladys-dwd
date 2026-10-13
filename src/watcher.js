// -----------------------------------------------------------------------------
// Background loop: keeps the weather of the houses fresh and tells Gladys when
// something changed, instead of waiting for its 30-minute check.
//
// The AREAS followed are the located houses (every house of Gladys, the
// warnings only for those in Germany) and the warn cells typed in the
// configuration (`warncell_ids`: a municipality, a district, a holiday home).
//
// Every WATCH_INTERVAL (5 min), per area:
//   - forecasts (houses): refreshed when older than SNAPSHOT_TTL (15 min);
//   - warnings: re-read; a changed set of alerts -> requestWeatherRefresh(),
//     so the core's "weather alert" scene trigger fires within minutes (the
//     core re-pulls through onWeatherGet, served from the fresh cache);
//     "warning issued" / "warning ended" scene events (src/sceneTriggers.js);
//   - pollen level (houses): a scene event on every crossed level;
//   - new data -> requestWidgetRefresh() for the widgets.
// Every minute, without network, the cached warnings are re-read: a warning
// announced for 14:00 is "now" at 14:00 in the widget.
//
// The houses come from getHouses() (manifest `location: true`), re-read every
// 30 min since Gladys has no "house changed" event. Without them, the last
// location Gladys asked the weather for is watched. House coordinates are
// never written to /data; the names of the typed cells are (cells.json).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  CLOCK_INTERVAL,
  HOUSES_REFRESH_INTERVAL,
  POLLEN_WIDGET,
  WARNINGS_WIDGET,
  WATCH_INTERVAL,
} from './constants.js';
import { configCellIds } from './config.js';
import { isInGermanyArea, isValidLocation, locationKey } from './geo.js';
import { localDate } from './pivot.js';
import { timeZoneOf, utcOffsetMinutes } from './timezone.js';
import { PollenTracker, WarningTracker } from './sceneTriggers.js';
import { fetchCellById, inForce } from './sources/dwdWarnings.js';
import { HTTP_TIMEOUT } from './constants.js';

const defaultLogger = createLogger({ name: 'watcher' });
const CELLS_FILE = 'cells.json';

/** A signature of the alerts: changes when one appears, ends or changes level. */
export function alertsSignature(alerts) {
  return alerts
    .map((alert) => `${alert.id ?? alert.event.en}|${alert.severity}`)
    .sort()
    .join(';');
}

/** A signature of what the warnings widget shows: in force / upcoming ids. */
export function widgetSignature(alerts, now) {
  return alerts.map((a) => `${a.id}:${inForce(a, now) ? 1 : 0}`).join(';');
}

/** A signature of the pollen forecast: changes with a new issue. */
export function pollenSignature(pollen) {
  return pollen ? `${pollen.region.id}|${pollen.issued}` : 'none';
}

export class Watcher {
  /**
   * @param {{ gladys: object, provider: import('./provider.js').WeatherProvider,
   *   getConfig?: () => object, getPreferences: () => { language: string, units: string },
   *   store?: object, logger?: object, now?: () => number }} options
   */
  constructor({ gladys, provider, getConfig, getPreferences, store, logger, now }) {
    this.gladys = gladys;
    this.provider = provider;
    this.getConfig = getConfig ?? (() => ({}));
    this.getPreferences = getPreferences;
    this.store = store;
    this.logger = logger ?? defaultLogger;
    this.now = now ?? Date.now;
    this.pollenTracker = new PollenTracker();
    this.warningTracker = new WarningTracker({ store, now: this.now });
    this.houses = [];
    this.housesReadAt = 0;
    // cell id -> { id, name, kind }, the typed cells resolved
    this.cells = new Map(Object.entries(store?.load(CELLS_FILE)?.cells ?? {}));
    this.signatures = new Map();
    this.widgetSignatures = new Map();
    this.pollenSignatures = new Map();
    this.timer = undefined;
    this.clock = undefined;
    this.running = false;
  }

  start() {
    this.stop();
    this.housesReadAt = 0;
    this.tick();
    this.timer = setInterval(() => this.tick(), WATCH_INTERVAL);
    this.timer.unref?.();
    this.clock = setInterval(() => this.clockTick(), CLOCK_INTERVAL);
    this.clock.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.clock);
    this.timer = undefined;
    this.clock = undefined;
  }

  /** The configuration changed: re-read the houses and the cells now. */
  reloadAreas() {
    this.housesReadAt = 0;
    this.tick();
  }

  async refreshHouses() {
    try {
      const houses = await this.gladys.getHouses();
      this.houses = houses
        .filter((h) => isValidLocation(h.latitude, h.longitude))
        .map((h) => ({
          ...h,
          key: h.selector ?? locationKey(h.latitude, h.longitude),
          house: h.name ?? '',
          timeZone: timeZoneOf(h.latitude, h.longitude),
        }));
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

  /** Resolve the names of the typed cells (once per id, kept in /data). */
  async refreshCells() {
    const ids = configCellIds(this.getConfig());
    let changed = false;
    for (const id of ids) {
      if (this.cells.has(id)) {
        continue;
      }
      try {
        const cell = await fetchCellById(id, { timeout: HTTP_TIMEOUT });
        this.cells.set(id, cell ?? { id, name: id, kind: 'unknown', unknown: true });
        changed = true;
      } catch (err) {
        this.logger.warn(`Cannot resolve warn cell ${id}: ${err.message}`);
      }
    }
    for (const id of [...this.cells.keys()]) {
      if (!ids.includes(id)) {
        this.cells.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.store?.save(CELLS_FILE, { cells: Object.fromEntries(this.cells) });
    }
  }

  /** The places to watch: the located houses, or the last requested location. */
  locations() {
    if (this.houses.length > 0) {
      return this.houses;
    }
    const last = this.provider.lastLocation;
    return last
      ? [
          {
            ...last,
            key: locationKey(last.latitude, last.longitude),
            name: '',
            house: '',
            timeZone: timeZoneOf(last.latitude, last.longitude),
          },
        ]
      : [];
  }

  /** The typed cells, as areas (`cellId`, no coordinates). */
  cellAreas() {
    return configCellIds(this.getConfig()).map((id) => {
      const cell = this.cells.get(id);
      return {
        key: `cell:${id}`,
        cellId: id,
        name: cell?.name ?? id,
        kind: cell?.kind,
        unknown: cell?.unknown ?? false,
        house: '',
        timeZone: 'Europe/Berlin',
      };
    });
  }

  /** Every area the warnings are followed for: houses in Germany, then cells. */
  warningAreas() {
    return [
      ...this.locations().filter((h) => isInGermanyArea(h.latitude, h.longitude)),
      ...this.cellAreas(),
    ];
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

  /** Find a warning area by house name, selector, cell id or cell name. */
  findArea(query) {
    const wanted = String(query ?? '')
      .trim()
      .toLowerCase();
    const all = this.warningAreas();
    if (!wanted) {
      return all[0];
    }
    return all.find(
      (a) =>
        a.key.toLowerCase() === wanted ||
        a.cellId === wanted ||
        a.selector?.toLowerCase() === wanted ||
        a.name?.toLowerCase() === wanted,
    );
  }

  /** The areas a scene field names: one, or all when empty. */
  areasFor(query) {
    if (!String(query ?? '').trim()) {
      return this.warningAreas();
    }
    const area = this.findArea(query);
    return area ? [area] : [];
  }

  async tick() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      if (this.now() - this.housesReadAt >= HOUSES_REFRESH_INTERVAL) {
        await this.refreshHouses();
        await this.refreshCells();
      }
      let alertsChanged = false;
      let widgetChanged = false;
      let pollenChanged = false;
      for (const house of this.locations()) {
        const result = await this.watchHouse(house);
        pollenChanged ||= result.pollenChanged;
      }
      const areas = this.warningAreas();
      for (const area of areas) {
        const result = await this.watchWarnings(area);
        alertsChanged ||= result.alertsChanged;
        widgetChanged ||= result.widgetChanged;
      }
      this.warningTracker.keepOnly(areas.map((a) => a.key));
      if (alertsChanged) {
        this.logger.info('Warnings changed -> asking Gladys to refresh the weather');
        this.gladys.requestWeatherRefresh();
      }
      if (alertsChanged || widgetChanged) {
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

  /** Every minute: a warning that started or ended on the clock moves the widget. */
  clockTick() {
    let changed = false;
    for (const area of this.warningAreas()) {
      const alerts = this.provider.cachedAlerts(area);
      if (!alerts) {
        continue;
      }
      const signature = widgetSignature(alerts, this.now());
      if (
        this.widgetSignatures.has(area.key) &&
        this.widgetSignatures.get(area.key) !== signature
      ) {
        changed = true;
      }
      this.widgetSignatures.set(area.key, signature);
    }
    if (changed) {
      this.gladys.requestWidgetRefresh(WARNINGS_WIDGET);
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
    return { pollenChanged };
  }

  async watchWarnings(area) {
    const { key } = area;
    const alerts = await this.provider.getAlertsFor(area, { force: true });
    const fetchedAt = alerts.fetchedAt ?? 0;
    const pollen = area.cellId ? undefined : this.provider.pollen.get(key)?.pollen;
    const signature = alertsSignature(this.provider.combineAlerts(alerts, pollen));
    const previous = this.signatures.get(key);
    this.signatures.set(key, signature);
    const shown = widgetSignature(alerts, this.now());
    const widgetChanged =
      this.widgetSignatures.has(key) && this.widgetSignatures.get(key) !== shown;
    this.widgetSignatures.set(key, shown);
    // Nothing fresh from the DWD (the cached answer served on a failure):
    // no event, the next successful read will tell.
    if (fetchedAt > 0) {
      const events = this.warningTracker.evaluate(area, alerts, fetchedAt, this.getPreferences());
      for (const event of events) {
        if (await this.publish(event)) {
          event.commit();
        }
      }
    }
    return {
      alertsChanged: previous !== undefined && previous !== signature,
      widgetChanged,
    };
  }

  // A refused event (429, 400) must never break the loop.
  async publish({ key, data }) {
    try {
      this.logger.info(`Scene event ${key}: ${data.summary ?? data.title ?? data.level}`);
      await this.gladys.publishSceneEvent(key, data);
      return true;
    } catch (err) {
      this.logger.warn(`Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }
}
