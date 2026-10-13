// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`).
//
// "Pollen level changed": the Gladys scene engine compares exact values, it
// has no thresholds: the DWD pollen index (0 to 3) is turned into discrete
// levels (src/pollen.js) and an event is fired per CROSSED level, so a scene
// filtered on "moderate" still fires when the index jumps straight from none
// to high. One event per transition, never one per poll; the first
// evaluation of a house is a baseline (a restart in the middle of the birch
// season must not fire every scene again).
//
// "Air quality level changed": the UBA index (0 to 4, hourly) is already
// discrete; one event per crossed level, after a baseline. The index
// wavers between two classes from one hour to the next: an improvement is
// only taken once two successive hours read the lower class, a worsening at
// once (the advice matters then).
//
// "Warning issued" / "Warning ended": per area, the highest level of each
// warning kind is compared with the previous evaluation, kept in /data: a
// new kind or a higher level fires "issued" (the warning replacing a watch
// too), a kind gone fires "ended". Compared by kind and level, never by
// identifier: the DWD gives an updated warning a new identifier. A kind gone
// only because its end time passed waits for an answer of the DWD made after
// that time (the DWD often extends a warning at the last minute). The memory
// is written once Gladys accepted the event, so a refused event fires again.
// -----------------------------------------------------------------------------

import {
  AIR_QUALITY_TRIGGER,
  POLLEN_TRIGGER,
  WARNING_ENDED_TRIGGER,
  WARNING_ISSUED_TRIGGER,
} from './constants.js';
import { airQualityLevelOf, crossedAirQualityLevels, getAirQualityLevel } from './airQuality.js';
import {
  POLLEN_NAMES,
  crossedPollenLevels,
  formatPollen,
  getPollenLevel,
  peakPollen,
  pollenDay,
} from './pollen.js';
import { KIND_NAMES, LEVEL_NAMES, textLanguage, warningTitle, when } from './i18n.js';

export const SCENE_TRIGGER_KEYS = [
  POLLEN_TRIGGER,
  AIR_QUALITY_TRIGGER,
  WARNING_ISSUED_TRIGGER,
  WARNING_ENDED_TRIGGER,
];

export class PollenTracker {
  constructor() {
    // house key -> current level
    this.levels = new Map();
  }

  forget(houseKey) {
    this.levels.delete(houseKey);
  }

  /**
   * Evaluate the pollen of one house and return the events to publish.
   * @param {{ key: string, name?: string }} house
   * @param {object | undefined} pollen see src/sources/dwdPollen.js
   * @param {string} today local calendar date of the house
   * @param {{ language?: string }} preferences of the user
   */
  evaluate(house, pollen, today, { language } = {}) {
    const peak = peakPollen(pollenDay(pollen, today));
    if (!peak) {
      return [];
    }
    const previous = this.levels.get(house.key);
    const level = peak.level;
    this.levels.set(house.key, level);
    if (previous === undefined || previous === level) {
      return [];
    }
    const lang = textLanguage(language);
    const details = getPollenLevel(level);
    const names = peak.keys.map((key) => POLLEN_NAMES[key][lang]).join(', ');
    const summary = {
      fr: `Pollens : exposition ${details.label.fr.toLowerCase()} aujourd’hui (${names}, indice ${formatPollen(peak.value)}). ${details.advice.fr}`,
      en: `Pollen: ${details.label.en.toLowerCase()} exposure today (${names}, index ${formatPollen(peak.value)}). ${details.advice.en}`,
      de: `Pollen: ${details.label.de.toLowerCase()}e Belastung heute (${names}, Index ${formatPollen(peak.value)}). ${details.advice.de}`,
    }[lang];
    return crossedPollenLevels(previous, level).map(({ level: crossed, direction }) => ({
      key: POLLEN_TRIGGER,
      data: {
        level: crossed,
        direction,
        previous_level: previous,
        current_level: level,
        value: peak.value,
        pollen: names,
        region: pollen.region.name,
        house: house.name ?? '',
        summary,
      },
    }));
  }
}

export class AirQualityTracker {
  constructor() {
    // house key -> { level, pending: the lower level read once, datetime }
    this.state = new Map();
  }

  forget(houseKey) {
    this.state.delete(houseKey);
  }

  /**
   * Evaluate the air quality of one house and return the events to publish.
   * @param {{ key: string, name?: string }} house
   * @param {object | undefined} airQuality see src/sources/ubaAirQuality.js
   * @param {{ language?: string }} preferences of the user
   */
  evaluate(house, airQuality, { language } = {}) {
    const current = airQuality?.current;
    const read = airQualityLevelOf(current?.index);
    if (!read) {
      return [];
    }
    const state = this.state.get(house.key);
    if (!state) {
      this.state.set(house.key, { level: read, datetime: current.datetime });
      return []; // baseline
    }
    if (current.datetime === state.datetime) {
      return []; // the same hour again
    }
    const previous = state.level;
    let level = read;
    if (getAirQualityLevel(read).rank < getAirQualityLevel(previous).rank) {
      // Better: wait for a second hour at that level (or lower).
      const confirmed =
        state.pending && getAirQualityLevel(state.pending).rank >= getAirQualityLevel(read).rank;
      if (!confirmed) {
        this.state.set(house.key, { level: previous, pending: read, datetime: current.datetime });
        return [];
      }
    }
    this.state.set(house.key, { level, datetime: current.datetime });
    if (previous === level) {
      return [];
    }
    const lang = textLanguage(language);
    const details = getAirQualityLevel(level);
    const main = current.main?.name?.[lang];
    const where = airQuality.station.name;
    const summary = {
      en: `Air quality ${details.label.en.toLowerCase()} at ${where}${main ? ` (${main.toLowerCase()})` : ''}. ${details.advice.en}`,
      fr: `Qualité de l’air ${details.label.fr.toLowerCase()} à ${where}${main ? ` (${main.toLowerCase()})` : ''}. ${details.advice.fr}`,
      de: `Luftqualität ${details.label.de.toLowerCase()} in ${where}${main ? ` (${main})` : ''}. ${details.advice.de}`,
    }[lang];
    return crossedAirQualityLevels(previous, level).map(({ level: crossed, direction }) => ({
      key: AIR_QUALITY_TRIGGER,
      data: {
        level: crossed,
        direction,
        previous_level: previous,
        current_level: level,
        index: current.index,
        pollutant: main ?? '',
        station: where,
        house: house.name ?? '',
        summary,
      },
    }));
  }
}

const MAX_EVENT_TEXT = 1000;
const truncate = (text, max) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : (text ?? '');

/** The highest warning of each kind: `{ kind: { real, watch } }`. */
export function byKind(warnings) {
  const kinds = {};
  for (const warning of warnings) {
    const entry = (kinds[warning.kind] ??= {});
    const slot = warning.watch ? 'watch' : 'real';
    if (!entry[slot] || warning.level > entry[slot].level) {
      entry[slot] = warning;
    }
  }
  return kinds;
}

export class WarningTracker {
  /**
   * @param {{ store?: object, now?: () => number }} options the /data store
   */
  constructor({ store, now } = {}) {
    this.store = store;
    this.now = now ?? Date.now;
    // area key -> { kinds: { kind: { level, watch } } }
    this.memory = store?.load(WarningTracker.FILE)?.areas ?? {};
  }

  static FILE = 'warnings.json';

  forget(areaKey) {
    delete this.memory[areaKey];
    this.save();
  }

  /** Drop the areas no longer followed. */
  keepOnly(areaKeys) {
    const keep = new Set(areaKeys);
    let changed = false;
    for (const key of Object.keys(this.memory)) {
      if (!keep.has(key)) {
        delete this.memory[key];
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  save() {
    this.store?.save(WarningTracker.FILE, { areas: this.memory });
  }

  /**
   * Compare the warnings of an area with the previous evaluation and return
   * the events to publish; each event carries `commit()`, to call once
   * Gladys accepted it (the memory is then updated and saved).
   * @param {{ key: string, name: string, timeZone: string }} area
   * @param {object[]} warnings parsed warnings, expired ones excluded
   * @param {number} fetchedAt when the DWD answered
   * @param {{ language?: string }} preferences
   */
  evaluate(area, warnings, fetchedAt, { language } = {}) {
    const lang = textLanguage(language);
    const now = this.now();
    const context = { now, timeZone: area.timeZone ?? 'Europe/Berlin', language: lang };
    const current = byKind(warnings);
    const previous = this.memory[area.key];
    const next = { kinds: {} };
    const events = [];
    const commit = (kind, value) => () => {
      const entry = (this.memory[area.key] ??= { kinds: {} });
      if (value === undefined) {
        delete entry.kinds[kind];
      } else {
        entry.kinds[kind] = value;
      }
      this.save();
    };
    for (const [kind, { real, watch }] of Object.entries(current)) {
      const before = previous?.kinds?.[kind];
      const level = real?.level ?? 0;
      const watchLevel = watch?.level ?? 0;
      const value = { level, watch: watchLevel };
      next.kinds[kind] = value;
      if (!previous) {
        continue; // baseline
      }
      // A real warning replacing a watch fires even at the same level.
      const issued =
        (real &&
          (!before || level > (before.level ?? 0) || (before.level === 0 && before.watch > 0))) ||
        (!real && watch && (!before || watchLevel > (before.watch ?? 0)));
      if (issued) {
        events.push({
          key: WARNING_ISSUED_TRIGGER,
          data: this.issuedData(area, real ?? watch, context),
          commit: commit(kind, value),
        });
      }
    }
    if (previous) {
      for (const [kind, before] of Object.entries(previous.kinds ?? {})) {
        if (current[kind]) {
          continue;
        }
        // Gone because its end time passed on our clock: the DWD must have
        // answered after that time, else it may still extend it.
        const ended = this.lastEnd(area.key, kind);
        if (ended !== undefined && ended <= now && fetchedAt < ended) {
          next.kinds[kind] = before;
          continue;
        }
        events.push({
          key: WARNING_ENDED_TRIGGER,
          data: this.endedData(area, kind, before, context),
          commit: commit(kind, undefined),
        });
      }
    }
    // Remember the end times, to tell "extended" from "ended" next time.
    this.ends ??= {};
    this.ends[area.key] = Object.fromEntries(
      Object.entries(current).map(([kind, { real, watch }]) => [
        kind,
        Math.max(real?.expiresMs ?? 0, watch?.expiresMs ?? 0) || undefined,
      ]),
    );
    if (!previous) {
      this.memory[area.key] = next;
      this.save();
    }
    return events;
  }

  lastEnd(areaKey, kind) {
    return this.ends?.[areaKey]?.[kind];
  }

  eventBase(area, kind, level, context) {
    const { language } = context;
    return {
      area: area.key,
      area_name: area.name ?? '',
      type: kind,
      type_name: KIND_NAMES[language][kind] ?? kind,
      level,
      level_name: LEVEL_NAMES[language][level] ?? '',
      house: area.house ?? '',
    };
  }

  issuedData(area, warning, context) {
    const base = this.eventBase(area, warning.kind, warning.level, context);
    const onset = warning.onsetMs;
    const active = !warning.watch && (onset === undefined || onset <= context.now);
    return {
      ...base,
      title: warningTitle(warning, context.language),
      start: onset === undefined ? '' : when(onset, context),
      end: warning.expiresMs === undefined ? '' : when(warning.expiresMs, context),
      start_iso: warning.start ?? '',
      end_iso: warning.end ?? '',
      in_force: active,
      watch: Boolean(warning.watch),
      description: truncate(warning.description?.[context.language] ?? '', MAX_EVENT_TEXT),
      instruction: truncate(warning.instruction, MAX_EVENT_TEXT),
      summary: `${base.area_name ? `${base.area_name}: ` : ''}${warningTitle(warning, context.language)}${
        warning.expiresMs === undefined ? '' : `, ${when(warning.expiresMs, context)}`
      }`,
    };
  }

  endedData(area, kind, before, context) {
    const level = before.level || before.watch || 0;
    const base = this.eventBase(area, kind, level, context);
    return {
      ...base,
      title: `${base.type_name} (${LEVEL_NAMES[context.language][level] ?? ''})`,
    };
  }
}
