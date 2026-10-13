// -----------------------------------------------------------------------------
// Feels-like temperature (pure functions).
//
// The DWD publishes no feels-like value in MOSMIX nor in the observations
// (its "gefühlte Temperatur" needs the radiation balance of the Klima-Michel
// model). The apparent temperature of Steadman (1994), the one of the
// Australian Bureau of Meteorology, covers heat and cold with one formula
// from the air temperature, the humidity and the wind: AT = T + 0.33 e
// − 0.70 v − 4.0, e the water vapour pressure in hPa, v the wind in m/s.
// -----------------------------------------------------------------------------

/** Water vapour pressure (hPa) from the temperature (°C) and the humidity (%). */
export function vapourPressure(temperature, humidity) {
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    return undefined;
  }
  const saturation = 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  return (Math.min(Math.max(humidity, 0), 100) / 100) * saturation;
}

/** Relative humidity (%) from the temperature and the dew point (°C, Magnus). */
export function humidityFromDewPoint(temperature, dewPoint) {
  if (!Number.isFinite(temperature) || !Number.isFinite(dewPoint)) {
    return undefined;
  }
  const a = 17.625;
  const b = 243.04;
  const rh =
    100 * Math.exp((a * dewPoint) / (b + dewPoint) - (a * temperature) / (b + temperature));
  return Math.min(100, Math.max(0, rh));
}

/** Dew point (°C) from the temperature and the relative humidity (Magnus). */
export function dewPointFromHumidity(temperature, humidity) {
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity <= 0) {
    return undefined;
  }
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(Math.min(humidity, 100) / 100) + (a * temperature) / (b + temperature);
  return (b * gamma) / (a - gamma);
}

/**
 * Apparent temperature (°C).
 * @param {{ temperature: number, humidity?: number, wind_speed?: number }} c wind in m/s
 */
export function apparentTemperature({ temperature, humidity, wind_speed: wind }) {
  if (!Number.isFinite(temperature)) {
    return undefined;
  }
  const e = vapourPressure(temperature, humidity) ?? vapourPressure(temperature, 50);
  const v = Number.isFinite(wind) ? Math.max(0, wind) : 0;
  return temperature + 0.33 * e - 0.7 * v - 4;
}
