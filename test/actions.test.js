import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../src/actions.js';
import { WeatherProvider } from '../src/provider.js';
import { Watcher } from '../src/watcher.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { BERLIN, FIXTURE_NOW, berlinRoutes, installFetch, json } from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function setup(houses, config = {}) {
  const getConfig = () => ({ ...DEFAULT_CONFIG, ...config });
  const provider = new WeatherProvider({ logger: silent, now: () => FIXTURE_NOW, getConfig });
  const gladys = createFakeGladys({ houses });
  const watcher = new Watcher({
    gladys,
    provider,
    getConfig,
    getPreferences: () => ({}),
    logger: silent,
    now: () => FIXTURE_NOW,
  });
  const actions = createActions({ watcher, provider, getConfig, now: () => FIXTURE_NOW });
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
    assert.match(result.en, /Air quality: OK \(Berlin Mitte, 1 km, Good\)/);
    assert.match(result.de, /Luftqualität: OK \(Berlin Mitte, 1 km, Gut\)/);
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

test('test_sources without a house says so, and still checks the typed cells', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const { watcher, actions } = setup([], { warncell_ids: '103359000,901054002' });
    await watcher.refreshCells();
    const result = await actions.test_sources();
    assert.match(result.fr, /Aucune maison localisée/);
    assert.match(result.en, /Cell 103359000: OK \(Kreis Stade, 0 in force\)/);
    assert.match(result.en, /Cell 901054002: failed \(unknown warn cell id\)/);
    assert.match(result.de, /Zelle 103359000: OK/);
  } finally {
    restore();
  }
});

test('find_warncell searches the municipalities by name', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const { actions } = setup([]);
    const result = await actions.find_warncell({ query: 'Garmisch' });
    assert.match(
      result.en,
      /Gemeinde Garmisch-Partenkirchen \(Garmisch-Partenkirchen\): 809180117/,
    );
    assert.match(result.de, /Warnzellen:/);
    const short = await actions.find_warncell({ query: 'G' });
    assert.match(short.fr, /au moins deux lettres/);
  } finally {
    restore();
  }
});
