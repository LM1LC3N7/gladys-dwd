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
  warncell_ids: '',
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

// "809180117, 103359000" -> the 9-digit ids, deduplicated, as one string.
function warncellIds(value) {
  const ids = String(value ?? '')
    .split(/[\s,;]+/)
    .filter((id) => /^\d{9}$/.test(id));
  return [...new Set(ids)].join(',');
}

/** Merge the user config with the defaults, coercing the types. */
export function normalizeConfig(raw = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CONFIG).map(([key, fallback]) => {
      if (typeof fallback === 'boolean') {
        return [key, bool(raw?.[key], fallback)];
      }
      return [key, key === 'warncell_ids' ? warncellIds(raw?.[key]) : stationId(raw?.[key])];
    }),
  );
}

/** The warn cell ids of a normalized config, as a list. */
export const configCellIds = (config) =>
  String(config?.warncell_ids ?? '')
    .split(',')
    .filter(Boolean);
