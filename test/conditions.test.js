import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mosmixCondition, observationCondition, skyCondition } from '../src/conditions.js';

test('the sky from the cloud cover', () => {
  assert.equal(skyCondition(5), 'clear');
  assert.equal(skyCondition(50), 'partly-cloudy');
  assert.equal(skyCondition(90), 'cloud');
  assert.equal(skyCondition(undefined), 'unknown');
});

test('WMO present weather codes', () => {
  assert.equal(mosmixCondition(0, 10), 'clear');
  assert.equal(mosmixCondition(2, 60), 'partly-cloudy');
  assert.equal(mosmixCondition(45, 100), 'fog');
  assert.equal(mosmixCondition(48, 100), 'freezing-fog');
  assert.equal(mosmixCondition(53, 100), 'drizzle');
  assert.equal(mosmixCondition(56, 100), 'freezing-rain');
  assert.equal(mosmixCondition(61, 100), 'rain');
  assert.equal(mosmixCondition(65, 100), 'pouring');
  assert.equal(mosmixCondition(67, 100), 'freezing-rain');
  assert.equal(mosmixCondition(69, 100), 'sleet');
  assert.equal(mosmixCondition(73, 100), 'snow');
  assert.equal(mosmixCondition(79, 100), 'sleet');
  assert.equal(mosmixCondition(81, 100), 'pouring');
  assert.equal(mosmixCondition(85, 100), 'snow');
  assert.equal(mosmixCondition(89, 100), 'hail');
  assert.equal(mosmixCondition(93, 100), 'snow-thunderstorm');
  assert.equal(mosmixCondition(95, 100), 'thunderstorm');
  assert.equal(mosmixCondition(19, 100), 'tornado');
  assert.equal(mosmixCondition(31, 100), 'sandstorm');
  assert.equal(mosmixCondition('-', 30), 'partly-cloudy');
});

test('the present weather key of the observations', () => {
  assert.equal(observationCondition(1, 0), 'clear');
  assert.equal(observationCondition(6, 0), 'freezing-fog');
  assert.equal(observationCondition(9, 0), 'pouring');
  assert.equal(observationCondition(17, 0), 'sleet');
  assert.equal(observationCondition(24, 0), 'hail');
  assert.equal(observationCondition(31, 0), 'wind');
  assert.equal(observationCondition(undefined, 85), 'cloud');
});
