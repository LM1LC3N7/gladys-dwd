import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipFirst } from '../src/zip.js';
import { buildDays, dayCondition, parseKml, parseMosmix } from '../src/sources/dwdMosmix.js';
import { BERLIN, FIXTURE_NOW, fixtureBuffer } from './helpers/fakeFetch.js';

const kml = unzipFirst(fixtureBuffer('mosmix-10384.kmz')).data.toString('latin1');

test('parseKml reads the station, the issue time and the columns', () => {
  const parsed = parseKml(kml);
  assert.equal(parsed.name, 'BERLIN-TEMPELHOF');
  assert.equal(parsed.issued, '2026-10-12T21:00:00.000Z');
  assert.equal(parsed.steps.length, 247);
  assert.equal(parsed.steps[0], '2026-10-12T22:00:00.000Z');
  assert.equal(parsed.latitude, 52.47);
  assert.equal(parsed.longitude, 13.4);
  assert.equal(parsed.columns.temperature.length, 247);
  assert.equal(parsed.columns.temperature[0], 279.15);
  assert.equal(parsed.columns.tx[0], undefined);
});

test('parseMosmix gives hours in pivot units, from one hour before now', () => {
  const snapshot = parseMosmix(kml, { ...BERLIN, utcOffsetMinutes: 120, now: FIXTURE_NOW });
  assert.equal(snapshot.source, 'mosmix');
  assert.equal(snapshot.station, 'BERLIN-TEMPELHOF');
  const first = snapshot.hours[0];
  assert.equal(first.datetime, '2026-10-13T02:00:00.000Z');
  assert.equal(first.temperature, 4); // 277.15 K
  assert.equal(first.pressure, 1025.4); // 102540 Pa
  assert.equal(first.visibility, 1.3); // 1300 m
  assert.equal(first.wind_speed, 0.5);
  assert.equal(first.humidity, 99);
  assert.equal(first.weather, 'clear');
  assert.equal(first.is_day, false);
  assert.ok(first.apparent_temperature < first.temperature);
  const noon = snapshot.hours.find((h) => h.datetime === '2026-10-13T14:00:00.000Z');
  assert.equal(noon.temperature, 14.5);
  assert.equal(noon.is_day, true);
  assert.equal(noon.weather, 'cloud');
  assert.equal(noon.sunshine_minutes, 22);
  // The rain of the night: WMO 61 is rain, 0.4 mm, 22 % chance.
  const rain = snapshot.hours.find((h) => h.datetime === '2026-10-14T00:00:00.000Z');
  assert.equal(rain.weather, 'rain');
  assert.equal(rain.precipitation, 0.4);
  assert.equal(rain.precipitation_probability, 22);
});

test('days are local calendar days with their extremes and sums', () => {
  const snapshot = parseMosmix(kml, { ...BERLIN, utcOffsetMinutes: 120, now: FIXTURE_NOW });
  assert.equal(snapshot.days.length, 10);
  const today = snapshot.days[0];
  assert.equal(today.date, '2026-10-13');
  assert.equal(today.temperature_min, 2.5); // TN of the night, below every hour
  assert.equal(today.temperature_max, 15.3); // TX at 18 UTC, above every hour
  assert.equal(today.precipitation, 0);
  assert.equal(today.precipitation_probability, 13);
  assert.equal(today.weather, 'cloud');
  assert.equal(today.sunshine_minutes, 316);
  const tomorrow = snapshot.days[1];
  assert.equal(tomorrow.date, '2026-10-14');
  assert.equal(tomorrow.precipitation, 0.4);
  assert.ok(tomorrow.temperature_min <= tomorrow.temperature_max);
  // The last file day (22 to 04 UTC) has no daytime: dropped.
  assert.equal(snapshot.days.at(-1).date, '2026-10-22');
});

test('a day without a full daytime is dropped', () => {
  const parsed = parseKml(kml);
  const few = parseMosmix(kml, { ...BERLIN, utcOffsetMinutes: 120, now: FIXTURE_NOW }).hours.slice(
    0,
    6,
  );
  assert.deepEqual(buildDays(parsed, few, 120), []);
});

test('the condition of a day is the most severe one seen twice', () => {
  const hour = (weather) => ({ weather });
  assert.equal(
    dayCondition([hour('clear'), hour('rain'), hour('rain'), hour('cloud'), hour('cloud')]),
    'rain',
  );
  // One thunderstorm hour does not name the day; the two rain hours do.
  assert.equal(
    dayCondition([hour('thunderstorm'), hour('rain'), hour('rain'), hour('clear'), hour('clear')]),
    'rain',
  );
  assert.equal(
    dayCondition([hour('clear'), hour('clear'), hour('partly-cloudy')]),
    'partly-cloudy',
  );
  assert.equal(dayCondition([]), undefined);
});

test('parseMosmix refuses a file without future hours', () => {
  assert.throws(
    () => parseMosmix(kml, { ...BERLIN, now: Date.parse('2026-11-01T00:00:00Z') }),
    /no future hour/,
  );
});
