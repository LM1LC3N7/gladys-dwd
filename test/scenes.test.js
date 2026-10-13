import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/scenes.js';
import { parseWarnings } from '../src/sources/dwdWarnings.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';

const home = { key: 'home', name: 'Home', timeZone: 'Europe/Berlin' };
const cabin = { key: 'cell:103359000', name: 'Kreis Stade', timeZone: 'Europe/Berlin' };

test('summarize writes one block per area with the levels', () => {
  const warnings = parseWarnings(fixture('warnings-berlin.json'), FIXTURE_NOW);
  const result = summarize(
    [
      { area: home, warnings },
      { area: cabin, warnings: [] },
      { area: { key: 'x', name: 'Pending' } },
    ],
    { now: FIXTURE_NOW, language: 'fr' },
  );
  assert.equal(result.count, 2);
  assert.equal(result.current_level, 0);
  assert.equal(result.upcoming_level, 2);
  assert.equal(result.upcoming_level_name, 'Temps marquant');
  assert.equal(
    result.summary,
    [
      'Home : 2 avertissements du DWD',
      '- Rafales de tempête (niveau 2), 14:00 – demain 00:00',
      '- Gel (niveau 1), 20:00 – demain 09:00',
      '',
      'Kreis Stade : aucun avertissement du DWD.',
      '',
      'Pending : avertissements pas encore lus.',
    ].join('\n'),
  );
  // In force at 15:00: "until".
  const later = Date.parse('2026-10-13T13:00:00Z');
  const active = summarize([{ area: home, warnings }], { now: later, language: 'de' });
  assert.equal(active.current_level, 2);
  assert.match(active.summary, /Amtliche WARNUNG vor STURMBÖEN, bis morgen 00:00/);
  assert.equal(
    summarize([], { now: FIXTURE_NOW, language: 'en' }).summary.startsWith('No area'),
    true,
  );
});
