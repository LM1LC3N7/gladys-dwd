import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollen, parseRegion, pollenValue } from '../src/sources/dwdPollen.js';
import {
  crossedPollenLevels,
  formatPollen,
  peakPollen,
  pollenDay,
  pollenLevelOf,
} from '../src/pollen.js';
import { pollenAlerts } from '../src/assessment.js';
import { fixture } from './helpers/fakeFetch.js';

test('the DWD values become numbers, halves for the in-between ones', () => {
  assert.equal(pollenValue('0'), 0);
  assert.equal(pollenValue('2-3'), 2.5);
  assert.equal(pollenValue(' 1 - 2 '), 1.5);
  assert.equal(pollenValue('x'), undefined);
  assert.equal(pollenValue(undefined), undefined);
});

test('parseRegion reads the region of the house', () => {
  assert.deepEqual(parseRegion(fixture('pollen-region-berlin.json')), {
    id: 50,
    name: 'Brandenburg und Berlin',
  });
  assert.equal(parseRegion({ features: [] }), undefined);
});

test('parsePollen dates the three days from the file and finds the region', () => {
  const pollen = parsePollen(fixture('pollen-s31fg.json'), 50);
  assert.equal(pollen.region.name, 'Brandenburg und Berlin');
  assert.equal(pollen.issued, '2026-10-12');
  assert.equal(pollen.nextUpdate, '2026-10-13');
  assert.deepEqual(
    pollen.days.map((d) => d.date),
    ['2026-10-12', '2026-10-13', '2026-10-14'],
  );
  assert.equal(pollen.days[0].values.Ambrosia, 0.5);
  assert.equal(pollen.days[0].values.Birke, 0);
  // A part region.
  assert.equal(parsePollen(fixture('pollen-s31fg.json'), 11).region.name, 'Inseln und Marschen');
  assert.equal(parsePollen(fixture('pollen-s31fg.json'), 999), undefined);
});

test('levels, labels and crossings', () => {
  assert.equal(pollenLevelOf(0), 'none');
  assert.equal(pollenLevelOf(0.5), 'low');
  assert.equal(pollenLevelOf(1.5), 'moderate');
  assert.equal(pollenLevelOf(3), 'high');
  assert.equal(pollenLevelOf(undefined), undefined);
  assert.equal(formatPollen(2.5), '2-3');
  assert.equal(formatPollen(1), '1');
  assert.deepEqual(crossedPollenLevels('none', 'high'), [
    { level: 'low', direction: 'worsening' },
    { level: 'moderate', direction: 'worsening' },
    { level: 'high', direction: 'worsening' },
  ]);
  assert.deepEqual(crossedPollenLevels('moderate', 'low'), [
    { level: 'low', direction: 'improving' },
  ]);
});

test('peakPollen names the pollen at the top', () => {
  const day = { date: '2026-04-20', values: { Birke: 3, Esche: 2, Graeser: 3, Hasel: 0 } };
  assert.deepEqual(peakPollen(day), { value: 3, level: 'high', keys: ['Birke', 'Graeser'] });
  assert.equal(peakPollen({ values: {} }), undefined);
  assert.equal(pollenDay({ days: [day] }, '2026-04-20'), day);
});

test('the pollen alert starts at a moderate exposure, one text whatever the level', () => {
  const pollen = {
    region: { id: 120, name: 'Allgäu' },
    days: [{ date: '2026-04-20', values: { Birke: 2 } }],
  };
  const now = Date.parse('2026-04-20T10:00:00Z');
  const [alert] = pollenAlerts(pollen, now);
  assert.equal(alert.severity, 'minor');
  assert.equal(alert.event.fr, 'Pollens (indice DWD)');
  assert.ok(alert.description.en.includes('birch'));
  pollen.days[0].values.Birke = 3;
  assert.equal(pollenAlerts(pollen, now)[0].severity, 'moderate');
  pollen.days[0].values.Birke = 1;
  assert.deepEqual(pollenAlerts(pollen, now), []);
  assert.deepEqual(pollenAlerts(undefined, now), []);
});
