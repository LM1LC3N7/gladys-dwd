import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherProvider } from '../src/provider.js';
import { Watcher, alertsSignature } from '../src/watcher.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { createMemoryStore } from '../src/store.js';
import {
  BERLIN,
  FIXTURE_NOW,
  berlinRoutes,
  fixture,
  installFetch,
  json,
} from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const house = { selector: 'home', name: 'Home', ...BERLIN };

function setup({ config = {}, houses = [house], store = createMemoryStore() } = {}) {
  const clock = { now: FIXTURE_NOW };
  const getConfig = () => ({ ...DEFAULT_CONFIG, ...config });
  const provider = new WeatherProvider({ getConfig, logger: silent, now: () => clock.now });
  const gladys = createFakeGladys({ houses });
  const watcher = new Watcher({
    gladys,
    provider,
    getConfig,
    getPreferences: () => ({ language: 'fr', units: 'metric' }),
    store,
    logger: silent,
    now: () => clock.now,
  });
  return { clock, provider, gladys, watcher, store };
}

test('a changed set of warnings asks Gladys to refresh the weather', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { clock, gladys, watcher } = setup();
  try {
    await watcher.tick();
    assert.equal(gladys.weatherRefreshes.length, 0);
    restore();
    installFetch(berlinRoutes({ warnings: { type: 'FeatureCollection', features: [] } }));
    clock.now += 5 * 60_000;
    await watcher.tick();
    assert.equal(gladys.weatherRefreshes.length, 1);
    assert.ok(gladys.widgetRefreshes.includes('warnings'));
  } finally {
    restore();
  }
});

test('warning events fire per area, houses in Germany and typed cells alike', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { clock, gladys, watcher, provider, store } = setup({
    config: { warncell_ids: '103359000' },
    houses: [house, { selector: 'paris', name: 'Paris', latitude: 48.85, longitude: 2.35 }],
  });
  try {
    await watcher.tick();
    assert.deepEqual(
      watcher.warningAreas().map((a) => [a.key, a.name]),
      [
        ['home', 'Home'],
        ['cell:103359000', 'Kreis Stade'],
      ],
    );
    assert.deepEqual(gladys.sceneEvents, []); // baseline
    assert.deepEqual(Object.keys(JSON.parse(store.files.get('warnings.json')).areas), [
      'home',
      'cell:103359000',
    ]);
    // A thunderstorm appears over Berlin, the district gets wind gusts.
    restore();
    const berlin = fixture('warnings-berlin.json');
    berlin.features[1].properties.EVENT = 'GEWITTER';
    berlin.features[1].properties.EC_II = '31';
    berlin.features[1].properties.EC_GROUP = 'THUNDERSTORM';
    installFetch(
      berlinRoutes({
        warnings: berlin,
        routes: [
          [/Warnungen_Landkreise/, () => json(fixture('warnings-kreis-nordfriesland.json'))],
        ],
      }),
    );
    provider.alerts.clear();
    clock.now += 5 * 60_000;
    await watcher.tick();
    assert.deepEqual(
      gladys.sceneEvents.map((e) => [e.key, e.data.area, e.data.type, e.data.level]),
      [
        ['warning_issued', 'home', 'thunderstorm', 1],
        ['warning_ended', 'home', 'frost', 1],
        ['warning_issued', 'cell:103359000', 'wind', 2],
      ],
    );
    assert.equal(gladys.sceneEvents[0].data.house, 'Home');
    assert.equal(gladys.sceneEvents[2].data.area_name, 'Kreis Stade');
    assert.equal(gladys.sceneEvents[2].data.title, 'Rafales de tempête (niveau 2)');
    // Committed once accepted.
    const memory = JSON.parse(store.files.get('warnings.json')).areas;
    assert.deepEqual(Object.keys(memory.home.kinds), ['wind', 'thunderstorm']);
    assert.equal(memory['cell:103359000'].kinds.wind.level, 2);
  } finally {
    restore();
  }
});

test('the minute clock nudges the widget when a warning starts', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { clock, gladys, watcher } = setup();
  try {
    await watcher.tick();
    const before = gladys.widgetRefreshes.filter((k) => k === 'warnings').length;
    watcher.clockTick();
    assert.equal(gladys.widgetRefreshes.filter((k) => k === 'warnings').length, before);
    // 12:00 UTC: the storm gusts start.
    clock.now = Date.parse('2026-10-13T12:00:30Z');
    watcher.clockTick();
    assert.equal(gladys.widgetRefreshes.filter((k) => k === 'warnings').length, before + 1);
    assert.equal(watcher.findArea('103359000'), undefined);
    assert.equal(watcher.areasFor('').length, 1);
  } finally {
    restore();
  }
});

test('the pollen level fires one event per crossed level, after a baseline', async () => {
  const body = fixture('pollen-s31fg.json');
  const berlin = body.content.find((c) => c.region_id === 50);
  const { restore } = installFetch(berlinRoutes({ routes: [[/s31fg\.json/, () => json(body)]] }));
  const { clock, gladys, watcher, provider } = setup();
  try {
    await watcher.tick();
    assert.deepEqual(gladys.sceneEvents, []);
    assert.ok(gladys.widgetRefreshes.includes('pollen'));
    // The next issue of the file: birch high for the day of the house.
    berlin.Pollen.Birke.tomorrow = '3';
    body.last_update = '2026-10-12 11:00 Uhr';
    provider.pollen.clear();
    clock.now += 61 * 60_000;
    await watcher.tick();
    assert.deepEqual(
      gladys.sceneEvents.map((e) => [e.key, e.data.level, e.data.direction]),
      [
        ['pollen_level_changed', 'low', 'worsening'],
        ['pollen_level_changed', 'moderate', 'worsening'],
        ['pollen_level_changed', 'high', 'worsening'],
      ],
    );
    const last = gladys.sceneEvents.at(-1).data;
    assert.equal(last.pollen, 'Bouleau');
    assert.equal(last.house, 'Home');
    assert.ok(last.summary.startsWith('Pollens : exposition forte'));
  } finally {
    restore();
  }
});

test('a refused scene event never breaks the loop', async () => {
  const body = fixture('pollen-s31fg.json');
  const { restore } = installFetch(berlinRoutes({ routes: [[/s31fg\.json/, () => json(body)]] }));
  const { clock, gladys, watcher, provider } = setup();
  try {
    await watcher.tick();
    body.content.find((c) => c.region_id === 50).Pollen.Graeser.tomorrow = '2';
    provider.pollen.clear();
    gladys.rejectSceneEvents = true;
    clock.now += 61 * 60_000;
    await watcher.tick();
    assert.deepEqual(gladys.sceneEvents, []);
    assert.equal(watcher.running, false);
  } finally {
    restore();
  }
});

test('without houses the last requested location is watched', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { provider, watcher } = setup({ houses: new Error('403 Forbidden') });
  try {
    await watcher.tick();
    assert.deepEqual(watcher.locations(), []);
    await provider.getWeather({ ...BERLIN, language: 'en', units: 'metric' });
    assert.equal(watcher.locations().length, 1);
    assert.equal(watcher.findHouse().latitude, BERLIN.latitude);
  } finally {
    restore();
  }
});

test('findHouse matches by name or selector', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { watcher } = setup({ houses: [house, { selector: 'cabin', name: 'Cabin', ...BERLIN }] });
  try {
    await watcher.refreshHouses();
    assert.equal(watcher.findHouse('cabin').name, 'Cabin');
    assert.equal(watcher.findHouse(' home ').name, 'Home');
    assert.equal(watcher.findHouse('nowhere'), undefined);
    assert.equal(watcher.findHouse('').name, 'Home');
  } finally {
    restore();
  }
});

test('alertsSignature ignores the order and follows the severity', () => {
  const a = { id: 'a', severity: 'minor', event: { en: 'A' } };
  const b = { id: 'b', severity: 'severe', event: { en: 'B' } };
  assert.equal(alertsSignature([a, b]), alertsSignature([b, a]));
  assert.notEqual(alertsSignature([a]), alertsSignature([{ ...a, severity: 'severe' }]));
});
