// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: routes URLs to recorded fixtures, records every
// call, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setFetch } from '../../src/http.js';

const fixtureUrl = (name) => new URL(`../fixtures/${name}`, import.meta.url);

export function fixture(name) {
  return JSON.parse(readFileSync(fixtureUrl(name), 'utf8'));
}

export function fixtureBuffer(name) {
  return readFileSync(fixtureUrl(name));
}

export function fixtureText(name, charset = 'latin1') {
  return new TextDecoder(charset).decode(readFileSync(fixtureUrl(name)));
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const binary = (buffer, type = 'application/octet-stream') =>
  new Response(buffer, { status: 200, headers: { 'content-type': type } });

export const text = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

/**
 * Install a fake fetch. `routes` is a list of [pattern, handler]: the first
 * pattern (RegExp) matching the URL answers with handler(url, init).
 * Returns { calls, restore }.
 */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${url}`);
    }
    return route[1](url, init);
  });
  return { calls, restore: () => setFetch(previous) };
}

// Routes answering Berlin from the recorded fixtures: the MOSMIX file of
// Berlin-Tempelhof for ANY station, the observations of the same station,
// the warnings, the pollen region and index, the UV index.
export function berlinRoutes(overrides = {}) {
  return [
    ...(overrides.routes ?? []),
    [/MOSMIX_L_LATEST_/, () => binary(fixtureBuffer('mosmix-10384.kmz'))],
    [/weather_reports\/poi\//, () => binary(fixtureBuffer('poi-10384.csv'), 'text/plain')],
    [/Warnungen_Gemeinden/, () => json(overrides.warnings ?? fixture('warnings-berlin.json'))],
    [/Warnungen_Landkreise.*103359000/, () => json(fixture('warnings-kreis-stade.json'))],
    [/Warnungen_Landkreise.*901054002/, () => json(fixture('warnings-kreis-nordfriesland.json'))],
    [/Warngebiete_Kreise.*103359000/, () => json(fixture('cell-kreis-stade.json'))],
    [/Warngebiete_Kreise/, () => json({ type: 'FeatureCollection', features: [] })],
    [/Warngebiete_Gemeinden.*ILIKE/, () => json(fixture('cells-search-garmisch.json'))],
    [/Warngebiete_Gemeinden.*CONTAINS/, () => json(fixture('cell-at-berlin.json'))],
    [/Warngebiete_Gemeinden.*809180117/, () => json(fixture('cells-search-garmisch.json'))],
    [/Pollenfluggebiete/, () => json(fixture('pollen-region-berlin.json'))],
    [/s31fg\.json/, () => json(fixture('pollen-s31fg.json'))],
    [/uvi\.json/, () => json(fixture('uvi.json'))],
  ];
}

// The MOSMIX file was issued on 2026-10-12 at 21:00 UTC, the observations
// run to 2026-10-13 01:00 UTC, the pollen and UV files are of 2026-10-12.
export const FIXTURE_NOW = Date.parse('2026-10-13T02:30:00Z');
export const BERLIN = { latitude: 52.52, longitude: 13.4 };
