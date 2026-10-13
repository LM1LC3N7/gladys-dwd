import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  airQualityUrl,
  cetDate,
  fetchAirQuality,
  nearestStation,
  parseAirQuality,
  parseCet,
  parseStations,
  stationsUrl,
} from '../src/sources/ubaAirQuality.js';
import {
  AIR_QUALITY_LEVEL_KEYS,
  airQualityLevelOf,
  crossedAirQualityLevels,
} from '../src/airQuality.js';
import { AirQualityTracker } from '../src/sceneTriggers.js';
import { airQualityAlerts } from '../src/assessment.js';
import { buildAirQualityContent } from '../src/widgets.js';
import { WeatherProvider } from '../src/provider.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import {
  BERLIN,
  FIXTURE_NOW,
  berlinRoutes,
  fixture,
  installFetch,
  json,
} from './helpers/fakeFetch.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const stations = parseStations(fixture('uba-meta-berlin.json'));
const mitte = nearestStation(stations, BERLIN.latitude, BERLIN.longitude);

test('the UBA clock is CET all year round', () => {
  assert.equal(parseCet('2026-10-13 15:00:00'), Date.parse('2026-10-13T14:00:00Z'));
  assert.equal(parseCet('nope'), undefined);
  assert.equal(cetDate(Date.parse('2026-10-13T23:30:00Z')), '2026-10-14');
  const url = airQualityUrl('DEBE068', FIXTURE_NOW);
  assert.match(url, /station=DEBE068/);
  assert.match(url, /date_from=2026-10-12&time_from=1&date_to=2026-10-13&time_to=24/);
  assert.match(stationsUrl(FIXTURE_NOW), /meta\/json\?use=airquality/);
});

test('the stations of the day, the nearest within 50 km', () => {
  assert.ok(stations.length > 20);
  assert.equal(mitte.code, 'DEBE068');
  assert.equal(mitte.name, 'Berlin Mitte');
  assert.equal(mitte.setting, 'background');
  assert.ok(mitte.distanceKm < 2);
  // Munich is in the fixture, but 500 km away.
  assert.equal(nearestStation(stations, 48.14, 11.58), undefined);
  // A forced station is taken wherever it is.
  const forced = nearestStation(stations, BERLIN.latitude, BERLIN.longitude, { code: 'DEBY001' });
  assert.equal(forced.code, 'DEBY001');
  assert.equal(nearestStation(stations, 52, 13, { code: 'DEXX999' }), undefined);
  assert.deepEqual(parseStations({}), []);
});

test('parseAirQuality takes the latest complete hour, the pollutants and the 24-hour peak', () => {
  const air = parseAirQuality(fixture('uba-airquality-DEBE068.json'), mitte, FIXTURE_NOW);
  // 03:30 CET: the hour ending 03:00 CET.
  assert.equal(air.current.datetime, '2026-10-13T02:00:00.000Z');
  assert.equal(air.current.index, 1);
  assert.equal(air.current.incomplete, true);
  assert.equal(air.current.main.key, 'no2');
  assert.deepEqual(
    air.current.components.map((c) => [c.pollutant.key, c.value, c.index]),
    [
      ['no2', 29, 1],
      ['pm10', 7, 0],
      ['pm2_5', 4, 0],
    ],
  );
  assert.equal(air.peak.index, 1);
  assert.ok(air.hours.length >= 24 && air.hours.length <= 25);
  // Too old: nothing recent.
  const later = Date.parse('2026-10-13T20:00:00Z');
  assert.equal(parseAirQuality(fixture('uba-airquality-DEBE068.json'), mitte, later), undefined);
  assert.equal(parseAirQuality({}, mitte, FIXTURE_NOW), undefined);
});

test('levels and crossings', () => {
  assert.deepEqual(AIR_QUALITY_LEVEL_KEYS, ['very_good', 'good', 'moderate', 'poor', 'very_poor']);
  assert.equal(airQualityLevelOf(0), 'very_good');
  assert.equal(airQualityLevelOf(4), 'very_poor');
  assert.equal(airQualityLevelOf(7), 'very_poor');
  assert.equal(airQualityLevelOf(-1), undefined);
  assert.equal(airQualityLevelOf(undefined), undefined);
  assert.deepEqual(crossedAirQualityLevels('good', 'poor'), [
    { level: 'moderate', direction: 'worsening' },
    { level: 'poor', direction: 'worsening' },
  ]);
  assert.deepEqual(crossedAirQualityLevels('poor', 'poor'), []);
});

function reading(index, hour, main = 'no2') {
  return {
    station: { code: 'DEBE068', name: 'Berlin Mitte' },
    current: {
      index,
      datetime: `2026-10-13T${String(hour).padStart(2, '0')}:00:00.000Z`,
      incomplete: false,
      components: [],
      main: {
        key: main,
        name: { en: 'Nitrogen dioxide', fr: 'Dioxyde d’azote', de: 'Stickstoffdioxid' },
      },
    },
  };
}

test('the tracker fires per crossed level, worsening at once, improving after two hours', () => {
  const tracker = new AirQualityTracker();
  const house = { key: 'home', name: 'Home' };
  const prefs = { language: 'fr' };
  assert.deepEqual(tracker.evaluate(house, reading(1, 1), prefs), []); // baseline
  assert.deepEqual(tracker.evaluate(house, reading(1, 1), prefs), []); // same hour
  const worse = tracker.evaluate(house, reading(3, 2), prefs);
  assert.deepEqual(
    worse.map((e) => [e.key, e.data.level, e.data.direction]),
    [
      ['air_quality_level_changed', 'moderate', 'worsening'],
      ['air_quality_level_changed', 'poor', 'worsening'],
    ],
  );
  assert.equal(worse[0].data.index, 3);
  assert.equal(worse[0].data.pollutant, 'Dioxyde d’azote');
  assert.equal(worse[0].data.house, 'Home');
  assert.match(
    worse[0].data.summary,
    /^Qualité de l’air mauvaise à Berlin Mitte \(dioxyde d’azote\)\./,
  );
  // One better hour is not yet an improvement; the second one is.
  assert.deepEqual(tracker.evaluate(house, reading(2, 3), prefs), []);
  const better = tracker.evaluate(house, reading(2, 4), { language: 'de' });
  assert.deepEqual(
    better.map((e) => [e.data.level, e.data.direction, e.data.previous_level]),
    [['moderate', 'improving', 'poor']],
  );
  assert.match(better[0].data.summary, /^Luftqualität mäßig in Berlin Mitte/);
  // A better hour then a worse one: nothing fired, the level stands.
  assert.deepEqual(tracker.evaluate(house, reading(1, 5), prefs), []);
  assert.deepEqual(tracker.evaluate(house, reading(2, 6), prefs), []);
  assert.deepEqual(tracker.evaluate(house, undefined, prefs), []);
});

test('the air quality alert starts at "poor" and names the pollutant', () => {
  assert.deepEqual(airQualityAlerts(reading(2, 1)), []);
  assert.deepEqual(airQualityAlerts(undefined), []);
  const [alert] = airQualityAlerts(reading(3, 1));
  assert.equal(alert.severity, 'moderate');
  assert.equal(alert.type, undefined);
  assert.match(alert.description.en, /^Air quality poor at Berlin Mitte \(nitrogen dioxide\)\./);
  assert.equal(airQualityAlerts(reading(4, 1))[0].severity, 'severe');
});

test('the air quality widget content is valid for the core', () => {
  const air = parseAirQuality(fixture('uba-airquality-DEBE068.json'), mitte, FIXTURE_NOW);
  air.peak = { index: 2, datetime: '2026-10-12T14:00:00.000Z' };
  const content = buildAirQualityContent(air, { timeZone: 'Europe/Berlin' });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text.fr, 'Qualité de l’air · Bonne');
  assert.equal(content.components[1].value.de, 'Gut');
  assert.equal(content.components[1].color, 'success');
  assert.equal(content.components[2].label.en, 'Worst (24 h)');
  assert.equal(content.components[2].value.fr, 'Moyenne');
  assert.equal(content.components[2].color, 'warning');
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].label.de, 'Stickstoffdioxid');
  assert.equal(status.items.at(-2).value.fr, 'Berlin Mitte (fond), 1 km');
  assert.equal(content.components.at(-1).variant, 'body');
  assert.ok(content.components.at(-1).text.de.length <= 300);
});

test('the provider caches the stations a day and the index 15 minutes, keeps it on failure', async () => {
  const { calls, restore } = installFetch(berlinRoutes());
  const clock = { now: FIXTURE_NOW };
  const provider = new WeatherProvider({
    getConfig: () => DEFAULT_CONFIG,
    logger: silent,
    now: () => clock.now,
  });
  try {
    const air = await provider.getAirQuality(BERLIN.latitude, BERLIN.longitude);
    assert.equal(air.station.code, 'DEBE068');
    assert.equal(air.current.index, 1);
    const ubaCalls = () => calls.filter((c) => c.url.includes('air-data')).length;
    assert.equal(ubaCalls(), 2);
    await provider.getAirQuality(BERLIN.latitude, BERLIN.longitude);
    assert.equal(ubaCalls(), 2);
    clock.now += 16 * 60_000;
    await provider.getAirQuality(BERLIN.latitude, BERLIN.longitude);
    assert.equal(ubaCalls(), 3); // the index again, not the stations
    // Outside Germany: nothing, no call.
    assert.equal(await provider.getAirQuality(48.85, 2.35), undefined);
    assert.equal(ubaCalls(), 3);
    // The UBA fails: the last index is served for a while.
    restore();
    installFetch([[/air-data/, () => json({}, 503)], ...berlinRoutes()]);
    clock.now += 16 * 60_000;
    const kept = await provider.getAirQuality(BERLIN.latitude, BERLIN.longitude);
    assert.equal(kept.current.index, 1);
    clock.now += 4 * 60 * 60_000;
    assert.equal(await provider.getAirQuality(BERLIN.latitude, BERLIN.longitude), undefined);
  } finally {
    restore();
  }
});

test('the air quality alert joins the official ones when enabled', async () => {
  const body = fixture('uba-airquality-DEBE068.json');
  body.data['175']['2026-10-13 02:00:00'][1] = 3;
  const { restore } = installFetch(berlinRoutes({ airQuality: body }));
  const provider = new WeatherProvider({
    getConfig: () => ({ ...DEFAULT_CONFIG, air_quality_alerts: true }),
    logger: silent,
    now: () => FIXTURE_NOW,
  });
  try {
    const weather = await provider.getWeather({ ...BERLIN, language: 'en', units: 'metric' });
    const alert = weather.alerts.find((a) => a.event === 'Poor air quality (UBA index)');
    assert.ok(alert, 'the air quality alert is listed');
    assert.equal(alert.severity, 'moderate');
    const air = await fetchAirQuality(mitte, { now: FIXTURE_NOW });
    assert.equal(air.current.index, 3);
  } finally {
    restore();
  }
});
