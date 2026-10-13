// -----------------------------------------------------------------------------
// The UV index forecast of the DWD: the daily maximum for 38 German cities,
// today, tomorrow and the day after, published once a day.
//
// https://opendata.dwd.de/climate_environment/health/alerts/uvi.json
//
// The file names the cities without coordinates: the table below places
// them (the DWD stations of the same name), so the nearest one is picked.
// -----------------------------------------------------------------------------

import { DWD_OPENDATA_URL, MAX_UV_DISTANCE_KM } from '../constants.js';
import { fetchJson } from '../http.js';
import { distanceKm } from '../geo.js';
import { num } from '../units.js';

export const UV_INDEX_URL = `${DWD_OPENDATA_URL}/climate_environment/health/alerts/uvi.json`;

// [city as the DWD writes it, latitude, longitude]
export const UV_CITIES = [
  ['Arkona', 54.68, 13.43],
  ['Berlin', 52.52, 13.4],
  ['Bonn', 50.73, 7.1],
  ['Bremen', 53.08, 8.8],
  ['Cottbus', 51.76, 14.33],
  ['Dresden', 51.05, 13.74],
  ['Düsseldorf', 51.23, 6.78],
  ['Frankfurt/Main', 50.11, 8.68],
  ['Freiburg', 47.99, 7.85],
  ['Großer Arber', 49.11, 13.13],
  ['Hahn', 49.95, 7.26],
  ['Hamburg', 53.55, 9.99],
  ['Hannover', 52.37, 9.74],
  ['Kahler Asten', 51.18, 8.49],
  ['Kassel', 51.31, 9.5],
  ['Kiel', 54.32, 10.14],
  ['Konstanz', 47.66, 9.18],
  ['Leipzig', 51.34, 12.37],
  ['List auf Sylt', 55.02, 8.44],
  ['Magdeburg', 52.13, 11.63],
  ['Marienleuchte', 54.5, 11.24],
  ['München', 48.14, 11.58],
  ['Neubrandenburg', 53.56, 13.26],
  ['Norderney', 53.71, 7.15],
  ['Nürnberg', 49.45, 11.08],
  ['Osnabrück', 52.27, 8.05],
  ['Regensburg', 49.01, 12.1],
  ['Rostock', 54.09, 12.14],
  ['Sankt Peter-Ording', 54.31, 8.6],
  ['Seehausen', 52.89, 11.73],
  ['Stuttgart', 48.78, 9.18],
  ['Ulm', 48.4, 9.99],
  ['Waren', 53.52, 12.68],
  ['Weimar', 50.98, 11.33],
  ['Weinbiet', 49.37, 8.12],
  ['Wernigerode', 51.83, 10.79],
  ['Würzburg', 49.79, 9.94],
  ['Zugspitze', 47.42, 10.98],
];

/** The nearest UV city of a location, with its distance; undefined when far. */
export function nearestUvCity(latitude, longitude, maxKm = MAX_UV_DISTANCE_KM) {
  let best;
  for (const [name, lat, lon] of UV_CITIES) {
    const distance = distanceKm(latitude, longitude, lat, lon);
    if (distance <= maxKm && (!best || distance < best.distance)) {
      best = { name, latitude: lat, longitude: lon, distance };
    }
  }
  return best;
}

/**
 * The UV forecast of a city out of the index file: `{ date: uvIndex }`,
 * dated from the file's forecast day.
 */
export function parseUv(body, cityName) {
  const city = body?.content?.find((c) => c?.city === cityName);
  const day = String(body?.forecast_day ?? '');
  if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return undefined;
  }
  const dayAfter = (days) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const byDate = {};
  for (const [field, date] of [
    ['today', day],
    ['tomorrow', dayAfter(1)],
    ['dayafter_to', dayAfter(2)],
  ]) {
    const v = num(city.forecast?.[field]);
    if (v !== undefined) {
      byDate[date] = v;
    }
  }
  return { city: cityName, issued: day, byDate };
}

export async function fetchUv(cityName, { timeout } = {}) {
  return parseUv(await fetchJson(UV_INDEX_URL, { timeout }), cityName);
}
