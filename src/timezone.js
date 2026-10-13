// -----------------------------------------------------------------------------
// Time zone of a European location (pure functions, no network).
//
// MOSMIX gives every time in UTC and no time zone, the pollen and UV indices
// are dated by calendar day: the forecast must still be cut into local
// days, and the widgets print local hours. The IANA zone is found from the
// coordinates (coarse country outlines, right for the places that have a
// station), and Node's ICU data gives the offset, daylight saving time
// included. Everything not listed is Central European Time.
// -----------------------------------------------------------------------------

import { inRing } from './geo.js';

// [zone, [minLat, maxLat, minLon, maxLon]]: checked first, in this order.
const BOXES = [
  ['Atlantic/Reykjavik', [63, 67.5, -25, -13]],
  ['America/Scoresbysund', [68, 84, -32, -17]],
  ['Atlantic/Azores', [36.5, 40, -31.5, -24.5]],
  ['Atlantic/Madeira', [32, 33.5, -17.5, -16]],
  ['Atlantic/Canary', [27, 29.7, -18.5, -13]],
  ['Europe/Kaliningrad', [54.3, 55.3, 19.6, 22.9]],
  ['Asia/Nicosia', [34.4, 35.8, 32.2, 34.7]],
];

// [zone, ring of [lon, lat]] (coarse outlines).
const RINGS = [
  [
    'Europe/London',
    [
      [-11, 51],
      [-6.2, 49.7],
      [-3, 49.6],
      [-2.7, 49.1],
      [-1.95, 49.1],
      [-1.95, 49.75],
      [1.5, 50.5],
      [2, 51],
      [2, 56],
      [0, 61.5],
      [-4.5, 62.6],
      [-8.5, 62.5],
      [-11, 55.5],
    ],
  ],
  [
    'Europe/Lisbon',
    [
      [-9.6, 36.9],
      [-7.4, 36.9],
      [-6.9, 38.2],
      [-7.5, 39.6],
      [-6.8, 40.3],
      [-6.9, 41.9],
      [-8.2, 42.2],
      [-9.5, 42.2],
    ],
  ],
  [
    'Europe/Helsinki',
    [
      [19.3, 59.6],
      [28.5, 59.6],
      [28.3, 61.3],
      [30.6, 62],
      [31.7, 63],
      [30, 64],
      [30.4, 66],
      [29.2, 67.3],
      [30.2, 68],
      [28.9, 69.1],
      [29.3, 69.8],
      [27.9, 70.2],
      [25.8, 70],
      [25.6, 69.2],
      [24, 68.8],
      [22, 68.6],
      [20.5, 69.1],
      [21, 68.4],
      [23.7, 67.4],
      [23.5, 66.2],
      [24.1, 65.7],
      [23.1, 64.9],
      [21.3, 63.6],
      [20.9, 62.5],
      [20.9, 61],
      [19.3, 60.6],
    ],
  ],
  [
    // Estonia, Latvia, Lithuania.
    'Europe/Riga',
    [
      [20.9, 56.1],
      [21, 53.9],
      [23.5, 53.9],
      [25.8, 54.15],
      [26.5, 55],
      [26.8, 55.7],
      [28.3, 56.1],
      [28.3, 57.5],
      [27.4, 57.5],
      [28.1, 59.5],
      [24, 59.9],
      [21.4, 59.3],
      [21.5, 57.5],
    ],
  ],
  [
    // Belarus (no daylight saving time, like Moscow).
    'Europe/Minsk',
    [
      [23.6, 51.5],
      [23.9, 52],
      [23.2, 52.3],
      [23.9, 53.1],
      [23.5, 53.9],
      [25.8, 54.15],
      [26.5, 55],
      [26.8, 55.7],
      [28.3, 56.1],
      [32.8, 56],
      [32.8, 52.3],
      [33, 52.3],
      [30.5, 51.3],
      [26, 51.9],
    ],
  ],
  [
    // Ukraine, Moldova, Romania, Bulgaria, Greece.
    'Europe/Kyiv',
    [
      [22.1, 48.3],
      [23.6, 51.5],
      [26, 51.9],
      [30.5, 51.3],
      [33, 52.3],
      [34.5, 51.3],
      [35.5, 50.4],
      [40.1, 49.6],
      [40, 47.5],
      [38.3, 46.5],
      [36, 45],
      [33.5, 44.3],
      [30.2, 45.3],
      [29.7, 44.9],
      [28.7, 43.3],
      [28, 41.9],
      [26.3, 41.7],
      [26.1, 40.5],
      [26.5, 39.5],
      [29.7, 36],
      [28.5, 35],
      [23.5, 34.5],
      [19.3, 39.6],
      [20, 40.9],
      [21, 40.9],
      [22.9, 41.4],
      [22.4, 42.3],
      [22.9, 43.3],
      [22.4, 44],
      [22.7, 44.3],
      [21.4, 44.8],
      [20.3, 46.1],
    ],
  ],
  [
    'Europe/Istanbul',
    [
      [26, 42.2],
      [45, 42.2],
      [45, 35.8],
      [36, 35.8],
      [30, 36],
      [28.5, 36.9],
      [26.7, 39.4],
      [26.1, 40.5],
    ],
  ],
];

/** IANA time zone of a location. */
export function timeZoneOf(latitude, longitude) {
  for (const [zone, [minLat, maxLat, minLon, maxLon]] of BOXES) {
    if (latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon) {
      return zone;
    }
  }
  for (const [zone, ring] of RINGS) {
    if (inRing(longitude, latitude, ring)) {
      return zone;
    }
  }
  if (longitude > 28.3 && latitude > 44) {
    return 'Europe/Moscow';
  }
  if (latitude < 38 && longitude > -13 && longitude < 12) {
    return 'Africa/Algiers';
  }
  if (longitude > 35.5 && latitude < 42) {
    return 'Asia/Baghdad';
  }
  if (longitude > 40 && latitude >= 41) {
    return 'Asia/Tbilisi';
  }
  return 'Europe/Berlin';
}

/** Offset of a time zone at an instant, in minutes east of UTC. */
export function zoneOffsetMinutes(timeZone, instant = Date.now()) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(instant))
      .find((part) => part.type === 'timeZoneName')?.value;
    const match = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(name ?? '');
    if (!match) {
      return undefined;
    }
    if (!match[1]) {
      return 0;
    }
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
  } catch {
    // An unknown zone (a runtime without ICU data): the caller falls back.
    return undefined;
  }
}

/**
 * UTC offset of a location at an instant: its time zone, else the solar
 * offset of its longitude (a whole hour, no daylight saving time).
 */
export function utcOffsetMinutes(latitude, longitude, instant = Date.now()) {
  return (
    zoneOffsetMinutes(timeZoneOf(latitude, longitude), instant) ?? Math.round(longitude / 15) * 60
  );
}
