# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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
