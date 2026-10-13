import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDaylight, sunTimes } from '../src/sun.js';

const minutesBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

test('sunrise and sunset in Berlin agree with the almanac within 3 minutes', () => {
  // 13 October 2026, Berlin: sunrise 07:27 CEST, sunset 18:17 CEST.
  const { sunrise, sunset } = sunTimes('2026-10-13', 52.52, 13.4);
  assert.ok(minutesBetween(sunrise, '2026-10-13T05:27:00Z') < 3);
  assert.ok(minutesBetween(sunset, '2026-10-13T16:17:00Z') < 3);
});

test('no sunrise during the polar night', () => {
  assert.deepEqual(sunTimes('2026-12-21', 78.2, 15.6), {}); // Svalbard
});

test('day and night from the sun elevation', () => {
  assert.equal(isDaylight('2026-10-13T12:00:00Z', 52.52, 13.4), true);
  assert.equal(isDaylight('2026-10-13T02:00:00Z', 52.52, 13.4), false);
});
