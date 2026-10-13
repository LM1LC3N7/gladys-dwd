// -----------------------------------------------------------------------------
// The optional synthetic alert built from the pollen forecast.
// -----------------------------------------------------------------------------

import { POLLEN_NAMES, getPollenLevel, peakPollen, pollenDay } from './pollen.js';
import { localDate } from './pivot.js';
import { utcOffsetMinutes } from './timezone.js';

// From a moderate exposure on; "high" is a severity increase of the same
// alert (the core keys its alert diff on the event of an untyped alert).
const POLLEN_SEVERITY = { moderate: 'minor', high: 'moderate' };

/**
 * Pollen alert of the day (opt-in, `pollen_alerts`). One event text whatever
 * the level, so a rise from moderate to high updates the alert instead of
 * creating a second one.
 * @param {object | undefined} pollen see src/sources/dwdPollen.js
 */
export function pollenAlerts(pollen, now = Date.now(), { latitude = 51, longitude = 10 } = {}) {
  const today = localDate(new Date(now).toISOString(), utcOffsetMinutes(latitude, longitude, now));
  const peak = peakPollen(pollenDay(pollen, today));
  const severity = POLLEN_SEVERITY[peak?.level];
  if (!severity) {
    return [];
  }
  const level = getPollenLevel(peak.level);
  const names = (lang) => peak.keys.map((key) => POLLEN_NAMES[key][lang].toLowerCase()).join(', ');
  return [
    {
      id: 'pollen',
      severity,
      event: { en: 'Pollen (DWD index)', fr: 'Pollens (indice DWD)' },
      description: {
        en: `${level.label.en} pollen exposure in ${pollen.region.name} today: ${names('en')}. ${level.advice.en} From the DWD pollen index, not an official warning.`,
        fr: `Exposition aux pollens ${level.label.fr.toLowerCase()} aujourd’hui (${pollen.region.name}) : ${names('fr')}. ${level.advice.fr} D’après l’indice pollinique du DWD, ce n’est pas un avertissement officiel.`,
      },
    },
  ];
}
