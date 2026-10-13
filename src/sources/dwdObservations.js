// -----------------------------------------------------------------------------
// The hourly observations ("poi" reports): one csv per synoptic station,
// the last 24 hours, newest first, refreshed every hour.
//
// https://opendata.dwd.de/weather/weather_reports/poi/<id>-BEOB.csv
//
// Three header lines (English parameter names, units, German labels), then
// one row per hour: date "dd.mm.yy", time "HH:MM" (UTC), values with a
// decimal comma, "---" for none. About 630 of the MOSMIX stations have one.
// -----------------------------------------------------------------------------

import { DWD_OPENDATA_URL } from '../constants.js';
import { fetchText } from '../http.js';
import { observationCondition } from '../conditions.js';
import { apparentTemperature, dewPointFromHumidity } from '../apparent.js';
import { isDaylight } from '../sun.js';
import { kmhToMs, num, round } from '../units.js';

export function observationsUrl(stationId) {
  return `${DWD_OPENDATA_URL}/weather/weather_reports/poi/${encodeURIComponent(stationId)}-BEOB.csv`;
}

// Column name (first header line) -> field. The wind names carry stray
// spaces in the DWD header: matched after normalization.
const COLUMNS = {
  dry_bulb_temperature_at_2_meter_above_ground: 'temperature',
  dew_point_temperature_at_2_meter_above_ground: 'dew_point',
  relative_humidity: 'humidity',
  pressure_reduced_to_mean_sea_level: 'pressure',
  mean_wind_speed_during_last_10_min_at_10_meters_above_ground: 'wind_speed',
  mean_wind_direction_during_last_10_min_at_10_meters_above_ground: 'wind_direction',
  maximum_wind_speed_last_hour: 'wind_gust',
  horizontal_visibility: 'visibility',
  cloud_cover_total: 'cloud_cover',
  precipitation_amount_last_hour: 'precipitation',
  present_weather: 'present_weather',
  total_time_of_sunshine_during_last_hour: 'sunshine_minutes',
  global_radiation_last_hour: 'radiation',
};

const normalizeName = (name) => name.trim().toLowerCase().replaceAll(/\s+/g, '_');

const value = (cell) => {
  const text = String(cell ?? '').trim();
  return text === '---' || text === '' ? undefined : num(text.replace(',', '.'));
};

/** Every row of a poi csv as a plain object, newest first. */
export function parseObservations(csv) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 4) {
    return [];
  }
  const header = lines[0].split(';').map(normalizeName);
  const fields = header.map((name) => COLUMNS[name]);
  const rows = [];
  for (const line of lines.slice(3)) {
    const cells = line.split(';');
    const [date, time] = cells;
    const match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(date?.trim() ?? '');
    if (!match || !/^\d{2}:\d{2}$/.test(time?.trim() ?? '')) {
      continue;
    }
    const row = {
      datetime: `20${match[3]}-${match[2]}-${match[1]}T${time.trim()}:00.000Z`,
    };
    fields.forEach((field, i) => {
      if (field) {
        const v = value(cells[i]);
        if (v !== undefined) {
          row[field] = v;
        }
      }
    });
    rows.push(row);
  }
  return rows.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime));
}

/**
 * The current conditions of a station: the newest row with a temperature,
 * no older than `maxAge`; undefined when there is none.
 */
export function currentObservation(rows, { latitude, longitude, now = Date.now(), maxAge }) {
  const row = rows.find(
    (r) => Number.isFinite(r.temperature) && (!maxAge || now - Date.parse(r.datetime) <= maxAge),
  );
  if (!row) {
    return undefined;
  }
  const dewPoint = row.dew_point ?? dewPointFromHumidity(row.temperature, row.humidity);
  const windSpeed = row.wind_speed === undefined ? undefined : kmhToMs(row.wind_speed);
  const current = {
    datetime: row.datetime,
    temperature: round(row.temperature, 1),
    apparent_temperature: round(
      apparentTemperature({
        temperature: row.temperature,
        humidity: row.humidity,
        wind_speed: windSpeed,
      }),
      1,
    ),
    dew_point: round(dewPoint, 1),
    humidity: round(row.humidity, 0),
    pressure: round(row.pressure, 1),
    wind_speed: round(windSpeed, 1),
    wind_direction: round(row.wind_direction, 0),
    wind_gust: row.wind_gust === undefined ? undefined : round(kmhToMs(row.wind_gust), 1),
    visibility: round(row.visibility, 1),
    cloud_cover: round(row.cloud_cover, 0),
    precipitation: round(row.precipitation, 1),
    sunshine_minutes: row.sunshine_minutes,
    weather: observationCondition(row.present_weather, row.cloud_cover),
    is_day: isDaylight(row.datetime, latitude, longitude),
    observed: true,
  };
  for (const key of Object.keys(current)) {
    if (current[key] === undefined) {
      delete current[key];
    }
  }
  return current;
}

export async function fetchObservations(stationId, { timeout } = {}) {
  const csv = await fetchText(observationsUrl(stationId), { timeout, charset: 'latin1' });
  return parseObservations(csv);
}
