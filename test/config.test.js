import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('normalizeConfig coerces the form values', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(
    normalizeConfig({
      official_alerts: 'false',
      pollen_alerts: 'true',
      station: ' 10384 ',
      extra: 1,
    }),
    {
      official_alerts: false,
      pollen_alerts: true,
      radar_image: true,
      station: '10384',
      warncell_ids: '',
    },
  );
  assert.equal(normalizeConfig({ station: 'not a station id' }).station, '');
  assert.equal(normalizeConfig({ station: 'a051' }).station, 'A051');
});
