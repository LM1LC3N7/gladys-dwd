// -----------------------------------------------------------------------------
// Configuration screen buttons (manifest `actions`).
//
// `test_sources` asks each DWD source once, bypassing the caches, for the
// first located house and the typed warn cells, and reports what answered:
// the quickest way to tell a change on the DWD side from a network problem.
// `find_warncell` searches the municipalities by name and gives their ids.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HTTP_TIMEOUT } from './constants.js';
import { isInGermanyArea } from './geo.js';
import { signed } from './i18n.js';
import { formatPollen, peakPollen } from './pollen.js';
import { NoStationError } from './provider.js';
import { fetchCellWarnings, fetchWarnings, searchCells } from './sources/dwdWarnings.js';
import { fetchPollen, fetchPollenRegion } from './sources/dwdPollen.js';
import { fetchAirQuality } from './sources/ubaAirQuality.js';
import { getAirQualityLevel, airQualityLevelOf } from './airQuality.js';

const logger = createLogger({ name: 'actions' });

const both = (en, fr, de = en) => ({ en, fr, de });

async function probe(label, task) {
  try {
    const detail = await task();
    return {
      ok: true,
      en: `${label.en}: OK${detail.en}`,
      fr: `${label.fr} : OK${detail.fr}`,
      de: `${label.de}: OK${detail.de ?? detail.en}`,
    };
  } catch (err) {
    logger.warn(`${label.en} test failed: ${err.message}`);
    return {
      ok: false,
      en: `${label.en}: failed (${err.message})`,
      fr: `${label.fr} : échec (${err.message})`,
      de: `${label.de}: fehlgeschlagen (${err.message})`,
    };
  }
}

export function createActions({ watcher, provider, getConfig, now = Date.now }) {
  return {
    async test_sources() {
      const house = watcher.findHouse();
      const timeout = HTTP_TIMEOUT;
      const results = [];
      if (!house) {
        results.push(
          both(
            'No located house: place your house on the map in Gladys.',
            'Aucune maison localisée : placez votre maison sur la carte dans Gladys.',
            'Kein Zuhause mit Standort: platziere dein Zuhause in Gladys auf der Karte.',
          ),
        );
      } else {
        const { latitude, longitude } = house;
        results.push(
          await probe(both('Forecasts', 'Prévisions', 'Vorhersage'), async () => {
            const snapshot = await provider.fetchSnapshot(latitude, longitude);
            const t = `${signed(Math.round(snapshot.current.temperature))} °C`;
            const km = Math.round(snapshot.forecastStation.distanceKm ?? 0);
            const where = snapshot.observingStation
              ? both(
                  `measured at ${snapshot.observingStation.name}`,
                  `mesuré à ${snapshot.observingStation.name}`,
                  `gemessen in ${snapshot.observingStation.name}`,
                )
              : both(
                  'forecast, no station measuring nearby',
                  'prévu, aucune station de mesure à proximité',
                  'Vorhersage, keine Messstation in der Nähe',
                );
            return {
              en: ` (${snapshot.station}, ${km} km, ${t} ${where.en})`,
              fr: ` (${snapshot.station}, ${km} km, ${t} ${where.fr})`,
              de: ` (${snapshot.station}, ${km} km, ${t} ${where.de})`,
            };
          }),
        );
        if (!isInGermanyArea(latitude, longitude)) {
          results.push(
            both(
              'Warnings, pollen and air quality: not available outside Germany',
              'Avertissements, pollens et qualité de l’air : indisponibles hors d’Allemagne',
              'Warnungen, Pollen und Luftqualität: außerhalb Deutschlands nicht verfügbar',
            ),
          );
        } else {
          if (getConfig().official_alerts) {
            results.push(
              await probe(both('Warnings', 'Avertissements', 'Warnungen'), async () => {
                const n = (await fetchWarnings(latitude, longitude, { timeout, now: now() }))
                  .length;
                return { en: `, ${n} in force`, fr: `, ${n} en cours`, de: `, ${n} aktiv` };
              }),
            );
          }
          results.push(
            await probe(both('Pollen', 'Pollens', 'Pollen'), async () => {
              const region = await fetchPollenRegion(latitude, longitude, { timeout });
              if (!region) {
                return both(
                  ' (no pollen region here)',
                  ' (aucune région pollinique ici)',
                  ' (keine Pollenregion hier)',
                );
              }
              const pollen = await fetchPollen(region, { timeout });
              const peak = peakPollen(pollen?.days?.[0]);
              const index = peak ? formatPollen(peak.value) : '–';
              return {
                en: ` (${region.name}, index ${index})`,
                fr: ` (${region.name}, indice ${index})`,
                de: ` (${region.name}, Index ${index})`,
              };
            }),
          );
          results.push(
            await probe(both('Air quality', 'Qualité de l’air', 'Luftqualität'), async () => {
              const station = await provider.findAirStation(latitude, longitude);
              if (!station) {
                return both(
                  ' (no measuring station within 50 km)',
                  ' (aucune station de mesure à moins de 50 km)',
                  ' (keine Messstation im Umkreis von 50 km)',
                );
              }
              const air = await fetchAirQuality(station, { timeout, now: now() });
              const level = getAirQualityLevel(airQualityLevelOf(air?.current?.index));
              const km = Math.round(station.distanceKm);
              return {
                en: ` (${station.name}, ${km} km, ${level?.label.en ?? 'no recent index'})`,
                fr: ` (${station.name}, ${km} km, ${level?.label.fr ?? 'pas d’indice récent'})`,
                de: ` (${station.name}, ${km} km, ${level?.label.de ?? 'kein aktueller Index'})`,
              };
            }),
          );
        }
      }
      for (const area of watcher.cellAreas()) {
        results.push(
          await probe(
            both(`Cell ${area.cellId}`, `Cellule ${area.cellId}`, `Zelle ${area.cellId}`),
            async () => {
              if (area.unknown) {
                throw new Error('unknown warn cell id');
              }
              const n = (await fetchCellWarnings(area.cellId, { timeout, now: now() })).length;
              return {
                en: ` (${area.name}, ${n} in force)`,
                fr: ` (${area.name}, ${n} en cours)`,
                de: ` (${area.name}, ${n} aktiv)`,
              };
            },
          ),
        );
      }
      return {
        en: results.map((r) => r.en).join(' · '),
        fr: results.map((r) => r.fr).join(' · '),
        de: results.map((r) => r.de).join(' · '),
      };
    },

    async find_warncell(fields = {}) {
      const query = String(fields.query ?? '').trim();
      if (query.length < 2) {
        return both(
          'Enter at least two letters of the municipality name.',
          'Saisissez au moins deux lettres du nom de la commune.',
          'Gib mindestens zwei Buchstaben des Gemeindenamens ein.',
        );
      }
      let cells;
      try {
        cells = await searchCells(query, { timeout: HTTP_TIMEOUT });
      } catch (err) {
        logger.warn(`Warn cell search failed: ${err.message}`);
        return both(
          `The DWD does not answer (${err.message}).`,
          `Le DWD ne répond pas (${err.message}).`,
          `Der DWD antwortet nicht (${err.message}).`,
        );
      }
      if (cells.length === 0) {
        return both(
          `No DWD municipality matches "${query}".`,
          `Aucune commune du DWD ne correspond à « ${query} ».`,
          `Keine DWD-Gemeinde passt zu „${query}“.`,
        );
      }
      const list = cells
        .map((c) => `${c.name}${c.district ? ` (${c.district})` : ''}: ${c.id}`)
        .join(' · ');
      return both(
        `Warn cells: ${list}. Add the id to “Additional warn cells”.`,
        `Cellules d’alerte : ${list}. Ajoutez l’identifiant dans « Cellules d’alerte supplémentaires ».`,
        `Warnzellen: ${list}. Trage die ID unter „Zusätzliche Warnzellen“ ein.`,
      );
    },
  };
}

export { NoStationError };
