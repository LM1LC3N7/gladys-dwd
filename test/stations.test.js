import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allStations, findStation, nearestStation } from '../src/stations.js';

test('the station table holds Europe with its observing stations', () => {
  const stations = allStations();
  assert.ok(stations.length > 4000);
  assert.ok(stations.filter((s) => s.observed).length > 500);
  const berlin = findStation('10384');
  assert.equal(berlin.name, 'BERLIN-TEMPELHOF');
  // Degrees and minutes of the catalog converted to decimal degrees.
  assert.equal(berlin.latitude, 52.467);
  assert.equal(berlin.longitude, 13.4);
  assert.equal(berlin.observed, true);
});

test('nearestStation finds the forecast point and the observing station', () => {
  assert.equal(nearestStation(52.52, 13.4).id, '10389');
  assert.equal(nearestStation(52.52, 13.4, { filter: (s) => s.observed }).id, '10384');
  assert.equal(nearestStation(48.85, 2.35).name, 'PARIS');
  assert.equal(nearestStation(45, -30, { maxKm: 120 }), undefined);
});
