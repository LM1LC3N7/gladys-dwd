// -----------------------------------------------------------------------------
// Configuration screen buttons (manifest `actions`).
//
// `test_sources` asks each DWD source once, bypassing the caches, for the
// first located house, and reports what answered: the quickest way to tell
// a change on the DWD side from a network problem.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HTTP_TIMEOUT } from './constants.js';
import { isInGermanyArea } from './geo.js';
import { signed } from './i18n.js';
import { formatPollen, peakPollen } from './pollen.js';
import { NoStationError } from './provider.js';
import { fetchWarnings } from './sources/dwdWarnings.js';
import { fetchPollen, fetchPollenRegion } from './sources/dwdPollen.js';

const logger = createLogger({ name: 'actions' });

async function probe(label, task) {
  try {
    const detail = await task();
    return { ok: true, en: `${label.en}: OK${detail.en}`, fr: `${label.fr} : OK${detail.fr}` };
  } catch (err) {
    logger.warn(`${label.en} test failed: ${err.message}`);
    return {
      ok: false,
      en: `${label.en}: failed (${err.message})`,
      fr: `${label.fr} : échec (${err.message})`,
    };
  }
}

export function createActions({ watcher, provider, getConfig, now = Date.now }) {
  return {
    async test_sources() {
      const house = watcher.findHouse();
      if (!house) {
        return {
          en: 'No location: place your house on the map in Gladys, then try again.',
          fr: 'Aucune position : placez votre maison sur la carte dans Gladys, puis réessayez.',
        };
      }
      const { latitude, longitude } = house;
      const timeout = HTTP_TIMEOUT;
      const results = [
        await probe({ en: 'Forecasts', fr: 'Prévisions' }, async () => {
          const snapshot = await provider.fetchSnapshot(latitude, longitude);
          const t = `${signed(Math.round(snapshot.current.temperature))} °C`;
          const km = Math.round(snapshot.forecastStation.distanceKm ?? 0);
          const where = snapshot.observingStation
            ? {
                en: `measured at ${snapshot.observingStation.name}`,
                fr: `mesuré à ${snapshot.observingStation.name}`,
              }
            : {
                en: 'forecast, no station measuring nearby',
                fr: 'prévu, aucune station de mesure à proximité',
              };
          return {
            en: ` (${snapshot.station}, ${km} km, ${t} ${where.en})`,
            fr: ` (${snapshot.station}, ${km} km, ${t} ${where.fr})`,
          };
        }),
      ];
      if (!isInGermanyArea(latitude, longitude)) {
        results.push({
          en: 'Warnings and pollen: not available outside Germany',
          fr: 'Avertissements et pollens : indisponibles hors d’Allemagne',
        });
      } else {
        if (getConfig().official_alerts) {
          results.push(
            await probe({ en: 'Warnings', fr: 'Avertissements' }, async () => {
              const n = (await fetchWarnings(latitude, longitude, { timeout, now: now() })).length;
              return { en: `, ${n} in force`, fr: `, ${n} en cours` };
            }),
          );
        }
        results.push(
          await probe({ en: 'Pollen', fr: 'Pollens' }, async () => {
            const region = await fetchPollenRegion(latitude, longitude, { timeout });
            if (!region) {
              return { en: ' (no pollen region here)', fr: ' (aucune région pollinique ici)' };
            }
            const pollen = await fetchPollen(region, { timeout });
            const peak = peakPollen(pollen?.days?.[0]);
            const index = peak ? formatPollen(peak.value) : '–';
            return {
              en: ` (${region.name}, index ${index})`,
              fr: ` (${region.name}, indice ${index})`,
            };
          }),
        );
      }
      return {
        en: results.map((r) => r.en).join(' · '),
        fr: results.map((r) => r.fr).join(' · '),
      };
    },
  };
}

export { NoStationError };
