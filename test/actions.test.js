import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../src/actions.js';
import { WeatherProvider } from '../src/provider.js';
import { Watcher } from '../src/watcher.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { BERLIN, FIXTURE_NOW, berlinRoutes, installFetch, json } from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function setup(houses) {
  const provider = new WeatherProvider({ logger: silent, now: () => FIXTURE_NOW });
  const gladys = createFakeGladys({ houses });
  const watcher = new Watcher({
    gladys,
    provider,
    getPreferences: () => ({}),
    logger: silent,
    now: () => FIXTURE_NOW,
  });
  const actions = createActions({
    watcher,
    provider,
    getConfig: () => DEFAULT_CONFIG,
    now: () => FIXTURE_NOW,
  });
  return { watcher, actions };
}

test('test_sources reports each source', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const { watcher, actions } = setup([{ selector: 'home', name: 'Home', ...BERLIN }]);
    await watcher.refreshHouses();
    const result = await actions.test_sources();
    assert.match(
      result.en,
      /Forecasts: OK \(BERLIN-TEMPELHOF, 1 km, 4 °C measured at BERLIN-TEMPELHOF\)/,
    );
    assert.match(result.en, /Warnings: OK, 2 in force/);
    assert.match(result.en, /Pollen: OK \(Brandenburg und Berlin, index 0-1\)/);
    assert.match(result.fr, /Prévisions : OK/);
  } finally {
    restore();
  }
});

test('test_sources says what failed, and what is not available abroad', async () => {
  const { restore } = installFetch(
    berlinRoutes({ routes: [[/Warnungen_Gemeinden/, () => json({}, 500)]] }),
  );
  try {
    const { watcher, actions } = setup([{ selector: 'home', name: 'Home', ...BERLIN }]);
    await watcher.refreshHouses();
    const result = await actions.test_sources();
    assert.match(result.en, /Warnings: failed \(HTTP 500/);
    const abroad = setup([{ selector: 'p', name: 'Paris', latitude: 48.85, longitude: 2.35 }]);
    await abroad.watcher.refreshHouses();
    const paris = await abroad.actions.test_sources();
    assert.match(paris.en, /Forecasts: OK \(BERLIN-TEMPELHOF, 14 km, 4 °C measured at PARIS\)/);
    assert.match(paris.en, /not available outside Germany/);
  } finally {
    restore();
  }
});

test('test_sources without a house says so', async () => {
  const { actions } = setup([]);
  const result = await actions.test_sources();
  assert.match(result.fr, /Aucune position/);
});
