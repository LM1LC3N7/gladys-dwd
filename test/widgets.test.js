import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildPollenContent, buildWarningsContent, createWidgets } from '../src/widgets.js';
import { parseWarnings } from '../src/sources/dwdWarnings.js';
import { parsePollen } from '../src/sources/dwdPollen.js';
import { WeatherProvider } from '../src/provider.js';
import { Watcher } from '../src/watcher.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { BERLIN, FIXTURE_NOW, berlinRoutes, fixture, installFetch } from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

test('the warnings widget lists the warnings in force, valid for the core', () => {
  const alerts = parseWarnings(fixture('warnings-berlin.json'), FIXTURE_NOW);
  const content = buildWarningsContent(alerts, {
    area: { name: 'Home', timeZone: 'Europe/Berlin' },
    now: FIXTURE_NOW,
    language: 'en',
    fetchedAt: FIXTURE_NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.fr, 'Temps marquant · 2');
  // Nothing in force at 02:30 UTC, level 2 later.
  assert.equal(content.components[1].value.en, 'None');
  assert.equal(content.components[2].value.de, 'Stufe 2');
  assert.equal(content.components[2].color, 'warning');
  const list = content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].title, 'Storm gusts (level 2)');
  assert.equal(list.items[0].subtitle, '14:00 – tomorrow 00:00');
  assert.equal(list.items[0].badge.color, 'warning');
  assert.ok(list.items[0].description.includes('Handlungsempfehlungen'));
  assert.equal(content.components.at(-1).text.de, 'DWD-Warnungen für Home, gelesen um 04:30.');
  // In German the official headline is the title.
  const german = buildWarningsContent(alerts, {
    now: Date.parse('2026-10-13T15:00:00Z'),
    language: 'de',
  });
  assert.equal(german.components[1].value.de, 'Stufe 2');
  assert.equal(
    german.components.find((c) => c.type === 'card-list').items[0].title,
    'Amtliche WARNUNG vor STURMBÖEN',
  );
});

test('no warning is two green tiles', () => {
  const content = buildWarningsContent([], { language: 'fr' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.fr, 'Aucun avertissement');
  assert.equal(content.components[1].color, 'success');
  assert.equal(
    content.components.find((c) => c.type === 'card-list'),
    undefined,
  );
});

test('the pollen widget shows the day, the next days and each pollen', () => {
  const pollen = parsePollen(fixture('pollen-s31fg.json'), 50);
  pollen.days[1].values.Birke = 2.5;
  pollen.days[1].values.Graeser = 1;
  pollen.days[2].values.Birke = 3;
  const content = buildPollenContent(pollen, { today: '2026-10-13' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.en, 'Pollen · High');
  const gauge = content.components.find((c) => c.type === 'gauge');
  assert.equal(gauge.value, 2.5);
  assert.equal(gauge.color, 'danger');
  const tomorrow = content.components.find((c) => c.type === 'value');
  assert.equal(tomorrow.label.en, 'Tomorrow');
  assert.equal(tomorrow.value, '3');
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].label.en, 'Birch');
  assert.equal(status.items[0].value.fr, '2-3 · Forte');
  assert.equal(status.items.at(-1).value, 'Brandenburg und Berlin');
});

test('a pollen file older than today falls back on a message', () => {
  const pollen = parsePollen(fixture('pollen-s31fg.json'), 50);
  const content = buildPollenContent(pollen, { today: '2026-10-20' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].variant, 'body');
});

test('the widgets resolve the house and answer outside Germany', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const provider = new WeatherProvider({ logger: silent, now: () => FIXTURE_NOW });
    const gladys = createFakeGladys({
      houses: [
        { selector: 'home', name: 'Home', ...BERLIN },
        { selector: 'paris', name: 'Paris', latitude: 48.85, longitude: 2.35 },
      ],
    });
    const watcher = new Watcher({
      gladys,
      provider,
      getConfig: () => ({ warncell_ids: '103359000' }),
      getPreferences: () => ({}),
      logger: silent,
      now: () => FIXTURE_NOW,
    });
    await watcher.refreshHouses();
    await watcher.refreshCells();
    const preferences = [];
    const widgets = createWidgets({
      provider,
      watcher,
      rememberPreferences: (p) => preferences.push(p),
      now: () => FIXTURE_NOW,
    });
    const warnings = await widgets.warnings.get({ settings: {}, language: 'fr', units: 'metric' });
    assert.deepEqual(validateWidgetContent(warnings), []);
    assert.equal(warnings.components[0].text.fr, 'Temps marquant · 2');
    assert.deepEqual(preferences, [{ language: 'fr', units: 'metric' }]);
    const cell = await widgets.warnings.get({ settings: { house: '103359000' }, language: 'de' });
    assert.deepEqual(validateWidgetContent(cell), []);
    assert.equal(cell.components[0].text.de, 'Keine Warnung');
    assert.equal(
      cell.components.at(-1).text.de,
      'DWD-Warnungen für Kreis Stade, gelesen um 04:30.',
    );
    const pollen = await widgets.pollen.get({ settings: { house: 'Home' } });
    assert.deepEqual(validateWidgetContent(pollen), []);
    assert.equal(pollen.components[0].text.en, 'Pollen · None');
    // October: no pollen in the air, one line says so instead of zeros.
    const pollenStatus = pollen.components.find((c) => c.type === 'status');
    assert.equal(pollenStatus.items.length, 2);
    assert.equal(pollenStatus.items[0].value.fr, 'Aucun des 8 pollens');
    // The house comes as its selector from the houses list of Gladys.
    const air = await widgets.air_quality.get({ settings: { house: 'home' }, language: 'de' });
    assert.deepEqual(validateWidgetContent(air), []);
    assert.equal(air.components[0].text.de, 'Luftqualität · Gut');
    const airStatus = air.components.find((c) => c.type === 'status');
    assert.equal(airStatus.items[0].value.en, 'NO₂ 29 µg/m³ · Good');
    assert.equal(airStatus.items.at(-2).value.en, 'Berlin Mitte (background), 1 km');
    assert.equal(airStatus.items.at(-1).value.en, '04:00 (partial)');
    const airParis = await widgets.air_quality.get({ settings: { house: 'paris' } });
    assert.ok(airParis.components[0].text.en.includes('Germany only'));
    // A typed cell wins over the house in the warnings widget.
    const cellSetting = await widgets.warnings.get({
      settings: { house: 'home', cell: '103359000' },
      language: 'en',
    });
    assert.ok(cellSetting.components.at(-1).text.en.includes('Kreis Stade'));
    const paris = await widgets.pollen.get({ settings: { house: 'Paris' } });
    assert.ok(paris.components[0].text.en.includes('Germany only'));
    const nowhere = await widgets.warnings.get({ settings: { house: 'Nowhere' } });
    assert.ok(nowhere.components[0].text.en.includes('No located house'));
    const parisWarnings = await widgets.warnings.get({ settings: { house: 'Paris' } });
    assert.ok(parisWarnings.components[0].text.en.includes('Germany only'));
  } finally {
    restore();
  }
});
