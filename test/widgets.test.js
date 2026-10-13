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
  const content = buildWarningsContent(alerts, { utcOffsetMinutes: 120 });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.fr, '2 avertissements · Modérée');
  const list = content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].title.en, 'Storm gusts');
  assert.equal(list.items[0].subtitle, '13.10 14:00 → 14.10 00:00');
  assert.equal(list.items[0].badge.color, 'warning');
  assert.ok(list.items[0].description.includes('Handlungsempfehlungen'));
});

test('no warning is a green status', () => {
  const content = buildWarningsContent([]);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[1].items[0].color, 'success');
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
      getPreferences: () => ({}),
      logger: silent,
      now: () => FIXTURE_NOW,
    });
    await watcher.refreshHouses();
    const preferences = [];
    const widgets = createWidgets({
      provider,
      watcher,
      rememberPreferences: (p) => preferences.push(p),
      now: () => FIXTURE_NOW,
    });
    const warnings = await widgets.warnings.get({ settings: {}, language: 'fr', units: 'metric' });
    assert.deepEqual(validateWidgetContent(warnings), []);
    assert.equal(warnings.components[0].text.fr, '2 avertissements · Modérée');
    assert.deepEqual(preferences, [{ language: 'fr', units: 'metric' }]);
    const pollen = await widgets.pollen.get({ settings: { house: 'Home' } });
    assert.deepEqual(validateWidgetContent(pollen), []);
    assert.equal(pollen.components[0].text.en, 'Pollen · None');
    const paris = await widgets.pollen.get({ settings: { house: 'Paris' } });
    assert.ok(paris.components[0].text.en.includes('Germany only'));
    const nowhere = await widgets.warnings.get({ settings: { house: 'Nowhere' } });
    assert.ok(nowhere.components[0].text.en.includes('No located house'));
  } finally {
    restore();
  }
});
