// -----------------------------------------------------------------------------
// DWD weather codes -> conditions of the Gladys pivot enum.
//
//   - MOSMIX `ww`: the WMO SYNOP present weather code (0 to 99, code table
//     4677), with the cloud cover `N` for the codes that say nothing of the
//     sky (0 to 3);
//   - the hourly observations: the DWD "present weather" key of the poi
//     reports (1 to 31, a condensed table of its own).
//
// A condition the source cannot tell apart is sent as the broader value
// (the doctrine of the pivot), and "night" is never sent: the real condition
// goes with `is_day: false`.
// -----------------------------------------------------------------------------

export const CONDITIONS = {
  CLEAR: 'clear',
  PARTLY_CLOUDY: 'partly-cloudy',
  CLOUD: 'cloud',
  FOG: 'fog',
  DRIZZLE: 'drizzle',
  RAIN: 'rain',
  POURING: 'pouring',
  SLEET: 'sleet',
  HAIL: 'hail',
  SNOW: 'snow',
  THUNDERSTORM: 'thunderstorm',
  WIND: 'wind',
  UNKNOWN: 'unknown',
  FREEZING_RAIN: 'freezing-rain',
  FREEZING_FOG: 'freezing-fog',
  SNOW_THUNDERSTORM: 'snow-thunderstorm',
  SANDSTORM: 'sandstorm',
  TORNADO: 'tornado',
  HURRICANE: 'hurricane',
};

const C = CONDITIONS;

// Severity order of the conditions, to pick the one that matters in a day
// (the highest wins) and to tell "worse" from "better" in the texts.
export const SEVERITY = [
  C.UNKNOWN,
  C.CLEAR,
  C.PARTLY_CLOUDY,
  C.CLOUD,
  C.WIND,
  C.FOG,
  C.FREEZING_FOG,
  C.DRIZZLE,
  C.RAIN,
  C.SLEET,
  C.SNOW,
  C.POURING,
  C.HAIL,
  C.FREEZING_RAIN,
  C.SANDSTORM,
  C.THUNDERSTORM,
  C.SNOW_THUNDERSTORM,
  C.TORNADO,
  C.HURRICANE,
];

export const severityRank = (condition) => Math.max(0, SEVERITY.indexOf(condition));

/** Sky condition from the total cloud cover (percent, 0 to 100). */
export function skyCondition(cloudCover) {
  if (!Number.isFinite(cloudCover)) {
    return C.UNKNOWN;
  }
  if (cloudCover <= 20) {
    return C.CLEAR;
  }
  return cloudCover <= 70 ? C.PARTLY_CLOUDY : C.CLOUD;
}

// WMO code table 4677 (ww), by range.
function wmoCondition(code) {
  if (code <= 3) {
    return undefined; // the sky, from the cloud cover
  }
  if (code <= 9) {
    // Haze, smoke, dust (6 to 9 dust or sand raised by the wind).
    return code >= 6 ? C.SANDSTORM : C.FOG;
  }
  if (code <= 12) {
    return C.FOG; // mist, shallow fog
  }
  if (code <= 16) {
    return code === 13 ? C.THUNDERSTORM : C.RAIN; // lightning; precipitation in sight
  }
  if (code === 17) {
    return C.THUNDERSTORM;
  }
  if (code === 18) {
    return C.WIND; // squalls
  }
  if (code === 19) {
    return C.TORNADO; // funnel cloud
  }
  if (code <= 29) {
    // Precipitation, fog or thunderstorm during the past hour, not now.
    return {
      20: C.DRIZZLE,
      21: C.RAIN,
      22: C.SNOW,
      23: C.SLEET,
      24: C.FREEZING_RAIN,
      25: C.RAIN,
      26: C.SNOW,
      27: C.HAIL,
      28: C.FOG,
      29: C.THUNDERSTORM,
    }[code];
  }
  if (code <= 35) {
    return C.SANDSTORM;
  }
  if (code <= 39) {
    return C.SNOW; // drifting or blowing snow
  }
  if (code <= 49) {
    return code >= 48 ? C.FREEZING_FOG : C.FOG;
  }
  if (code <= 59) {
    if (code === 56 || code === 57) {
      return C.FREEZING_RAIN; // freezing drizzle
    }
    return code >= 58 ? C.RAIN : C.DRIZZLE; // 58-59: drizzle and rain
  }
  if (code <= 69) {
    if (code === 66 || code === 67) {
      return C.FREEZING_RAIN;
    }
    if (code >= 68) {
      return C.SLEET; // rain and snow
    }
    return code >= 64 ? C.POURING : C.RAIN;
  }
  if (code <= 79) {
    return code === 79 ? C.SLEET : C.SNOW; // 79: ice pellets
  }
  if (code <= 82) {
    return code === 80 ? C.RAIN : C.POURING; // rain showers
  }
  if (code <= 84) {
    return C.SLEET; // rain and snow showers
  }
  if (code <= 86) {
    return C.SNOW; // snow showers
  }
  if (code <= 90) {
    return C.HAIL; // snow pellets, hail showers
  }
  if (code <= 94) {
    // Thunderstorm during the past hour, precipitation now.
    return code >= 93 ? C.SNOW_THUNDERSTORM : C.THUNDERSTORM;
  }
  return C.THUNDERSTORM; // 95-99, with hail or heavy
}

/**
 * Condition of a MOSMIX hour: the significant weather code, the cloud cover
 * when the code only says "no significant weather".
 * @param {number} ww WMO present weather code
 * @param {number} cloudCover percent
 */
export function mosmixCondition(ww, cloudCover) {
  const code = Number(ww);
  if (!Number.isFinite(code) || code < 0 || code > 99) {
    return skyCondition(cloudCover);
  }
  return wmoCondition(Math.round(code)) ?? skyCondition(cloudCover);
}

// The "present weather" key of the hourly poi reports.
const POI_CODES = {
  1: C.CLEAR, // wolkenlos
  2: C.PARTLY_CLOUDY, // heiter
  3: C.CLOUD, // bewölkt
  4: C.CLOUD, // bedeckt
  5: C.FOG,
  6: C.FREEZING_FOG,
  7: C.RAIN, // leichter Regen
  8: C.RAIN,
  9: C.POURING,
  10: C.FREEZING_RAIN,
  11: C.FREEZING_RAIN,
  12: C.SLEET,
  13: C.SLEET,
  14: C.SNOW,
  15: C.SNOW,
  16: C.SNOW,
  17: C.SLEET, // Eiskörner (ice pellets)
  18: C.RAIN, // Regenschauer
  19: C.POURING,
  20: C.SLEET,
  21: C.SLEET,
  22: C.SNOW,
  23: C.SNOW,
  24: C.HAIL, // Graupelschauer
  25: C.HAIL,
  26: C.THUNDERSTORM,
  27: C.THUNDERSTORM,
  28: C.THUNDERSTORM,
  29: C.THUNDERSTORM, // mit Hagel
  30: C.THUNDERSTORM,
  31: C.WIND, // Sturm
};

/**
 * Condition of an hourly observation: the present weather key, the cloud
 * cover when the station reports none.
 */
export function observationCondition(key, cloudCover) {
  return POI_CODES[Number(key)] ?? skyCondition(cloudCover);
}
