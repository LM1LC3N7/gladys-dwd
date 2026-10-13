import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { NoStationError, WeatherProvider } from '../src/provider.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { RADAR_HEIGHT, RADAR_WIDTH } from '../src/sources/dwdRadar.js';
import {
  BERLIN,
  FIXTURE_NOW,
  berlinRoutes,
  binary,
  installFetch,
  json,
} from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function makeProvider({ config = {}, now = FIXTURE_NOW } = {}) {
  const statuses = [];
  const clock = { now };
  const provider = new WeatherProvider({
    getConfig: () => ({ ...DEFAULT_CONFIG, ...config }),
    logger: silent,
    now: () => clock.now,
    onStatus: (s) => statuses.push(s),
  });
  return { provider, statuses, clock };
}

test('getWeather builds the pivot from MOSMIX, the observations, the warnings and the UV', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  try {
    const { provider, statuses } = makeProvider();
    const weather = await provider.getWeather({ ...BERLIN, language: 'fr', units: 'metric' });
    // Berlin-Alexanderplatz forecasts, Berlin-Tempelhof observes.
    assert.ok(calls.some((c) => c.url.includes('MOSMIX_L_LATEST_10389.kmz')));
    assert.ok(calls.some((c) => c.url.includes('poi/10384-BEOB.csv')));
    assert.equal(weather.temperature, 3.6);
    assert.equal(weather.weather, 'fog');
    assert.equal(weather.datetime, '2026-10-13T01:00:00.000Z');
    assert.equal(weather.is_day, false);
    assert.equal(weather.uv_index, 0);
    assert.equal(weather.hours.length, 24);
    assert.equal(weather.days.length, 8);
    assert.equal(weather.days[0].uv_index, 2);
    assert.ok(weather.hours.some((h) => h.uv_index > 0));
    assert.deepEqual(
      weather.alerts.map((a) => [a.event, a.severity, a.type]),
      [
        ['Rafales de tempête', 'moderate', 'wind'],
        ['Gel', 'minor', 'cold'],
      ],
    );
    assert.deepEqual(weather.images, [
      { key: 'radar', label: { en: 'Precipitation radar', fr: 'Radar de précipitations' } },
    ]);
    assert.ok(weather.sunrise && weather.sunset);
    assert.deepEqual(statuses, [{ ok: true, source: 'mosmix' }]);
  } finally {
    restore();
  }
});

test('US units convert the values, English picks the English texts', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const { provider } = makeProvider();
    const weather = await provider.getWeather({ ...BERLIN, language: 'en', units: 'us' });
    assert.equal(weather.temperature, 38.5);
    assert.equal(weather.alerts[0].event, 'Storm gusts');
  } finally {
    restore();
  }
});

test('the forecast of the current hour stands in without a fresh observation', async () => {
  const { restore } = installFetch(
    berlinRoutes({ routes: [[/weather_reports\/poi\//, () => json({}, 404)]] }),
  );
  try {
    const { provider } = makeProvider();
    const weather = await provider.getWeather({ ...BERLIN, language: 'en', units: 'metric' });
    assert.equal(weather.temperature, 4);
    assert.equal(weather.datetime, '2026-10-13T02:00:00.000Z');
  } finally {
    restore();
  }
});

test('the snapshot is cached 15 minutes and shared between concurrent calls', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  try {
    const { provider, clock } = makeProvider();
    await Promise.all([
      provider.getSnapshot(BERLIN.latitude, BERLIN.longitude),
      provider.getSnapshot(BERLIN.latitude, BERLIN.longitude),
    ]);
    const mosmixCalls = () => calls.filter((c) => c.url.includes('MOSMIX')).length;
    assert.equal(mosmixCalls(), 1);
    clock.now += 14 * 60_000;
    await provider.getSnapshot(BERLIN.latitude, BERLIN.longitude);
    assert.equal(mosmixCalls(), 1);
    clock.now += 2 * 60_000;
    await provider.getSnapshot(BERLIN.latitude, BERLIN.longitude);
    assert.equal(mosmixCalls(), 2);
  } finally {
    restore();
  }
});

test('the last snapshot is served for 6 hours when the DWD fails', async () => {
  const { restore } = installFetch(berlinRoutes());
  const { provider, clock, statuses } = makeProvider();
  try {
    await provider.getSnapshot(BERLIN.latitude, BERLIN.longitude);
  } finally {
    restore();
  }
  const failing = installFetch([[/.*/, () => json({}, 503)]]);
  try {
    clock.now += 60 * 60_000;
    const snapshot = await provider.getSnapshot(BERLIN.latitude, BERLIN.longitude);
    assert.equal(snapshot.forecastStation.id, '10389');
    assert.equal(statuses.at(-1).ok, false);
    clock.now += 6 * 60 * 60_000;
    await assert.rejects(provider.getSnapshot(BERLIN.latitude, BERLIN.longitude), /HTTP 503/);
  } finally {
    failing.restore();
  }
});

test('warnings are empty when disabled, abroad, and kept an hour on failure', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  try {
    const off = makeProvider({ config: { official_alerts: false } }).provider;
    assert.deepEqual(await off.getAlerts(BERLIN.latitude, BERLIN.longitude), []);
    const { provider, clock } = makeProvider();
    assert.deepEqual(await provider.getAlerts(48.85, 2.35), []);
    assert.equal(calls.filter((c) => c.url.includes('Warnungen')).length, 0);
    assert.equal((await provider.getAlerts(BERLIN.latitude, BERLIN.longitude)).length, 2);
    restore();
    installFetch([[/.*/, () => json({}, 500)]]);
    clock.now += 10 * 60_000;
    assert.equal((await provider.getAlerts(BERLIN.latitude, BERLIN.longitude)).length, 2);
    clock.now += 60 * 60_000;
    assert.deepEqual(await provider.getAlerts(BERLIN.latitude, BERLIN.longitude), []);
  } finally {
    restore();
  }
});

test('the pollen alert joins the official ones when enabled', async () => {
  const { restore } = installFetch(berlinRoutes());
  try {
    const { provider } = makeProvider({
      config: { pollen_alerts: true },
      // A spring day: the fixture holds no pollen in October, so edit it.
      now: FIXTURE_NOW,
    });
    const pollen = await provider.getPollen(BERLIN.latitude, BERLIN.longitude);
    assert.equal(pollen.region.name, 'Brandenburg und Berlin');
    pollen.days[1].values.Birke = 3;
    const weather = await provider.getWeather({ ...BERLIN, language: 'en', units: 'metric' });
    assert.ok(weather.alerts.some((a) => a.event === 'Pollen (DWD index)'));
    // Outside Germany there is no pollen index.
    assert.equal(await provider.getPollen(48.85, 2.35), undefined);
  } finally {
    restore();
  }
});

test('a house without a station nearby is refused, a forced station used', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  try {
    const { provider, statuses } = makeProvider();
    await assert.rejects(provider.getSnapshot(45, -30), NoStationError);
    assert.equal(statuses.at(-1).ok, false);
    const forced = makeProvider({ config: { station: '10384' } }).provider;
    const snapshot = await forced.getSnapshot(BERLIN.latitude, BERLIN.longitude);
    assert.ok(calls.some((c) => c.url.includes('MOSMIX_L_LATEST_10384.kmz')));
    assert.equal(snapshot.forecastStation.id, '10384');
  } finally {
    restore();
  }
});

test('the radar image is the WMS composite with a marker, cached 5 minutes', async () => {
  const served = new PNG({ width: RADAR_WIDTH, height: RADAR_HEIGHT });
  served.data.fill(200);
  const png = PNG.sync.write(served);
  const { calls, restore } = installFetch([
    [/geoserver\/dwd\/wms/, () => binary(png, 'image/png')],
  ]);
  try {
    const { provider, clock } = makeProvider();
    await assert.rejects(provider.getImage('radar'), /No location known yet/);
    provider.setDefaultLocation(BERLIN);
    const base64 = await provider.getImage('radar');
    const image = PNG.sync.read(Buffer.from(base64, 'base64'));
    assert.equal(image.width, RADAR_WIDTH);
    const center = (RADAR_HEIGHT / 2) * RADAR_WIDTH * 4 + (RADAR_WIDTH / 2) * 4;
    assert.deepEqual([...image.data.subarray(center, center + 3)], [220, 38, 38]);
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get('layers'), 'dwd:Niederschlagsradar,dwd:Laender');
    assert.equal(url.searchParams.get('crs'), 'EPSG:3857');
    await provider.getImage('radar');
    assert.equal(calls.length, 1);
    clock.now += 6 * 60_000;
    await provider.getImage('radar');
    assert.equal(calls.length, 2);
    await assert.rejects(provider.getImage('satellite'), /Unknown image/);
  } finally {
    restore();
  }
});

test('invalid coordinates are refused before any call', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  try {
    const { provider } = makeProvider();
    await assert.rejects(
      provider.getWeather({ latitude: null, longitude: '' }),
      /valid coordinates/,
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
