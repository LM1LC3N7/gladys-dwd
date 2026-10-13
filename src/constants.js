// -----------------------------------------------------------------------------
// Shared constants: endpoints, timeouts, cache durations.
//
// Every duration is in milliseconds unless the name says otherwise.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const VERSION = pkg.version;

// Identifiable User-Agent: let the DWD know who calls its servers and where
// to reach the maintainers.
export const USER_AGENT = `gladys-dwd/${VERSION} (+https://github.com/LM1LC3N7/gladys-dwd)`;

// Open Data server (forecasts, observations, pollen, UV index).
export const DWD_OPENDATA_URL = 'https://opendata.dwd.de';
// GeoServer (warnings as WFS features, radar as WMS images).
export const DWD_GEOSERVER_URL = 'https://maps.dwd.de/geoserver/dwd';
// Umweltbundesamt air data (the German air quality index).
export const UBA_API_URL = 'https://luftdaten.umweltbundesamt.de/api/air-data/v3';

// Gladys awaits onWeatherGet under 15 s: the forecast file and the
// observations of a location are read in parallel, each under this limit.
export const HTTP_TIMEOUT = 6_000;

// MOSMIX_L is issued four times a day (03, 09, 15 and 21 UTC, online about
// an hour later), the observations every hour: 15 minutes between two reads
// of one location is already more than the data moves.
export const SNAPSHOT_TTL = 15 * 60 * 1000;
// Served when every source fails, rather than nothing.
export const SNAPSHOT_STALE_MAX_AGE = 6 * 60 * 60 * 1000;
export const ALERTS_TTL = 5 * 60 * 1000;
export const ALERTS_STALE_MAX_AGE = 60 * 60 * 1000;
// The pollen index is published once a day (11:00), the UV index once a day.
export const POLLEN_TTL = 60 * 60 * 1000;
export const POLLEN_STALE_MAX_AGE = 36 * 60 * 60 * 1000;
export const UV_TTL = 60 * 60 * 1000;
// The UBA index is hourly, published one to two hours later.
export const AIR_QUALITY_TTL = 15 * 60 * 1000;
export const AIR_QUALITY_STALE_MAX_AGE = 3 * 60 * 60 * 1000;
// The list of measuring stations moves rarely: read once a day.
export const AIR_STATIONS_TTL = 24 * 60 * 60 * 1000;
// The pollen region of a location never moves.
export const REGION_LOOKUP_TTL = 24 * 60 * 60 * 1000;
// The radar composite is updated every 5 minutes.
export const RADAR_TTL = 5 * 60 * 1000;

// Background loop: alerts every tick, forecasts when older than SNAPSHOT_TTL.
export const WATCH_INTERVAL = 5 * 60 * 1000;
// Gladys has no "house changed" event: re-read the houses regularly.
export const HOUSES_REFRESH_INTERVAL = 30 * 60 * 1000;

// Cache entries kept per kind (locations are rounded, a few houses at most).
export const MAX_CACHE_ENTRIES = 20;

// An observation older than this is not "now" any more: the forecast of the
// current hour stands in.
export const OBSERVATION_MAX_AGE = 3 * 60 * 60 * 1000;
// Beyond this, the observations describe another weather than the house's.
export const MAX_OBSERVATION_DISTANCE_KM = 60;
// MOSMIX has a point every few kilometres in Germany, a station per large
// town elsewhere in Europe: further than this, better say there is no weather.
export const MAX_STATION_DISTANCE_KM = 120;
// The UV index is forecast for 38 German cities: the nearest within this.
export const MAX_UV_DISTANCE_KM = 150;

// Pivot limits (contract B.18).
export const MAX_HOURS = 24;
export const MAX_DAYS = 8;
export const MAX_ALERTS = 10;
export const MAX_ALERT_EVENT_LENGTH = 100;
export const MAX_ALERT_DESCRIPTION_LENGTH = 5000;

export const RADAR_IMAGE_KEY = 'radar';
export const WARNINGS_WIDGET = 'warnings';
export const POLLEN_WIDGET = 'pollen';
export const AIR_QUALITY_WIDGET = 'air_quality';
export const POLLEN_TRIGGER = 'pollen_level_changed';
export const AIR_QUALITY_TRIGGER = 'air_quality_level_changed';
export const WARNING_ISSUED_TRIGGER = 'warning_issued';
export const WARNING_ENDED_TRIGGER = 'warning_ended';
export const GET_WARNINGS_ACTION = 'get_warnings';
// The widget tiles "now" and "later" move when a warning starts: re-read the
// cached warnings every minute, without network.
export const CLOCK_INTERVAL = 60 * 1000;
