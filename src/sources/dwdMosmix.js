// -----------------------------------------------------------------------------
// MOSMIX_L: the DWD point forecasts, one kmz per station, 10 days hour by
// hour, issued at 03, 09, 15 and 21 UTC.
//
// https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/<id>/kml/MOSMIX_L_LATEST_<id>.kmz
//
// The kml lists the time steps once, then one <dwd:Forecast> per element
// with as many values as steps ("-" for none). Units are SI: kelvin,
// pascal, metres, m/s, seconds, kJ/m². Everything leaves here in the pivot
// metric units (°C, hPa, km, m/s, mm), cut into local calendar days.
// -----------------------------------------------------------------------------

import { DWD_OPENDATA_URL } from '../constants.js';
import { fetchBuffer } from '../http.js';
import { unzipFirst } from '../zip.js';
import { CONDITIONS, mosmixCondition, severityRank } from '../conditions.js';
import { apparentTemperature, humidityFromDewPoint } from '../apparent.js';
import { isDaylight } from '../sun.js';
import { localDate } from '../pivot.js';
import { num, round } from '../units.js';

export const MOSMIX_SOURCE = 'mosmix';

export function mosmixUrl(stationId) {
  const id = encodeURIComponent(stationId);
  return `${DWD_OPENDATA_URL}/weather/local_forecasts/mos/MOSMIX_L/single_stations/${id}/kml/MOSMIX_L_LATEST_${id}.kmz`;
}

// The elements read, by MOSMIX name.
const ELEMENTS = {
  TTT: 'temperature', // K
  Td: 'dew_point', // K
  FF: 'wind_speed', // m/s
  DD: 'wind_direction', // degrees
  FX1: 'wind_gust', // m/s, max of the last hour
  PPPP: 'pressure', // Pa
  N: 'cloud_cover', // %
  VV: 'visibility', // m
  ww: 'ww', // WMO present weather
  RR1c: 'precipitation', // mm, last hour
  R101: 'precipitation_probability', // %, more than 0.1 mm within the last hour
  SunD1: 'sunshine', // s, last hour
  TX: 'tx', // K, max of the last 12 h (at 06 and 18 UTC)
  TN: 'tn', // K, min of the last 12 h (at 06 and 18 UTC)
};

const kelvin = (k) => (k === undefined ? undefined : k - 273.15);

/** The raw columns of a MOSMIX kml: time steps and one array per element. */
export function parseKml(kml) {
  const steps = [...kml.matchAll(/<dwd:TimeStep>([^<]+)<\/dwd:TimeStep>/g)].map((m) =>
    new Date(m[1].trim()).toISOString(),
  );
  if (steps.length === 0) {
    throw new Error('MOSMIX: no time steps in the kml');
  }
  const columns = {};
  for (const match of kml.matchAll(
    /<dwd:Forecast dwd:elementName="([^"]+)">\s*<dwd:value>([^<]*)<\/dwd:value>/g,
  )) {
    const key = ELEMENTS[match[1]];
    if (!key) {
      continue;
    }
    const values = match[2].trim().split(/\s+/);
    if (values.length !== steps.length) {
      continue;
    }
    columns[key] = values.map((v) => (v === '-' ? undefined : num(v)));
  }
  const name = /<kml:description>([^<]*)<\/kml:description>/.exec(kml)?.[1]?.trim();
  const issued = /<dwd:IssueTime>([^<]+)<\/dwd:IssueTime>/.exec(kml)?.[1]?.trim();
  const point = /<kml:coordinates>([^<]+)<\/kml:coordinates>/.exec(kml)?.[1]?.trim().split(',');
  return {
    name,
    issued: issued ? new Date(issued).toISOString() : undefined,
    longitude: num(point?.[0]),
    latitude: num(point?.[1]),
    elevation: num(point?.[2]),
    steps,
    columns,
  };
}

/** One pivot-like hour from the columns at index `i`. */
function parseHour(parsed, i, latitude, longitude) {
  const { columns, steps } = parsed;
  const at = (key) => columns[key]?.[i];
  const temperature = kelvin(at('temperature'));
  if (temperature === undefined) {
    return undefined;
  }
  const dewPoint = kelvin(at('dew_point'));
  const humidity = humidityFromDewPoint(temperature, dewPoint);
  const windSpeed = at('wind_speed');
  const pressure = at('pressure');
  const visibility = at('visibility');
  const hour = {
    datetime: steps[i],
    temperature: round(temperature, 1),
    apparent_temperature: round(
      apparentTemperature({ temperature, humidity, wind_speed: windSpeed }),
      1,
    ),
    dew_point: round(dewPoint, 1),
    humidity: round(humidity, 0),
    pressure: pressure === undefined ? undefined : round(pressure / 100, 1),
    wind_speed: round(windSpeed, 1),
    wind_direction: round(at('wind_direction'), 0),
    wind_gust: round(at('wind_gust'), 1),
    visibility: visibility === undefined ? undefined : round(visibility / 1000, 1),
    cloud_cover: round(at('cloud_cover'), 0),
    precipitation: round(at('precipitation'), 1),
    precipitation_probability: round(at('precipitation_probability'), 0),
    sunshine_minutes: at('sunshine') === undefined ? undefined : Math.round(at('sunshine') / 60),
    weather: mosmixCondition(at('ww'), at('cloud_cover')),
    is_day: isDaylight(steps[i], latitude, longitude),
  };
  for (const key of Object.keys(hour)) {
    if (hour[key] === undefined) {
      delete hour[key];
    }
  }
  return hour;
}

// Daytime, in local hours, for the condition that names the day.
const DAY_START = 7;
const DAY_END = 19;

/**
 * The condition of a day: the most severe condition seen at least twice in
 * the daytime hours, else the most frequent daytime condition.
 */
export function dayCondition(hours) {
  const counts = new Map();
  for (const hour of hours) {
    counts.set(hour.weather, (counts.get(hour.weather) ?? 0) + 1);
  }
  let best;
  for (const [condition, count] of counts) {
    const rank = severityRank(condition);
    const candidate = { condition, count, rank };
    if (!best) {
      best = candidate;
      continue;
    }
    const significant = count >= 2 || rank <= severityRank(CONDITIONS.CLOUD);
    const bestSignificant = best.count >= 2 || best.rank <= severityRank(CONDITIONS.CLOUD);
    if (significant && !bestSignificant) {
      best = candidate;
    } else if (significant === bestSignificant && rank > best.rank) {
      best = candidate;
    }
  }
  return best?.condition;
}

const mean = (values) =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;

/**
 * Cut the hours into local calendar days. A day needs its full daytime to
 * be kept (the first day of a file issued at 21 UTC is tonight only: the
 * minimum of the night still counts for tomorrow, through TN).
 */
export function buildDays(parsed, hours, utcOffsetMinutes) {
  const byDate = new Map();
  for (const hour of hours) {
    const date = localDate(hour.datetime, utcOffsetMinutes);
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date).push(hour);
  }
  // The 12-hour extremes, dated to the local day their window ends in (a
  // window ending at 06 UTC belongs to the night before: the minimum of the
  // night is the minimum of the day it starts).
  const extremes = new Map();
  parsed.steps.forEach((step, i) => {
    const tx = kelvin(parsed.columns.tx?.[i]);
    const tn = kelvin(parsed.columns.tn?.[i]);
    if (tx === undefined && tn === undefined) {
      return;
    }
    const endsAt = Date.parse(step);
    const date = localDate(new Date(endsAt - 2 * 3_600_000).toISOString(), utcOffsetMinutes);
    const entry = extremes.get(date) ?? {};
    if (tx !== undefined) {
      entry.max = Math.max(entry.max ?? -Infinity, tx);
    }
    if (tn !== undefined) {
      entry.min = Math.min(entry.min ?? Infinity, tn);
    }
    extremes.set(date, entry);
  });

  const days = [];
  for (const [date, dayHours] of byDate) {
    const localHour = (h) =>
      new Date(Date.parse(h.datetime) + utcOffsetMinutes * 60_000).getUTCHours();
    const daytime = dayHours.filter((h) => localHour(h) >= DAY_START && localHour(h) <= DAY_END);
    if (daytime.length < DAY_END - DAY_START - 2) {
      continue;
    }
    const temperatures = dayHours.map((h) => h.temperature);
    const extra = extremes.get(date) ?? {};
    const min = Math.min(...temperatures, extra.min ?? Infinity);
    const max = Math.max(...temperatures, extra.max ?? -Infinity);
    const precipitation = dayHours.filter((h) => Number.isFinite(h.precipitation));
    const hourlyProbability = dayHours
      .map((h) => h.precipitation_probability)
      .filter(Number.isFinite);
    const day = {
      date,
      temperature_min: round(min, 1),
      temperature_max: round(max, 1),
      weather: dayCondition(daytime),
      humidity: round(mean(dayHours.map((h) => h.humidity).filter(Number.isFinite)), 0),
      wind_speed: round(mean(daytime.map((h) => h.wind_speed).filter(Number.isFinite)), 1),
      wind_direction: round(
        daytime.find((h) => Number.isFinite(h.wind_direction))?.wind_direction,
        0,
      ),
      wind_gust: round(Math.max(...dayHours.map((h) => h.wind_gust ?? -Infinity)), 1),
      precipitation:
        precipitation.length > 0
          ? round(
              precipitation.reduce((a, h) => a + h.precipitation, 0),
              1,
            )
          : undefined,
      precipitation_probability: round(
        extra.probability ??
          (hourlyProbability.length ? Math.max(...hourlyProbability) : undefined),
        0,
      ),
      sunshine_minutes: dayHours.some((h) => Number.isFinite(h.sunshine_minutes))
        ? dayHours.reduce((a, h) => a + (h.sunshine_minutes ?? 0), 0)
        : undefined,
    };
    for (const key of Object.keys(day)) {
      if (day[key] === undefined || day[key] === -Infinity) {
        delete day[key];
      }
    }
    days.push(day);
  }
  return days;
}

/**
 * Snapshot of a MOSMIX kml: the hours (from one hour before `now`), the
 * days, and the station it describes.
 */
export function parseMosmix(kml, { latitude, longitude, utcOffsetMinutes = 0, now = Date.now() }) {
  const parsed = parseKml(kml);
  const lat = parsed.latitude ?? latitude;
  const lon = parsed.longitude ?? longitude;
  const hours = parsed.steps
    .map((_, i) => parseHour(parsed, i, lat, lon))
    .filter(Boolean)
    .filter((hour) => Date.parse(hour.datetime) >= now - 3_600_000);
  if (hours.length === 0) {
    throw new Error('MOSMIX: the forecast file holds no future hour');
  }
  return {
    source: MOSMIX_SOURCE,
    station: parsed.name,
    issued: parsed.issued,
    utcOffsetMinutes,
    hours,
    days: buildDays(parsed, hours, utcOffsetMinutes),
  };
}

export async function fetchMosmix(stationId, { timeout } = {}) {
  const kmz = await fetchBuffer(mosmixUrl(stationId), { timeout });
  // The kml declares ISO-8859-1; the station names are plain ASCII anyway.
  return new TextDecoder('latin1').decode(unzipFirst(kmz).data);
}
