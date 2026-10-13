// -----------------------------------------------------------------------------
// Scene trigger "pollen level changed" (manifest `scene_triggers`).
//
// The Gladys scene engine compares exact values, it has no thresholds: the
// DWD pollen index (0 to 3) is turned into discrete levels (src/pollen.js)
// and an event is fired per CROSSED level, so a scene filtered on
// "moderate" still fires when the index jumps straight from none to high.
//
// One event per transition, never one per poll; the first evaluation of a
// house is a baseline (a restart in the middle of the birch season must not
// fire every scene again). The level is the one of the highest pollen of
// the local day.
// -----------------------------------------------------------------------------

import { POLLEN_TRIGGER } from './constants.js';
import {
  POLLEN_NAMES,
  crossedPollenLevels,
  formatPollen,
  getPollenLevel,
  peakPollen,
  pollenDay,
} from './pollen.js';
import { textLanguage } from './pivot.js';

export const SCENE_TRIGGER_KEYS = [POLLEN_TRIGGER];

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
    const summary =
      lang === 'fr'
        ? `Pollens : exposition ${details.label.fr.toLowerCase()} aujourd’hui (${names}, indice ${formatPollen(peak.value)}). ${details.advice.fr}`
        : `Pollen: ${details.label.en.toLowerCase()} exposure today (${names}, index ${formatPollen(peak.value)}). ${details.advice.en}`;
    return crossedPollenLevels(previous, level).map(({ level: crossed, direction }) => ({
      key: POLLEN_TRIGGER,
      data: {
        level: crossed,
        direction,
        previous_level: previous,
        current_level: level,
        value: peak.value,
        pollen: peak.keys.map((key) => POLLEN_NAMES[key][lang]).join(', '),
        region: pollen.region.name,
        house: house.name ?? '',
        summary,
      },
    }));
  }
}
