# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Scene triggers "DWD warning issued" and "DWD warning ended", filterable by
  area, levels (1 to 4) and warning types, with the title, period, texts
  and advice as variables; what was announced is kept in `/data`, so a
  restart fires nothing again.
- Scene action "Current DWD warnings": a summary ready to send, with the
  count and the levels now and later.
- Additional warn cells (municipalities and districts by DWD id) followed
  next to the houses, and the "Find a warn cell" button to search them by
  name.
- "DWD warnings" widget: the levels now and later as tiles, the advance
  notices, a cell or a house as its area; a warning that starts moves the
  widget within the minute.
- German texts everywhere (manifest, widgets, scene events, documentation).

## [1.0.0] - 2026-10-13

### Added

- DWD weather provider: the MOSMIX point forecasts of the nearest station
  (10 days, hour by hour, cut into local days), the hourly observations of
  the nearest synoptic station as current conditions, for the whole of
  Europe, from the house location (no account, no key).
- Official DWD warnings for the municipality of the house, with translated
  titles (English and French) and the German description and advice;
  Gladys is told within minutes when they change.
- "DWD warnings" and "Pollen" dashboard widgets, the "pollen level changed"
  scene trigger (one event per crossed level), the optional pollen alert.
- UV index of the nearest of 38 German cities, spread over the day by the
  sun; precipitation radar (DWD composite over the country borders) as the
  provider image.
- "Test the DWD sources" button in the configuration screen; optional
  forecast station override.

[Unreleased]: https://github.com/LM1LC3N7/gladys-dwd/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/LM1LC3N7/gladys-dwd/releases/tag/v1.0.0
