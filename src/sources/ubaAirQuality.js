// -----------------------------------------------------------------------------
// The air quality index of the Umweltbundesamt (UBA), the German federal
// environment agency: hourly, at about 400 measuring stations of the Länder
// networks. Open data (dl-de/by-2-0), no key.
//
//   https://luftdaten.umweltbundesamt.de/api/air-data/v3
//   meta/json?use=airquality&date_from=…  the stations with an index in a
//                                          period, with their coordinates
//   airquality/json?station=…&date_from=…  the index hour by hour: for each
//                                          hour [end, index, incomplete,
//                                          [component, value, index, ratio]…]
//
// Dates and times are in CET all year round (the UBA says "MEZ", no summer
// time): "2026-10-13 15:00:00" is the hour starting 14:00 UTC. The index is
// 0 (very good) to 4 (very poor); the component ids are those of
// src/airQuality.js (5 NO2, 3 O3, 1 PM10, 9 PM2.5).
// -----------------------------------------------------------------------------

import { UBA_API_URL } from '../constants.js';
import { fetchJson } from '../http.js';
import { distanceKm } from '../geo.js';
import { num } from '../units.js';
import { POLLUTANTS } from '../airQuality.js';

// A station measures the air of its surroundings: farther than this, it
// says little of the air at the house.
export const MAX_STATION_DISTANCE_KM = 50;
// An index older than this is not "now" any more (the UBA publishes with
// one to two hours of delay).
const MAX_AGE = 3 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
// The UBA clock: CET without summer time.
const CET_OFFSET_MS = 60 * 60 * 1000;

/** "2026-10-13 15:00:00" (CET) -> ms since the epoch. */
export function parseCet(text) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  if (!match) {
    return undefined;
  }
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) - CET_OFFSET_MS;
}

/** The CET calendar date of an instant, as the API wants it. */
export function cetDate(ms) {
  return new Date(ms + CET_OFFSET_MS).toISOString().slice(0, 10);
}

// The period the requests cover: from yesterday (the 24-hour maximum) to
// the end of today, CET.
function periodParams(now) {
  return {
    date_from: cetDate(now - 24 * HOUR),
    time_from: '1',
    date_to: cetDate(now),
    time_to: '24',
  };
}

export function stationsUrl(now) {
  const params = new URLSearchParams({ use: 'airquality', lang: 'en', ...periodParams(now) });
  return `${UBA_API_URL}/meta/json?${params}`;
}

export function airQualityUrl(stationCode, now) {
  const params = new URLSearchParams({
    station: stationCode,
    lang: 'en',
    ...periodParams(now),
  });
  return `${UBA_API_URL}/airquality/json?${params}`;
}

/**
 * The stations of a meta answer: code, name, coordinates and setting
 * ("background", "traffic", "industry").
 */
export function parseStations(body) {
  return Object.values(body?.stations ?? {})
    .map((row) => ({
      id: String(row?.[0] ?? ''),
      code: String(row?.[1] ?? ''),
      name: String(row?.[2] ?? ''),
      city: String(row?.[3] ?? ''),
      longitude: num(row?.[7]),
      latitude: num(row?.[8]),
      setting: String(row?.[16] ?? ''),
    }))
    .filter((s) => /^DE[A-Z]{2}\d{3}$/.test(s.code) && Number.isFinite(s.latitude));
}

/**
 * The nearest station of a list, within MAX_STATION_DISTANCE_KM, with its
 * distance; or the station of a code when one is forced.
 */
export function nearestStation(stations, latitude, longitude, { code } = {}) {
  if (code) {
    const forced = stations.find((s) => s.code === code);
    return forced
      ? {
          ...forced,
          distanceKm: distanceKm(latitude, longitude, forced.latitude, forced.longitude),
        }
      : undefined;
  }
  const nearest = stations
    .map((s) => ({ ...s, distanceKm: distanceKm(latitude, longitude, s.latitude, s.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  return nearest && nearest.distanceKm <= MAX_STATION_DISTANCE_KM ? nearest : undefined;
}

/**
 * The index of a station out of an airquality answer: the latest complete
 * hour (at most 3 hours old) with its pollutants, and the worst hour of the
 * last 24 hours. `undefined` when nothing recent is known.
 */
export function parseAirQuality(body, station, now = Date.now()) {
  const data = body?.data ?? {};
  const rows = Object.values(data).flatMap((hours) =>
    Object.entries(hours ?? {}).map(([start, row]) => ({
      start: parseCet(start),
      end: parseCet(row?.[0]),
      index: num(row?.[1]),
      incomplete: num(row?.[2]) === 1,
      components: (Array.isArray(row) ? row.slice(3) : [])
        .map((c) => ({
          pollutant: POLLUTANTS[num(c?.[0])],
          value: num(c?.[1]),
          index: num(c?.[2]),
        }))
        .filter((c) => c.pollutant && Number.isFinite(c.value) && Number.isInteger(c.index)),
    })),
  );
  const hours = rows
    .filter((r) => Number.isFinite(r.end) && Number.isInteger(r.index) && r.end <= now + 5 * 60_000)
    .sort((a, b) => a.end - b.end);
  const current = hours.at(-1);
  if (!current || now - current.end > MAX_AGE) {
    return undefined;
  }
  const last24 = hours.filter((h) => h.end > current.end - 24 * HOUR);
  const peak = last24.reduce((max, h) => (max && max.index >= h.index ? max : h), undefined);
  // The pollutant that sets the index: the worst one, ties to the first.
  const main = current.components.reduce(
    (worst, c) => (worst && worst.index >= c.index ? worst : c),
    undefined,
  );
  return {
    station,
    current: {
      index: current.index,
      datetime: new Date(current.end).toISOString(),
      incomplete: current.incomplete,
      components: current.components,
      main: main?.pollutant,
    },
    peak: peak ? { index: peak.index, datetime: new Date(peak.end).toISOString() } : undefined,
    hours: last24.map((h) => ({ datetime: new Date(h.end).toISOString(), index: h.index })),
  };
}

export async function fetchStations({ timeout, now = Date.now() } = {}) {
  return parseStations(await fetchJson(stationsUrl(now), { timeout }));
}

export async function fetchAirQuality(station, { timeout, now = Date.now() } = {}) {
  const body = await fetchJson(airQualityUrl(station.code, now), { timeout });
  return parseAirQuality(body, station, now);
}
