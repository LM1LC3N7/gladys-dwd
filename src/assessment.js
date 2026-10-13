// -----------------------------------------------------------------------------
// The optional synthetic alerts built from the pollen forecast and from the
// air quality index.
// -----------------------------------------------------------------------------

import { POLLEN_NAMES, getPollenLevel, peakPollen, pollenDay } from './pollen.js';
import { airQualityLevelOf, getAirQualityLevel } from './airQuality.js';
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

// From a poor air quality on; "very poor" is a severity increase of the
// same alert.
const AIR_QUALITY_SEVERITY = { poor: 'moderate', very_poor: 'severe' };

/**
 * Air quality alert of the current UBA index (opt-in, `air_quality_alerts`).
 * One event text whatever the level, so a rise from poor to very poor
 * updates the alert instead of creating a second one.
 * @param {object | undefined} airQuality see src/sources/ubaAirQuality.js
 */
export function airQualityAlerts(airQuality) {
  const current = airQuality?.current;
  const levelKey = airQualityLevelOf(current?.index);
  const severity = AIR_QUALITY_SEVERITY[levelKey];
  if (!severity) {
    return [];
  }
  const level = getAirQualityLevel(levelKey);
  const where = airQuality.station.name;
  const main = current.main?.name;
  return [
    {
      id: 'air_quality',
      severity,
      event: { en: 'Poor air quality (UBA index)', fr: 'Mauvaise qualité de l’air (indice UBA)' },
      description: {
        en: `Air quality ${level.label.en.toLowerCase()} at ${where}${main ? ` (${main.en.toLowerCase()})` : ''}. ${level.advice.en} From the Umweltbundesamt index, not an official warning.`,
        fr: `Qualité de l’air ${level.label.fr.toLowerCase()} à ${where}${main ? ` (${main.fr.toLowerCase()})` : ''}. ${level.advice.fr} D’après l’indice de l’Umweltbundesamt, ce n’est pas un avertissement officiel.`,
      },
    },
  ];
}
