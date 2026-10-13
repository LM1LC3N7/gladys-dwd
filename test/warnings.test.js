import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertType, parseWarnings, warningsUrl } from '../src/sources/dwdWarnings.js';
import { translateEvent } from '../src/i18n.js';
import { FIXTURE_NOW, fixture } from './helpers/fakeFetch.js';

test('the WFS filter puts the latitude first', () => {
  const url = new URL(warningsUrl(52.52, 13.4));
  assert.equal(url.searchParams.get('typeName'), 'dwd:Warnungen_Gemeinden');
  assert.equal(url.searchParams.get('CQL_FILTER'), 'INTERSECTS(THE_GEOM,POINT(52.5200 13.4000))');
});

test('parseWarnings keeps the warnings in force, most severe first', () => {
  const alerts = parseWarnings(fixture('warnings-berlin.json'), FIXTURE_NOW);
  assert.deepEqual(
    alerts.map((a) => [a.event.en, a.severity, a.type]),
    [
      ['Storm gusts', 'moderate', 'wind'],
      ['Frost', 'minor', 'cold'],
    ],
  );
  const [gusts, frost] = alerts;
  assert.equal(gusts.event.fr, 'Rafales de tempête');
  assert.equal(gusts.start, '2026-10-13T12:00:00.000Z');
  assert.equal(gusts.end, '2026-10-13T22:00:00.000Z');
  assert.equal(gusts.area, 'Gemeinde Berlin');
  assert.ok(gusts.description.en.startsWith('Es treten Sturmböen'));
  assert.ok(gusts.description.en.includes('Handlungsempfehlungen'));
  // The altitude band (feet in the data) is said in metres.
  assert.ok(frost.description.en.includes('Above 400 m above sea level'));
  assert.ok(frost.description.fr.includes('Au-dessus de 400 m'));
});

test('the alert type comes from the CAP group, else from the German words', () => {
  assert.equal(alertType({ EC_GROUP: 'THUNDERSTORM' }), 'thunderstorm');
  assert.equal(alertType({ EC_GROUP: 'GLAZE' }), 'snow');
  assert.equal(alertType({ EC_GROUP: '', EVENT: 'SCHWERES GEWITTER mit HAGEL' }), 'thunderstorm');
  assert.equal(alertType({ EVENT: 'HITZE' }), 'heat');
  assert.equal(alertType({ EVENT: 'UV-INDEX' }), undefined);
});

test('the German event names are translated word by word', () => {
  assert.deepEqual(translateEvent('SCHWERES GEWITTER mit HEFTIGEM STARKREGEN und HAGEL'), {
    en: 'Severe thunderstorm with intense heavy rain and hail',
    fr: 'Violent orage avec intense fortes pluies et grêle',
    de: 'SCHWERES GEWITTER mit HEFTIGEM STARKREGEN und HAGEL',
  });
  assert.equal(translateEvent('ORKANARTIGE BÖEN').en, 'Hurricane-like gusts');
  assert.equal(translateEvent('VORABINFORMATION UNWETTER').fr, 'Préavis de intempéries');
  assert.equal(translateEvent('GLÄTTE').en, 'Slippery roads');
  // An unknown word is kept.
  assert.equal(translateEvent('NEUES PHÄNOMEN').en, 'Neues phänomen');
  assert.equal(translateEvent('', 'Amtliche WARNUNG vor NEBEL').en, 'Amtliche warnung of fog');
  assert.equal(translateEvent(undefined), undefined);
});

test('cancelled messages and empty answers give no alert', () => {
  const body = fixture('warnings-berlin.json');
  body.features[0].properties.MSGTYPE = 'Cancel';
  assert.equal(parseWarnings(body, FIXTURE_NOW).length, 1);
  assert.deepEqual(parseWarnings({ type: 'FeatureCollection', features: [] }), []);
  assert.deepEqual(parseWarnings(undefined), []);
});
