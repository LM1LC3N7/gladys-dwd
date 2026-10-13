# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `weather`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
answers `onWeatherGet` with the pivot weather format (contract B.18 of the
Gladys spec `docs/specs/external-integrations/capabilities/weather-type.md`)
from the **Deutscher Wetterdienst** open data: MOSMIX forecasts and hourly
observations (Europe), official warnings, pollen and UV indices and radar
(Germany). Derived from `gladys-environment-canada` (same author). No key,
no account. Unofficial: not affiliated with the DWD.

A weather integration has **no device screen** (store schema): the pollen
index lives in a widget, a scene trigger and an optional alert.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/provider.test.js         # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npm run update-stations                   # regenerate data/stations.json (network)
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js                      SDK wiring only (handlers registered before connect())
src/provider.js               caches, stations, forecast + observations, warnings,
                              pollen, UV, radar -> pivot
src/pivot.js                  metric snapshot -> pivot (units, language, limits)
src/sources/dwdMosmix.js      MOSMIX_L kmz -> hours and local days
src/sources/dwdObservations.js poi csv -> current conditions
src/sources/dwdWarnings.js    WFS warnings at the point -> bilingual alerts
src/sources/dwdPollen.js      WFS pollen region + s31fg.json -> 3 days of index
src/sources/dwdUv.js          uvi.json + the 38 cities placed
src/sources/dwdRadar.js       WMS composite + marker (pngjs)
src/stations.js               data/stations.json: nearest forecast / observing station
src/zip.js                    the smallest zip reader (one deflated entry)
src/timezone.js               coordinates -> IANA zone (coarse outlines) -> offset
src/conditions.js             WMO ww codes, poi keys, cloud cover -> pivot conditions
src/apparent.js               Steadman apparent temperature, humidity/dew point
src/pollen.js                 pollen names, levels, crossings (pure)
src/assessment.js             the optional pollen alert
src/watcher.js                5-min loop: warnings nudge, pollen events, widget nudges
src/sceneTriggers.js          pollen level tracker (baseline, crossed levels)
src/widgets.js                "warnings" and "pollen" widget contents
src/actions.js                "test_sources" button
src/i18n.js                   runtime texts, the DWD event name translator
data/stations.json            Europe subset of the MOSMIX catalog (generated)
scripts/update-stations.mjs   regenerates data/ from the DWD catalog and poi list
test/fixtures/                recorded DWD answers (2026-10-13, Berlin)
test/helpers/fakeFetch.js     fake fetch: tests never touch the network
```

A **snapshot** is the source-independent internal model: always metric
pivot units (°C, m/s, hPa, mm, km), no language. Conversions to the request
happen only in `src/pivot.js` (and in the widget / scene texts).

## What is known of the DWD data

- **MOSMIX_L** single-station kmz: 247 hourly steps, 114 elements, SI
  units (TTT in K, PPPP in Pa, VV in m, FF/FX1 in m/s, SunD1 in s), "-" for
  none. `TX`/`TN` (12-hour extremes) only at 06 and 18 UTC, the daily
  elements (`RRdc`, `Rd02`, `wwPd`) at 06 or 00/12 UTC with windows that do
  not match local days: the days are built from the hours (sum of `RR1c`,
  max of `R101`), the extremes widened with `TX`/`TN`. `ww` is the WMO
  present weather code; 0 to 3 say nothing of the sky, `N` does.
- **Station catalog**: fixed-width, coordinates in degrees and MINUTES
  ("52.28" is 52°28'); alphanumeric ids (`A051`, `N1542`) are German local
  points without observations. The poi directory lists the ~630 stations
  with observations.
- **poi csv**: the first header line holds the English parameter names (two
  of them with stray spaces: normalized), rows newest first, decimal commas,
  dates "dd.mm.yy", times UTC. `present_weather` is the DWD key 1 to 31
  (not WMO). Rows of the last hour may lack the temperature: skipped.
- **WFS** (GeoServer): `CQL_FILTER=INTERSECTS(THE_GEOM,POINT(lat lon))`
  with the LATITUDE FIRST (EPSG:4326 axis order): `POINT(lon lat)` answers
  nothing, silently. `propertyName` trims the answer. `ALTITUDE`/`CEILING`
  are feet; `SEVERITY` is CAP (Minor…Extreme); the event name is German
  capitals, translated word by word in `src/i18n.js`.
- **Pollen**: `dwd:Pollenfluggebiete` gives `GF`, the part region id of
  `s31fg.json`; regions without part regions (Berlin and Brandenburg, 50)
  are listed with `partregion_id: -1`. The file is issued at 11:00 and dates
  "today" itself: after midnight, "tomorrow" is today.
- **WMS**: `dwd:Niederschlagsradar` (RV, 1 km, 5 min) and `dwd:Laender`
  (styles `Laender_ocker`, `Laender_schwarz`…) can be composed in one
  GetMap; `dwd:Bundeslaender`, `dwd:Basislayer` answer "layer not defined"
  although the capabilities list them. STYLES needs one entry per layer.
- **Licence**: GeoNutzungsverordnung, attribution "Datenbasis: Deutscher
  Wetterdienst", never the DWD logo (see NOTICE).

## Rules

- **Unofficial.** Every user-facing surface (manifest description and intro,
  cover, README, docs) says "unofficial connector, not affiliated with the
  DWD". Never use the DWD logo.
- **Keys are forever**: manifest `config_schema`, `actions`, widget,
  scene-trigger and level keys (`none`, `low`, `moderate`, `high`) are
  stored in user scenes and dashboards. Never rename them.
- **Gladys awaits `onWeatherGet` under 15 s**: keep the timeout in
  `src/constants.js` (6 s per call, the forecast and the observations in
  parallel) and the caches.
- **Be polite with the DWD**: 15 minutes between two reads of a location,
  one request per source, the station table shipped (never the 300 KB
  catalog at runtime).
- **Units are pivot metric everywhere** after the sources
  (`parseMosmix` and `currentObservation` convert once).
- **Widget texts are bounded**: a `caption` holds 80 characters, a `body`
  300, a status label 40, a card title 60 (`validateWidgetContent` in the
  tests).
- **Read-only rootfs**: write nothing outside `/data` (we write nothing).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code. `source: "houses"` is refused by the store schema:
  houses are matched by name.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installFetch` throws on an unknown URL)
  and take their clock from `FIXTURE_NOW`: pass `now` down to every parser
  that compares with the current time.

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## Refreshing the fixtures

```bash
B=https://opendata.dwd.de
curl -s "$B/weather/local_forecasts/mos/MOSMIX_L/single_stations/10384/kml/MOSMIX_L_LATEST_10384.kmz" \
  -o test/fixtures/mosmix-10384.kmz
curl -s "$B/weather/weather_reports/poi/10384-BEOB.csv" -o test/fixtures/poi-10384.csv
curl -s "$B/climate_environment/health/alerts/s31fg.json" -o test/fixtures/pollen-s31fg.json
curl -s "$B/climate_environment/health/alerts/uvi.json" -o test/fixtures/uvi.json
curl -s "https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Pollenfluggebiete&outputFormat=application/json&propertyName=ID,GF,GEN&CQL_FILTER=INTERSECTS(THE_GEOM,POINT(52.5200%2013.4000))" \
  -o test/fixtures/pollen-region-berlin.json
```

`warnings-berlin.json` is a real municipality answer re-shaped for Berlin
(two warnings in force, one expired). `FIXTURE_NOW` in
`test/helpers/fakeFetch.js` and the expected values of the tests must then
follow the recording time.
