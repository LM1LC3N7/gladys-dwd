import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeZoneOf, utcOffsetMinutes, zoneOffsetMinutes } from '../src/timezone.js';

test('European cities land in their zone', () => {
  const cases = [
    ['Berlin', 52.52, 13.4, 'Europe/Berlin'],
    ['Paris', 48.85, 2.35, 'Europe/Berlin'],
    ['Madrid', 40.42, -3.7, 'Europe/Berlin'],
    ['Lisbon', 38.72, -9.14, 'Europe/Lisbon'],
    ['London', 51.5, -0.12, 'Europe/London'],
    ['Dublin', 53.35, -6.26, 'Europe/London'],
    ['Jersey', 49.21, -2.13, 'Europe/London'],
    ['Brest', 48.39, -4.49, 'Europe/Berlin'],
    ['Reykjavik', 64.15, -21.94, 'Atlantic/Reykjavik'],
    ['Helsinki', 60.17, 24.94, 'Europe/Helsinki'],
    ['Vaasa', 63.1, 21.6, 'Europe/Helsinki'],
    ['Luleå', 65.58, 22.15, 'Europe/Berlin'],
    ['Tromsø', 69.65, 18.96, 'Europe/Berlin'],
    ['Tallinn', 59.44, 24.75, 'Europe/Riga'],
    ['Vilnius', 54.69, 25.28, 'Europe/Riga'],
    ['Kaliningrad', 54.71, 20.51, 'Europe/Kaliningrad'],
    ['Minsk', 53.9, 27.57, 'Europe/Minsk'],
    ['Warsaw', 52.23, 21.01, 'Europe/Berlin'],
    ['Kyiv', 50.45, 30.52, 'Europe/Kyiv'],
    ['Bucharest', 44.43, 26.1, 'Europe/Kyiv'],
    ['Athens', 37.98, 23.73, 'Europe/Kyiv'],
    ['Sofia', 42.7, 23.32, 'Europe/Kyiv'],
    ['Belgrade', 44.79, 20.45, 'Europe/Berlin'],
    ['Istanbul', 41.01, 28.98, 'Europe/Istanbul'],
    ['Moscow', 55.76, 37.62, 'Europe/Moscow'],
    ['St Petersburg', 59.93, 30.32, 'Europe/Moscow'],
    ['Nicosia', 35.17, 33.36, 'Asia/Nicosia'],
    ['Las Palmas', 28.12, -15.43, 'Atlantic/Canary'],
    ['Tunis', 36.8, 10.18, 'Africa/Algiers'],
  ];
  for (const [city, lat, lon, zone] of cases) {
    assert.equal(timeZoneOf(lat, lon), zone, city);
  }
});

test('offsets follow daylight saving time', () => {
  assert.equal(zoneOffsetMinutes('Europe/Berlin', Date.parse('2026-07-01T12:00:00Z')), 120);
  assert.equal(zoneOffsetMinutes('Europe/Berlin', Date.parse('2026-12-01T12:00:00Z')), 60);
  assert.equal(zoneOffsetMinutes('Europe/London', Date.parse('2026-12-01T12:00:00Z')), 0);
  assert.equal(zoneOffsetMinutes('Not/AZone'), undefined);
  assert.equal(utcOffsetMinutes(52.52, 13.4, Date.parse('2026-10-13T00:00:00Z')), 120);
});
