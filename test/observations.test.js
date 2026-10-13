import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentObservation, parseObservations } from '../src/sources/dwdObservations.js';
import { BERLIN, FIXTURE_NOW, fixtureText } from './helpers/fakeFetch.js';

const csv = fixtureText('poi-10384.csv');

test('parseObservations reads the rows newest first, decimal commas and all', () => {
  const rows = parseObservations(csv);
  assert.equal(rows.length, 25);
  assert.equal(rows[0].datetime, '2026-10-13T01:00:00.000Z');
  assert.equal(rows[0].temperature, 3.6);
  assert.equal(rows[0].dew_point, 3.5);
  assert.equal(rows[0].pressure, 1025.6);
  assert.equal(rows[0].wind_speed, 2); // km/h, converted later
  assert.equal(rows[0].present_weather, 5);
  assert.equal(rows[0].cloud_cover, 0);
  // "---" is absent, not zero.
  assert.equal(rows[0].sunshine_minutes, undefined);
  // 00:00 UTC: gust of the last hour 2 km/h, calm from the north.
  assert.equal(rows[1].wind_gust, 2);
  assert.equal(rows[1].wind_direction, 0);
});

test('currentObservation converts to the pivot units', () => {
  const current = currentObservation(parseObservations(csv), {
    ...BERLIN,
    now: FIXTURE_NOW,
    maxAge: 3 * 3_600_000,
  });
  assert.equal(current.datetime, '2026-10-13T01:00:00.000Z');
  assert.equal(current.temperature, 3.6);
  assert.equal(current.wind_speed, 0.6); // 2 km/h
  assert.equal(current.wind_gust, 1.1); // 4 km/h
  assert.equal(current.humidity, 99);
  assert.equal(current.weather, 'fog');
  assert.equal(current.is_day, false);
  assert.equal(current.observed, true);
  assert.ok(current.apparent_temperature < current.temperature);
});

test('a stale report is not "now"', () => {
  const rows = parseObservations(csv);
  const later = Date.parse('2026-10-13T05:30:00Z');
  assert.equal(
    currentObservation(rows, { ...BERLIN, now: later, maxAge: 3 * 3_600_000 }),
    undefined,
  );
  assert.ok(currentObservation(rows, { ...BERLIN, now: later, maxAge: 6 * 3_600_000 }));
});

test('rows without a temperature are skipped, garbage ignored', () => {
  const broken = `${csv.split('\n').slice(0, 3).join('\n')}\nbroken line\n13.10.26;01:00;---;---\n`;
  assert.equal(parseObservations(broken).length, 1);
  assert.equal(
    currentObservation(parseObservations(broken), { ...BERLIN, now: FIXTURE_NOW }),
    undefined,
  );
  assert.deepEqual(parseObservations(''), []);
});
