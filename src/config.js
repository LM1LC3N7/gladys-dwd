// -----------------------------------------------------------------------------
// Integration configuration (manifest `config_schema`).
//
// The house coordinates are NOT configuration: Gladys sends them with every
// weather request, and the background loop reads them with getHouses().
// -----------------------------------------------------------------------------

// MUST stay consistent with the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  official_alerts: true,
  pollen_alerts: false,
  radar_image: true,
  station: '',
};

// A form may send "true"/"false" strings.
function bool(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  return fallback;
}

// A MOSMIX station id: 5 characters, digits or capitals ("10384", "A051").
function stationId(value) {
  const id = String(value ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{3,6}$/.test(id) ? id : '';
}

/** Merge the user config with the defaults, coercing the types. */
export function normalizeConfig(raw = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CONFIG).map(([key, fallback]) => [
      key,
      typeof fallback === 'boolean' ? bool(raw?.[key], fallback) : stationId(raw?.[key]),
    ]),
  );
}
