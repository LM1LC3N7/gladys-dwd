// -----------------------------------------------------------------------------
// The pollen forecast of the DWD ("Pollenflug-Gefahrenindex"): eight pollen
// types, today, tomorrow and the day after, for 27 regions of Germany,
// published once a day around 11:00.
//
//   region  https://maps.dwd.de/geoserver/dwd/ows (dwd:Pollenfluggebiete, WFS,
//           the region containing the house, read once a day)
//   index   https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json
//
// Values are "0", "0-1", "1", "1-2", "2", "2-3", "3" (none, none to low, low,
// low to moderate, moderate, moderate to high, high). Kept as numbers (0 to
// 3, halves for the in-between values); the levels live in src/pollen.js.
// -----------------------------------------------------------------------------

import { DWD_GEOSERVER_URL, DWD_OPENDATA_URL } from '../constants.js';
import { fetchJson } from '../http.js';
import { num } from '../units.js';

export const POLLEN_INDEX_URL = `${DWD_OPENDATA_URL}/climate_environment/health/alerts/s31fg.json`;

export function pollenRegionUrl(latitude, longitude) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: 'dwd:Pollenfluggebiete',
    outputFormat: 'application/json',
    propertyName: 'ID,GF,GEN',
    CQL_FILTER: `INTERSECTS(THE_GEOM,POINT(${latitude.toFixed(4)} ${longitude.toFixed(4)}))`,
  });
  return `${DWD_GEOSERVER_URL}/ows?${params}`;
}

import { POLLEN_KEYS_IN_SEASON_ORDER as POLLEN_KEYS } from '../pollen.js';

/** "2-3" -> 2.5, "1" -> 1; undefined for anything else. */
export function pollenValue(text) {
  const match = /^\s*(\d)(?:\s*-\s*(\d))?\s*$/.exec(String(text ?? ''));
  if (!match) {
    return undefined;
  }
  const low = num(match[1]);
  const high = match[2] === undefined ? low : num(match[2]);
  return (low + high) / 2;
}

/** The pollen region (its id and name) of a WFS answer, or undefined. */
export function parseRegion(body) {
  const feature = body?.features?.[0];
  const id = num(feature?.properties?.GF);
  if (id === undefined) {
    return undefined;
  }
  return { id, name: feature.properties.GEN ?? String(id) };
}

// "2026-10-12 11:00 Uhr" -> the date, as the DWD writes it.
const fileDate = (text) => /^(\d{4}-\d{2}-\d{2})/.exec(String(text ?? ''))?.[1];

/**
 * The forecast of one region out of the index file: one entry per day
 * (`date`, local calendar date) with the value of each pollen.
 */
export function parsePollen(body, regionId) {
  // A region without part regions (Berlin and Brandenburg) is listed once,
  // with a part region id of -1: the WFS cell then carries the region id.
  const content = body?.content?.find(
    (c) =>
      num(c?.partregion_id) === regionId ||
      (num(c?.partregion_id) === -1 && num(c?.region_id) === regionId),
  );
  const today = fileDate(body?.last_update);
  if (!content || !today) {
    return undefined;
  }
  const dayAfter = (days) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const days = [
    ['today', today],
    ['tomorrow', dayAfter(1)],
    ['dayafter_to', dayAfter(2)],
  ].map(([field, date]) => {
    const values = {};
    for (const key of POLLEN_KEYS) {
      const v = pollenValue(content.Pollen?.[key]?.[field]);
      if (v !== undefined) {
        values[key] = v;
      }
    }
    return { date, values };
  });
  return {
    region: {
      id: regionId,
      name: content.partregion_name || content.region_name || String(regionId),
    },
    area: content.region_name,
    issued: today,
    nextUpdate: fileDate(body.next_update),
    days,
  };
}

export async function fetchPollenRegion(latitude, longitude, { timeout } = {}) {
  return parseRegion(await fetchJson(pollenRegionUrl(latitude, longitude), { timeout }));
}

export async function fetchPollen(region, { timeout } = {}) {
  const body = await fetchJson(POLLEN_INDEX_URL, { timeout });
  return parsePollen(body, region.id);
}
