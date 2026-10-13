import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WarningTracker, byKind } from '../src/sceneTriggers.js';
import { createMemoryStore } from '../src/store.js';
import { parseWarnings } from '../src/sources/dwdWarnings.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';

const AREA = { key: 'home', name: 'Home', house: 'Home', timeZone: 'Europe/Berlin' };
const warnings = (now = FIXTURE_NOW) => parseWarnings(fixture('warnings-berlin.json'), now);

function tracker({ store = createMemoryStore(), now = FIXTURE_NOW } = {}) {
  const clock = { now };
  const t = new WarningTracker({ store, now: () => clock.now });
  return { t, store, clock };
}

test('byKind keeps the highest warning of each kind, watches apart', () => {
  const kinds = byKind([
    { kind: 'wind', level: 1, watch: false },
    { kind: 'wind', level: 2, watch: false },
    { kind: 'wind', level: 3, watch: true },
    { kind: 'fog', level: 1, watch: false },
  ]);
  assert.equal(kinds.wind.real.level, 2);
  assert.equal(kinds.wind.watch.level, 3);
  assert.equal(kinds.fog.real.level, 1);
});

test('the first evaluation is a baseline, then new warnings and higher levels fire "issued"', () => {
  const { t, store, clock } = tracker();
  assert.deepEqual(t.evaluate(AREA, warnings(), FIXTURE_NOW, { language: 'en' }), []);
  assert.deepEqual(Object.keys(JSON.parse(store.files.get('warnings.json')).areas.home.kinds), [
    'wind',
    'frost',
  ]);
  // The same answer again: nothing.
  assert.deepEqual(t.evaluate(AREA, warnings(), FIXTURE_NOW, {}), []);
  // Storm gusts raised to severe, and a new thunderstorm.
  const raised = warnings().map((w) =>
    w.kind === 'wind' ? { ...w, level: 3, severity: 'severe' } : w,
  );
  raised.push({
    ...raised[0],
    id: 'x',
    kind: 'thunderstorm',
    level: 2,
    event: { en: 'Thunderstorm', fr: 'Orage', de: 'GEWITTER' },
    headline: 'Amtliche WARNUNG vor GEWITTER',
  });
  clock.now += 60_000;
  const events = t.evaluate(AREA, raised, clock.now, { language: 'fr' });
  assert.deepEqual(
    events.map((e) => [e.key, e.data.type, e.data.level]),
    [
      ['warning_issued', 'wind', 3],
      ['warning_issued', 'thunderstorm', 2],
    ],
  );
  const wind = events[0].data;
  assert.equal(wind.area, 'home');
  assert.equal(wind.area_name, 'Home');
  assert.equal(wind.level_name, 'Fortes intempéries');
  assert.equal(wind.type_name, 'Vent');
  assert.equal(wind.title, 'Rafales de tempête (niveau 3)');
  assert.equal(wind.start, '14:00');
  assert.equal(wind.end, 'demain 00:00');
  assert.equal(wind.in_force, false);
  assert.ok(wind.description.startsWith('Es treten Sturmböen'));
  // Not committed yet: the memory still says level 2.
  assert.equal(JSON.parse(store.files.get('warnings.json')).areas.home.kinds.wind.level, 2);
  events[0].commit();
  assert.equal(JSON.parse(store.files.get('warnings.json')).areas.home.kinds.wind.level, 3);
});

test('a warning gone fires "ended" once the DWD answered after its end time', () => {
  const { t, clock } = tracker();
  t.evaluate(AREA, warnings(), FIXTURE_NOW, {});
  // 23:30 UTC: the gusts expired at 22:00 on our clock, the frost still runs.
  clock.now = Date.parse('2026-10-13T23:30:00Z');
  const still = warnings(clock.now); // the parser drops the expired gusts
  assert.deepEqual(
    still.map((w) => w.kind),
    ['frost'],
  );
  // The answer was fetched before the end: the DWD may extend it, wait.
  assert.deepEqual(t.evaluate(AREA, still, Date.parse('2026-10-13T21:50:00Z'), {}), []);
  // An answer after the end time: ended.
  const events = t.evaluate(AREA, still, clock.now, { language: 'de' });
  assert.deepEqual(
    events.map((e) => [e.key, e.data.type, e.data.level, e.data.title]),
    [['warning_ended', 'wind', 2, 'Wind (Markantes Wetter)']],
  );
  events[0].commit();
  assert.deepEqual(t.evaluate(AREA, still, clock.now, {}), []);
});

test('a real warning replacing a watch fires even at the same level', () => {
  const { t, clock } = tracker();
  const watch = [{ ...warnings()[0], watch: true, kind: 'thunderstorm', level: 2, id: 'w' }];
  t.evaluate(AREA, watch, FIXTURE_NOW, {});
  clock.now += 60_000;
  const real = [{ ...watch[0], watch: false, id: 'r' }];
  const events = t.evaluate(AREA, real, clock.now, { language: 'en' });
  assert.equal(events.length, 1);
  assert.equal(events[0].data.watch, false);
});

test('the memory survives a restart and forgets the areas left', () => {
  const { t, store } = tracker();
  t.evaluate(AREA, warnings(), FIXTURE_NOW, {});
  const again = new WarningTracker({ store, now: () => FIXTURE_NOW + 60_000 });
  assert.deepEqual(again.evaluate(AREA, warnings(), FIXTURE_NOW + 60_000, {}), []);
  again.keepOnly(['other']);
  assert.deepEqual(JSON.parse(store.files.get('warnings.json')).areas, {});
});
