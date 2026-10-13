# DWD (Deutscher Wetterdienst) for Gladys Assistant

A **weather provider** external integration for
[Gladys Assistant](https://gladysassistant.com), fed by the **Deutscher
Wetterdienst** (DWD), the German national weather service: the MOSMIX point
forecasts (10 days, hourly), the hourly observations of the synoptic
stations, the official warnings, the pollen and UV indices and the
precipitation radar. No account, no key: the DWD open data servers, for the
location of the house. Forecasts and observations cover Europe; warnings,
pollen, UV and radar cover Germany.

> Unofficial connector: not affiliated with nor endorsed by the Deutscher
> Wetterdienst.

> 🇫🇷 Documentation utilisateur en français : [`docs/fr.md`](docs/fr.md).
> User documentation in English: [`docs/en.md`](docs/en.md).

## Features

| Feature                                                                                          | Where                                               |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Current conditions (observed), 24 hours, 8 days in the Gladys pivot format (metric or US units)  | `src/provider.js`, `src/pivot.js`                   |
| MOSMIX_L forecasts of the nearest station (kmz, hourly, 10 days), cut into local days            | `src/sources/dwdMosmix.js`, `src/zip.js`            |
| Hourly observations of the nearest synoptic station (poi csv)                                    | `src/sources/dwdObservations.js`                    |
| Official DWD warnings (CAP severities and types, translated titles) + `requestWeatherRefresh()`  | `src/sources/dwdWarnings.js`, `src/watcher.js`      |
| "DWD warnings" widget: severity, period, description and advice                                  | `src/widgets.js`                                    |
| "Pollen" widget: the DWD index today, tomorrow and the day after, pollen by pollen, advice       | `src/widgets.js`, `src/sources/dwdPollen.js`        |
| Scene trigger "pollen level changed" (four levels, one event per crossed one)                    | `src/sceneTriggers.js`, `src/pollen.js`             |
| UV index of the nearest of 38 German cities, spread over the day by the sun                      | `src/sources/dwdUv.js`, `src/provider.js`           |
| DWD precipitation radar over the country borders (provider image `radar`)                        | `src/sources/dwdRadar.js`                           |
| Option: pollen alerts (off by default)                                                           | `src/assessment.js`                                 |
| Station table (Europe, about 4,300 MOSMIX stations, 630 observing), regenerated from the catalog | `data/stations.json`, `scripts/update-stations.mjs` |

## How it works

```
onWeatherGet(lat, lon, language, units)
  └─ WeatherProvider.getWeather
       ├─ getSnapshot (cache 15 min, shared in-flight promise)
       │    ├─ nearest MOSMIX station (data/stations.json) -> kmz -> hours, days
       │    ├─ nearest observing station (≤ 60 km) -> csv -> current conditions
       │    └─ last snapshot ≤ 6 h when it fails
       ├─ getAlerts (WFS dwd:Warnungen_Gemeinden at the point, cache 5 min)
       ├─ getPollen (only with the pollen alerts option)
       ├─ getUv (uvi.json of the nearest city, cache 1 h)
       └─ toPivot (metric snapshot -> requested units and language)

Watcher, every 5 min, per area (located houses + typed warn cells)
  ├─ warnings changed          -> requestWeatherRefresh(), requestWidgetRefresh('warnings')
  ├─ kind new / level raised   -> publishSceneEvent('warning_issued'), memory in /data
  ├─ kind gone (DWD confirmed) -> publishSceneEvent('warning_ended')
  ├─ pollen level crossed      -> publishSceneEvent('pollen_level_changed')
  └─ new pollen issue          -> requestWidgetRefresh('pollen')
  every minute, no network: a warning starting or ending moves the widget
```

Internally every value is kept in the pivot metric units (°C, m/s, hPa, mm,
km); the conversion to the unit system of the request happens last, so one
cache entry serves every user.

### Sources

| Source                                                                           | Used for      | Notes                                                                                           |
| -------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/<id>/kml/` | forecasts     | One kmz per station, 4 issues a day; SI units (K, Pa, m, m/s), WMO `ww` codes.                  |
| `opendata.dwd.de/weather/weather_reports/poi/<id>-BEOB.csv`                      | current       | Hourly, 24 rows, decimal commas, "---" for none; the DWD present-weather key (1 to 31).         |
| `maps.dwd.de/geoserver/dwd/ows` (`dwd:Warnungen_Gemeinden`, WFS)                 | warnings      | `INTERSECTS(THE_GEOM, POINT(lat lon))`: latitude first (EPSG:4326 axis order).                  |
| `maps.dwd.de/geoserver/dwd/ows` (`dwd:Pollenfluggebiete`, WFS)                   | pollen region | The region containing the house, cached a day; `GF` is the part region id of the index file.    |
| `opendata.dwd.de/climate_environment/health/alerts/s31fg.json`                   | pollen        | 27 regions, 8 pollen, today/tomorrow/day after, "0" to "3" with halves.                         |
| `opendata.dwd.de/climate_environment/health/alerts/uvi.json`                     | UV index      | 38 cities (placed by `src/sources/dwdUv.js`), daily maximum, 3 days.                            |
| `maps.dwd.de/geoserver/dwd/wms` (`dwd:Niederschlagsradar`, `dwd:Laender`)        | radar         | One GetMap in EPSG:3857, the house marker drawn with `pngjs`.                                   |
| `dwd.de/.../mosmix_stationskatalog.cfg`                                          | station table | Fixed width, coordinates in degrees and minutes; `npm run update-stations` regenerates `data/`. |

MOSMIX gives every time in UTC and no time zone: `src/timezone.js` derives
the IANA zone from the coordinates (coarse European outlines) and Node's ICU
data gives the offset, daylight saving time included. The feels-like
temperature is Steadman's apparent temperature (`src/apparent.js`); sunrise
and sunset are computed locally (`src/sun.js`).

## Development

```bash
npm install
npm test                 # node --test, no network (fetch is faked, fixtures in test/fixtures)
npm run lint             # ESLint
npm run format:check     # Prettier
npm run audit            # npm audit --omit=dev
npm run update-stations  # regenerate data/stations.json (network)
npx github:GladysAssistant/integration-store .   # store admission checks
```

The fixtures were recorded on 2026-10-13 (Berlin-Tempelhof); see
`CLAUDE.md` for the refresh commands.

## Releasing

Actions → **Release**: the workflow bumps the version, rolls the changelog,
tags, builds the multi-arch image on GHCR and publishes the GitHub Release.
Never edit `version` or `docker_image` by hand.

## Licence

Apache-2.0 (see `LICENSE`). Data: Deutscher Wetterdienst open data
(GeoNutzungsverordnung), see `NOTICE`.
