import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherProvider } from '../src/provider.js';
import { Watcher, alertsSignature } from '../src/watcher.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
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

function setup({ config = {}, houses = [house] } = {}) {
  const clock = { now: FIXTURE_NOW };
  const provider = new WeatherProvider({
    getConfig: () => ({ ...DEFAULT_CONFIG, ...config }),
    logger: silent,
    now: () => clock.now,
  });
  const gladys = createFakeGladys({ houses });
  const watcher = new Watcher({
    gladys,
    provider,
    getPreferences: () => ({ language: 'fr', units: 'metric' }),
    logger: silent,
    now: () => clock.now,
  });
  return { clock, provider, gladys, watcher };
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
