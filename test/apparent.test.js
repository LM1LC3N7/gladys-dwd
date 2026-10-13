import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apparentTemperature,
  dewPointFromHumidity,
  humidityFromDewPoint,
} from '../src/apparent.js';

test('apparent temperature: hot and humid feels hotter, cold and windy colder', () => {
  const muggy = apparentTemperature({ temperature: 30, humidity: 80, wind_speed: 1 });
  assert.ok(muggy > 33 && muggy < 37, `muggy ${muggy}`);
  const windy = apparentTemperature({ temperature: 2, humidity: 60, wind_speed: 10 });
  assert.ok(windy < -3 && windy > -8, `windy ${windy}`);
  assert.equal(apparentTemperature({ temperature: undefined }), undefined);
  // Without humidity, a 50 % guess.
  assert.ok(Number.isFinite(apparentTemperature({ temperature: 20 })));
});

test('humidity and dew point round-trip', () => {
  const rh = humidityFromDewPoint(20, 10);
  assert.ok(rh > 52 && rh < 54, `rh ${rh}`);
  const td = dewPointFromHumidity(20, rh);
  assert.ok(Math.abs(td - 10) < 0.1);
  assert.equal(humidityFromDewPoint(20, undefined), undefined);
  assert.equal(dewPointFromHumidity(20, 0), undefined);
});
