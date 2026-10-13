# TODO

## Before the first release

- [x] Check the CI (Docker build, Node 22 and 24).
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Run the store validator once the image is published.
- [ ] Test on a real Gladys 5.1+: widgets rendering, the pollen trigger in
      the scene editor, the radar in the weather widget, warning nudges.

## To check when it happens

- [ ] A warning with an altitude band on a real house (the band is said in
      metres in the description).
- [ ] The pollen season: the tracker and the widget were written in October
      with every index at 0 (the fixtures were edited for the tests).
- [ ] A MOSMIX station whose kmz holds several placemarks (the single-station
      files hold one).
- [ ] The time zone outlines of `src/timezone.js` against real houses near
      a border (Alsace, the Finnish-Swedish border, the Baltics).
- [ ] The DWD radar range grows from 150 to 180 km on 2026-11-24 (said in
      the WMS capabilities): nothing to do, noted.

## Ideas

- [ ] Persist the last snapshot in `/data` so a restart during an outage
      still serves the weather.
- [ ] Bio-weather ("Biowetter") and thermal stress ("gt.json") of the DWD
      health service, as a widget.
- [ ] Warnings of the coasts and lakes (`dwd:Warnungen_Kueste`,
      `dwd:Warnungen_Binnenseen`) for houses by the sea (the coast cells,
      ids starting with 9, are read through the district layer today).
- [ ] Spanish texts (guim31's DWD warnings integration has them).
- [ ] A "rain in the next hour" trigger from the RV radar forecast.
- [ ] Austria (GeoSphere) and Switzerland (MeteoSwiss) warnings for the
      MOSMIX users there.
