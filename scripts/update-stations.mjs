// -----------------------------------------------------------------------------
// Regenerates data/stations.json from the DWD MOSMIX station catalog and the
// list of stations with hourly observations (the "poi" reports).
//
//   npm run update-stations
//
// The catalog is a fixed-width text file (ID, ICAO, NAME, LAT, LON, ELEV),
// its coordinates written as degrees and minutes ("52.28" is 52°28', so
// 52.47°: the kml of the station says so), converted to decimal degrees;
// MOSMIX covers about 5,600 stations worldwide, the table keeps Europe (the
// warnings, radar, pollen and UV data of the DWD cover Germany only, the
// forecasts and observations do not). Each row: [id, name, lat, lon, elev,
// obs] with obs = 1 when the station has an observation report.
// -----------------------------------------------------------------------------

import { writeFile } from 'node:fs/promises';

const CATALOG_URL =
  'https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/mosmix_stationskatalog.cfg?view=nasPublication&nn=16102';
const POI_URL = 'https://opendata.dwd.de/weather/weather_reports/poi/';
const USER_AGENT = 'gladys-dwd/update-stations (+https://github.com/LM1LC3N7/gladys-dwd)';
// Europe, from the Azores to the Urals and from the Mediterranean to Svalbard.
const BOUNDS = { minLat: 34, maxLat: 81, minLon: -32, maxLon: 45 };

async function text(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${url}`);
  }
  // The catalog is ISO-8859-1 (umlauts in station names).
  return new TextDecoder('latin1').decode(await response.arrayBuffer());
}

const catalog = await text(CATALOG_URL);
const poiPage = await text(POI_URL);
const observed = new Set([...poiPage.matchAll(/href="([0-9A-Z]+)-BEOB\.csv"/g)].map((m) => m[1]));

// "52.28" -> 52 degrees 28 minutes -> 52.467; "-8.40" -> -8°40' -> -8.667.
function degreesMinutes(text) {
  const match = /^\s*(-?)(\d+)\.(\d{2})\s*$/.exec(text);
  if (!match) {
    return NaN;
  }
  const value = Number(match[2]) + Number(match[3]) / 60;
  return Math.round((match[1] ? -value : value) * 1000) / 1000;
}

const rows = [];
for (const line of catalog.split('\n').slice(2)) {
  if (!line.trim()) {
    continue;
  }
  const id = line.slice(0, 5).trim();
  const name = line.slice(11, 31).trim();
  const lat = degreesMinutes(line.slice(32, 38));
  const lon = degreesMinutes(line.slice(39, 46));
  const elev = Number(line.slice(47).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    continue;
  }
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    continue;
  }
  rows.push([id, name, lat, lon, Number.isFinite(elev) ? elev : 0, observed.has(id) ? 1 : 0]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));

const lines = rows.map((row) => JSON.stringify(row));
const generated = new Date().toISOString().slice(0, 10);
await writeFile(
  new URL('../data/stations.json', import.meta.url),
  `{\n"generated": "${generated}",\n"stations": [\n${lines.join(',\n')}\n]\n}\n`,
);
console.log(`${rows.length} stations (${rows.filter((r) => r[5]).length} with observations)`);
