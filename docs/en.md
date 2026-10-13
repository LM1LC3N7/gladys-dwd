# DWD (Deutscher Wetterdienst) for Gladys

This integration makes the **German national weather service** (Deutscher
Wetterdienst, DWD) the weather provider of Gladys. The dashboard weather
widget and the assistant ("what will the weather be like tomorrow?") use its
MOSMIX forecasts and its hourly observations. It adds what you need in
Germany: the **official warnings**, the **pollen index**, the **UV index** and
the precipitation radar.

Nothing to enter, no account, no key: everything comes from the DWD open data
servers, for the location of your house. The forecasts and observations cover
the whole of **Europe** (about 4,300 stations); the warnings, pollen, UV and
radar cover **Germany**.

> Unofficial connector: not affiliated with nor endorsed by the Deutscher
> Wetterdienst.

## Installation

1. Install the integration from the Gladys catalog (Gladys 5.1 or newer).
2. Accept the access to the **location of your houses**: the weather is the
   one of the house, nothing else to enter.
3. Check that your house is placed on the map (**Settings → Houses**).
   Without a location, there is no weather.
4. In the **Configuration** screen, click **Test the DWD sources**: the
   message says what each source answered (forecasts, warnings, pollen) and
   which stations are used.
5. Optional: add **warn cells** (a holiday home, your parents' town, a whole
   district) by their DWD id; the **Find a warn cell** button searches the
   municipalities by name.

Once installed, the integration takes precedence over the OpenWeather service
built into Gladys. The weather widget can also pick it explicitly.

## Where the weather comes from

- **Forecasts**: the DWD **MOSMIX** point forecast of the station nearest to
  your house, 10 days hour by hour (temperature, feels-like, humidity,
  pressure, wind and gusts, cloud cover, visibility, precipitation and its
  probability, sunshine). Updated four times a day (03, 09, 15 and 21 UTC).
  In Germany there is a forecast point every few kilometres; elsewhere in
  Europe, one per large town or airport.
- **Current conditions**: the hourly **observations** of the nearest
  synoptic station (about 630 in Europe, 60 km away at most). Without one,
  the forecast of the current hour stands in. The "Test" button names both
  stations.
- **Warnings**: the official DWD warnings for the municipality of your
  house, with a translated title; the texts are in German.
- **Pollen**: the DWD pollen index of your region.
- **UV index**: the daily maximum forecast for the nearest of 38 German
  cities, spread over the day by the sun.
- **Radar**: the DWD precipitation composite, 1 km, every 5 minutes.

The feels-like temperature is the apparent temperature of Steadman (air
temperature, humidity and wind), the one the Australian weather service
uses: the DWD publishes none in its open data.

## Configuration

- **Official warnings** (on by default) — the DWD warnings in force for
  your house (wind, thunderstorms, rain, snow, frost, black ice, fog,
  heat…). They show in the weather widget and feed the "Weather alert"
  scene trigger of Gladys. When a warning appears, changes level or ends,
  the integration tells Gladys within minutes instead of waiting for its
  30-minute check. Germany only.
- **Additional warn cells** (empty by default) — DWD warn cell ids (9
  digits, separated by commas): a municipality (ids starting with 7 or 8)
  or a whole district (ids starting with 1). Their warnings feed the widget,
  the scene triggers and the scene action, not the weather of the houses.
- **Pollen alerts** (off by default) — adds an alert when the pollen index
  of your region reaches a moderate exposure (2 on the DWD scale), raised to
  "moderate" severity at a high exposure (3). Not an official warning.
- **Precipitation radar** (on by default) — a 300 × 200 km radar image
  centered on your house. Turn on the "provider images" option of the
  weather widget to see it. Germany and its borders.
- **Forecast station (advanced)** — empty, the nearest MOSMIX station is
  used. To force another one, enter its id from the DWD station catalog
  (`10384` for Berlin-Tempelhof, `A051` for a local point).

## The "DWD warnings" widget

For a house in Germany or a typed warn cell:

- two tiles, the **level now** and the **level later** (the four levels of
  the DWD: 1 weather warning, 2 significant weather, 3 severe weather,
  4 extreme weather);
- the warnings in force, then the announced ones (and the advance notices
  of severe weather), most severe first, each with its **period** in local
  time, a **level badge** and the official DWD **text and advice** (in
  German) in the detail panel; in German the title is the official headline.

**House or warn cell** setting: the name of the house, or a warn cell id of
the configuration. Empty, it is the first area followed.

## The "Pollen" widget

The DWD **pollen index** (Pollenflug-Gefahrenindex) covers eight pollen:
hazel, alder, ash, birch, grasses, rye, mugwort and ragweed, for 27 regions
of Germany, today, tomorrow and the day after. The widget shows:

- the **exposure today** on a gauge, with the level of the highest pollen;
- the peaks of **tomorrow** and the **day after**;
- each pollen in the air today with its value and level;
- the **advice** of the level.

| Index | Level    |
| ----- | -------- |
| 0     | None     |
| 1     | Low      |
| 2     | Moderate |
| 3     | High     |

In-between values ("1-2") round up. The index is published once a day
around 11:00; before that, the forecast of the day before applies.

## Scenes

Three triggers, checked every 5 minutes:

- **DWD warning issued** — the DWD issued a warning for an area (a house in
  Germany or a warn cell), raised its level, or turned an advance notice
  into a warning. Filters: **area** (house name or cell id), **levels**
  (tick 3 and 4 for severe weather only), **warning types** (thunderstorms,
  wind, rain, snow, frost, ice, thaw, fog, heat, UV, other). Variables:
  `title`, `type`, `level` (1 to 4), `level_name`, `start`, `end` (local,
  as "tomorrow 06:00"), `in_force`, `description` and `instruction` (the
  German texts), `summary`, `area_name`, `house`.
- **DWD warning ended** — no warning of a type remains for an area: its end
  time passed and the DWD did not extend it. Filters: area, types.
- **Pollen level changed** — the pollen index of a house (its highest
  pollen of the day) reaches a new level.

Warnings are compared by type and level, never by the DWD identifier (an
updated warning gets a new one): an update at the same level fires
nothing. What was announced is kept in the integration data: a restart
fires nothing again, and a warning issued meanwhile fires once.

One scene action:

- **Current DWD warnings** — a summary of the warnings in force and
  announced, ready to send in a message (`{{summary}}`), with `count`,
  `current_level` and `upcoming_level` for a following condition. Field
  **area**: a house name or a cell id, empty for all.

Examples: a level 3 or 4 warning → send "{{triggerEvent.data.title}},
{{triggerEvent.data.start}} – {{triggerEvent.data.end}}" and close the
shutters; wind or thunderstorms from level 2 → "put the garden furniture
away"; every morning at 7, the summary of the day on Telegram when there
is one.

Pollen filters, all optional:

- **Level reached** — e.g. "High". The scene fires even when the index jumps
  over this level (from "none" to "high").
- **Direction** — "Getting worse" or "Getting better".
- **House** — the exact name of the house in Gladys (empty = all).

The next actions can read `{{triggerEvent.data.summary}}` (a sentence ready
to send), `{{triggerEvent.data.pollen}}` (the pollen at that level),
`{{triggerEvent.data.value}}`, `{{triggerEvent.data.current_level}}`, etc.

Examples: close the windows and turn the ventilation to recirculation when
the level reaches "Moderate" in the birch season; send a notification in the
morning when the grasses reach "High".

The first evaluation after a start fires nothing (a restart in the middle of
the season must not replay every scene). For the official warnings, use the
**Weather alert** trigger of Gladys itself.

## Good to know

- **Outside Germany**: the forecasts and observations work wherever MOSMIX
  has a station (all of Europe); the warnings, pollen, UV index and radar
  say they are not available.
- Far from any station (the sea, outside Europe), the integration says so
  in the Configuration screen.
- The MOSMIX forecasts carry no UV index: the UV comes from the DWD daily
  forecast of the nearest city, 150 km away at most.
- When the DWD does not answer, the last known weather stays shown for up
  to 6 hours.
- The data is cached 15 minutes (5 for the warnings and the radar, 1 hour
  for the pollen and UV indices).

## Sources and licences

Data: Deutscher Wetterdienst, open data (GeoNutzungsverordnung, attribution
"Datenbasis: Deutscher Wetterdienst"): MOSMIX forecasts, hourly observations,
warnings, pollen and UV indices, radar composite; country borders of the
radar image: GeoBasis-DE / BKG. The pollen advice is the integration's, not
the DWD's. This integration is neither affiliated with nor endorsed by the
Deutscher Wetterdienst.
