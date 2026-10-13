import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  converters,
  localDate,
  pivotAlerts,
  textLanguage,
  toPivot,
  upcomingHours,
} from '../src/pivot.js';

test('textLanguage picks French or English', () => {
  assert.equal(textLanguage('fr'), 'fr');
  assert.equal(textLanguage('fr-CA'), 'fr');
  assert.equal(textLanguage('de'), 'en');
  assert.equal(textLanguage(undefined), 'en');
});

test('converters round in the requested units', () => {
  const us = converters('us');
  assert.equal(us.temperature(20), 68);
  assert.equal(us.speed(10), 22.4);
  assert.equal(us.precipitation(25.4), 1);
  assert.equal(us.distance(1.609344), 1);
  assert.equal(converters('metric').temperature(undefined), undefined);
});

test('localDate uses the UTC offset', () => {
  assert.equal(localDate('2026-10-13T23:30:00Z', 120), '2026-10-14');
  assert.equal(localDate('2026-10-13T23:30:00Z', 0), '2026-10-13');
});

test('pivotAlerts truncates and picks the language', () => {
  const alerts = pivotAlerts(
    [
      {
        severity: 'severe',
        type: 'wind',
        event: { en: 'x'.repeat(150), fr: 'y' },
        description: { en: 'd'.repeat(6000) },
        start: '2026-10-13T12:00:00.000Z',
      },
    ],
    'fr',
  );
  assert.equal(alerts[0].event, 'y');
  assert.equal(alerts[0].description.length, 5000);
  assert.equal(alerts[0].type, 'wind');
  assert.equal(alerts[0].start, '2026-10-13T12:00:00.000Z');
});

test('toPivot keeps 24 hours from the current one and the days from today', () => {
  const now = Date.parse('2026-10-13T10:15:00Z');
  const hours = Array.from({ length: 40 }, (_, i) => ({
    datetime: new Date(Date.parse('2026-10-13T00:00:00Z') + i * 3_600_000).toISOString(),
    temperature: 10 + i / 10,
    weather: 'clear',
    is_day: true,
  }));
  const snapshot = {
    utcOffsetMinutes: 120,
    current: {
      datetime: '2026-10-13T10:00:00.000Z',
      temperature: 11,
      weather: 'clear',
      is_day: true,
    },
    hours,
    days: [
      { date: '2026-10-12', temperature_min: 1, temperature_max: 2 },
      { date: '2026-10-13', temperature_min: 3, temperature_max: 4, weather: 'rain' },
    ],
  };
  const pivot = toPivot(snapshot, {
    latitude: 52.5,
    longitude: 13.4,
    units: 'metric',
    language: 'en',
    now,
  });
  assert.equal(pivot.hours.length, 24);
  assert.equal(pivot.hours[0].datetime, '2026-10-13T10:00:00.000Z');
  assert.ok(upcomingHours(snapshot, now).length >= 24);
  assert.deepEqual(
    pivot.days.map((d) => d.datetime),
    ['2026-10-13T10:00:00.000Z'],
  );
  assert.equal(pivot.days[0].weather, 'rain');
  assert.deepEqual(pivot.alerts, []);
  assert.equal(pivot.images, undefined);
});
