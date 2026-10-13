import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestUvCity, parseUv } from '../src/sources/dwdUv.js';
import { uvAt } from '../src/provider.js';
import { fixture } from './helpers/fakeFetch.js';

test('the nearest UV city, within the limit', () => {
  assert.equal(nearestUvCity(52.52, 13.4).name, 'Berlin');
  assert.equal(nearestUvCity(48.2, 11.9).name, 'München');
  assert.equal(nearestUvCity(48.85, 2.35), undefined); // Paris
});

test('parseUv dates the forecast of a city', () => {
  const uv = parseUv(fixture('uvi.json'), 'Berlin');
  assert.equal(uv.issued, '2026-10-12');
  assert.deepEqual(uv.byDate, { '2026-10-12': 2, '2026-10-13': 2, '2026-10-14': 2 });
  assert.equal(parseUv(fixture('uvi.json'), 'Nowhere'), undefined);
});

test('uvAt follows the sun', () => {
  assert.equal(uvAt('2026-06-21T02:00:00Z', 6, 52.5, 13.4), 0);
  const noon = uvAt('2026-06-21T11:00:00Z', 6, 52.5, 13.4);
  const evening = uvAt('2026-06-21T17:00:00Z', 6, 52.5, 13.4);
  assert.ok(noon > 5 && noon <= 6, `noon ${noon}`);
  assert.ok(evening > 0 && evening < noon, `evening ${evening}`);
  assert.equal(uvAt('2026-06-21T11:00:00Z', undefined, 52.5, 13.4), undefined);
});
