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
      air_quality_station: 'debe068',
      extra: 1,
    }),
    {
      official_alerts: false,
      pollen_alerts: true,
      air_quality_alerts: false,
      radar_image: true,
      station: '10384',
      air_quality_station: 'DEBE068',
      warncell_ids: '',
    },
  );
  assert.equal(normalizeConfig({ air_quality_station: '10384' }).air_quality_station, '');
  assert.equal(normalizeConfig({ station: 'not a station id' }).station, '');
  assert.equal(normalizeConfig({ station: 'a051' }).station, 'A051');
});
