// -----------------------------------------------------------------------------
// The official DWD warnings, as the WFS features of its GeoServer: one
// feature per (warning, municipality or district), with the CAP fields the
// DWD fills (event, severity, onset, expiry, description, instruction) in
// German. The source Home Assistant reads too (dwdwfsapi).
//
// https://maps.dwd.de/geoserver/dwd/ows
//   Warngebiete_Gemeinden / Warngebiete_Kreise  the warn cells: found by a
//                                               point, an id or a name;
//   Warnungen_Gemeinden / Warnungen_Landkreise  the warnings of one cell.
//
// Points are tested on the server (INTERSECTS / CONTAINS, latitude first:
// the layers are in EPSG:4326 with the geographic axis order). Every value
// put in a CQL filter is validated (9-digit ids) or escaped (a name): a
// filter is a query language, never a string to paste a user's text into.
// The German event name is translated here word by word (a closed
// vocabulary of a few dozen words); the texts stay German.
// -----------------------------------------------------------------------------

import { DWD_GEOSERVER_URL } from '../constants.js';
import { fetchJson } from '../http.js';
import { translateEvent } from '../i18n.js';

const PROPERTIES = [
  'IDENTIFIER',
  'MSGTYPE',
  'STATUS',
  'EVENT',
  'EC_II',
  'EC_GROUP',
  'SEVERITY',
  'URGENCY',
  'ONSET',
  'EXPIRES',
  'HEADLINE',
  'DESCRIPTION',
  'INSTRUCTION',
  'ALTITUDE',
  'CEILING',
];

// A cell kind -> the layer that lists the cells and the layer of its
// warnings. District warnings carry the district id in GC_WARNCELLID.
export const CELL_KINDS = {
  municipality: {
    cells: 'dwd:Warngebiete_Gemeinden',
    warnings: 'dwd:Warnungen_Gemeinden',
    idField: 'WARNCELLID',
    nameField: 'NAME',
  },
  district: {
    cells: 'dwd:Warngebiete_Kreise',
    warnings: 'dwd:Warnungen_Landkreise',
    idField: 'GC_WARNCELLID',
    nameField: 'AREADESC',
  },
};

export const WARNCELL_ID = /^\d{9}$/;

/** Municipality ids start with 7 or 8, district ids with 1 (and coasts 9). */
export function cellKindOf(id) {
  return /^[78]/.test(String(id)) ? 'municipality' : 'district';
}

function wfsUrl(params) {
  const query = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
  });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  return `${DWD_GEOSERVER_URL}/ows?${query}`;
}

const point = (latitude, longitude) => `POINT(${latitude.toFixed(4)} ${longitude.toFixed(4)})`;

/** The warnings in force or announced at a point. */
export function warningsUrl(latitude, longitude) {
  return wfsUrl({
    typeName: CELL_KINDS.municipality.warnings,
    propertyName: [...PROPERTIES, 'NAME'].join(','),
    CQL_FILTER: `INTERSECTS(THE_GEOM,${point(latitude, longitude)})`,
  });
}

/** The warnings of a cell typed by the user. */
export function cellWarningsUrl(id) {
  const kind = CELL_KINDS[cellKindOf(id)];
  return wfsUrl({
    typeName: kind.warnings,
    propertyName: [...PROPERTIES, kind.nameField].join(','),
    CQL_FILTER: `${kind.idField}='${id}'`,
  });
}

export function cellAtUrl(latitude, longitude) {
  return wfsUrl({
    typeName: CELL_KINDS.municipality.cells,
    propertyName: 'WARNCELLID,NAME,KREIS',
    CQL_FILTER: `CONTAINS(SHAPE,${point(latitude, longitude)})`,
    count: 1,
  });
}

export function cellByIdUrl(id) {
  const kind = CELL_KINDS[cellKindOf(id)];
  return wfsUrl({
    typeName: kind.cells,
    propertyName: kind === CELL_KINDS.municipality ? 'WARNCELLID,NAME,KREIS' : 'WARNCELLID,NAME',
    CQL_FILTER: `WARNCELLID='${id}'`,
  });
}

/** Escape a text for a CQL string literal ('' doubles a quote). */
export const cqlString = (value) => String(value).replace(/'/g, "''");

export function searchCellsUrl(text, limit = 8) {
  return wfsUrl({
    typeName: CELL_KINDS.municipality.cells,
    propertyName: 'WARNCELLID,NAME,KREIS',
    CQL_FILTER: `NAME ILIKE '%${cqlString(text)}%'`,
    sortBy: 'NAME',
    count: limit,
  });
}

const SEVERITIES = { minor: 'minor', moderate: 'moderate', severe: 'severe', extreme: 'extreme' };
// The four warning levels of the DWD (yellow, orange, red, violet).
export const LEVEL_BY_SEVERITY = { minor: 1, moderate: 2, severe: 3, extreme: 4 };

// CAP event group of the DWD -> pivot alert type. Glaze and thaw follow the
// "neige-verglas" doctrine of the pivot (snow); the groups the pivot has no
// type for stay untyped.
const GROUP_TYPES = {
  WIND: 'wind',
  THUNDERSTORM: 'thunderstorm',
  TORNADO: 'thunderstorm',
  HAIL: 'thunderstorm',
  RAIN: 'rain',
  SNOWFALL: 'snow',
  SNOWDRIFT: 'snow',
  FOG: 'fog',
  FROST: 'cold',
  GLAZE: 'snow',
  SLIPPERINESS: 'snow',
  BLACK_ICE: 'snow',
  THAW: 'rain',
  HEAT: 'heat',
  COASTAL: 'coastal',
  FLOOD: 'flood',
};

// Fallback on the German event words when the group is unknown.
const EVENT_TYPES = [
  ['thunderstorm', /GEWITTER/],
  ['snow', /SCHNEE|GL[ÄA]TTE|GLATTEIS/],
  ['wind', /B[ÖO]EN|STURM|ORKAN|WIND/],
  ['rain', /REGEN|TAUWETTER/],
  ['fog', /NEBEL/],
  ['cold', /FROST/],
  ['heat', /HITZE/],
];

/** Pivot alert type of a warning. */
export function alertType(properties) {
  const [group] = String(properties?.EC_GROUP ?? '')
    .toUpperCase()
    .split(/[;,\s]+/);
  if (GROUP_TYPES[group]) {
    return GROUP_TYPES[group];
  }
  const event = String(properties?.EVENT ?? '').toUpperCase();
  return EVENT_TYPES.find(([, pattern]) => pattern.test(event))?.[0];
}

// Scene filter values: keys are forever (scenes store them).
export const WARNING_KINDS = [
  'thunderstorm',
  'wind',
  'rain',
  'snow',
  'frost',
  'ice',
  'thaw',
  'fog',
  'heat',
  'uv',
  'other',
];

// [first, last, kind]: the event codes of the CAP DWD profile, appendix 3.1.
const CODE_RANGES = [
  [11, 16, 'wind'], // coast and open sea: near gale to severe gale
  [22, 22, 'frost'],
  [31, 49, 'thunderstorm'],
  [51, 58, 'wind'],
  [59, 59, 'fog'],
  [61, 66, 'rain'],
  [70, 76, 'snow'], // snowfall and snow drifts
  [79, 79, 'other'], // powerline vibrations
  [82, 83, 'frost'],
  [84, 87, 'ice'], // slippery roads, black ice
  [88, 89, 'thaw'],
  [90, 97, 'thunderstorm'],
  [246, 246, 'uv'],
  [247, 248, 'heat'],
];

const KIND_BY_GROUP = {
  THUNDERSTORM: 'thunderstorm',
  WIND: 'wind',
  TORNADO: 'thunderstorm',
  RAIN: 'rain',
  HAIL: 'thunderstorm',
  SNOWFALL: 'snow',
  SNOWDRIFT: 'snow',
  FOG: 'fog',
  FROST: 'frost',
  SLIPPERINESS: 'ice',
  BLACK_ICE: 'ice',
  RIME_ICE: 'ice',
  GLAZE: 'ice',
  THAW: 'thaw',
  POWERLINEVIBRATION: 'other',
  UV: 'uv',
  HEAT: 'heat',
};

/** The kind of a warning (the scene filter value), from its code or group. */
export function warningKind(properties) {
  const code = Number.parseInt(properties?.EC_II, 10);
  const range = CODE_RANGES.find(([first, last]) => code >= first && code <= last);
  if (range) {
    return range[2];
  }
  const [group] = String(properties?.EC_GROUP ?? '')
    .toUpperCase()
    .split(/[;,\s]+/);
  return KIND_BY_GROUP[group] ?? 'other';
}

// Test messages: EC_II 98/99, or EC_GROUP TEST.
const TEST_CODES = new Set([98, 99]);

const dateOrUndefined = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

// The DWD gives the altitude band in feet.
const FEET = 0.3048;

function altitudeNote(properties) {
  const from = Number(properties.ALTITUDE);
  const to = Number(properties.CEILING);
  const lower = Number.isFinite(from) && from > 0 ? Math.round((from * FEET) / 50) * 50 : undefined;
  const upper = Number.isFinite(to) && to < 9000 ? Math.round((to * FEET) / 50) * 50 : undefined;
  if (lower === undefined && upper === undefined) {
    return undefined;
  }
  if (lower !== undefined && upper !== undefined) {
    return {
      en: `Between ${lower} and ${upper} m above sea level.`,
      fr: `Entre ${lower} et ${upper} m d’altitude.`,
      de: `Zwischen ${lower} und ${upper} m über dem Meer.`,
    };
  }
  if (lower !== undefined) {
    return {
      en: `Above ${lower} m above sea level.`,
      fr: `Au-dessus de ${lower} m d’altitude.`,
      de: `Oberhalb ${lower} m über dem Meer.`,
    };
  }
  return {
    en: `Below ${upper} m above sea level.`,
    fr: `En dessous de ${upper} m d’altitude.`,
    de: `Unterhalb ${upper} m über dem Meer.`,
  };
}

// The DWD ends its lines with " \n".
const cleanText = (value) =>
  typeof value === 'string'
    ? value
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim()
    : '';

/**
 * One warning out of the CAP properties of a feature, or undefined when it
 * must not be shown (test, cancellation, exercise, expired, no level).
 */
export function parseWarning(p, now = Date.now()) {
  if (!p) {
    return undefined;
  }
  const code = Number.parseInt(p.EC_II, 10);
  const severity = SEVERITIES[String(p.SEVERITY ?? '').toLowerCase()];
  const expires = Date.parse(p.EXPIRES);
  if (
    !severity ||
    (p.STATUS !== undefined && p.STATUS !== 'Actual') ||
    String(p.MSGTYPE ?? '').toLowerCase() === 'cancel' ||
    TEST_CODES.has(code) ||
    /(^|;)TEST($|;)/.test(String(p.EC_GROUP ?? '')) ||
    (Number.isFinite(expires) && expires < now)
  ) {
    return undefined;
  }
  const event = translateEvent(p.EVENT, p.HEADLINE);
  const altitude = altitudeNote(p);
  const description = cleanText(p.DESCRIPTION);
  const instruction = cleanText(p.INSTRUCTION);
  const text = (lang) => [description, altitude?.[lang], instruction].filter(Boolean).join('\n');
  const onset = Date.parse(p.ONSET);
  return {
    id: String(p.IDENTIFIER ?? `${p.EVENT}:${p.ONSET}`),
    code: Number.isFinite(code) ? String(code) : undefined,
    group: p.EC_GROUP,
    kind: warningKind(p),
    type: alertType(p),
    severity,
    level: LEVEL_BY_SEVERITY[severity],
    // A "Vorabinformation" (advance notice of severe weather) is a watch,
    // not a warning: counted as upcoming until the DWD replaces it.
    watch:
      String(p.URGENCY ?? '').toLowerCase() === 'future' || /VORABINFORMATION/i.test(p.EVENT ?? ''),
    event,
    headline: p.HEADLINE,
    description: { en: text('en'), fr: text('fr'), de: text('de') },
    instruction,
    area: p.NAME ?? p.AREADESC,
    start: dateOrUndefined(p.ONSET),
    end: dateOrUndefined(p.EXPIRES),
    onsetMs: Number.isFinite(onset) ? onset : undefined,
    expiresMs: Number.isFinite(expires) ? expires : undefined,
  };
}

/** Whether a warning is in force at an instant (not a watch, started, not ended). */
export function inForce(warning, now = Date.now()) {
  if (warning.watch) {
    return false;
  }
  if (warning.onsetMs !== undefined && warning.onsetMs > now) {
    return false;
  }
  return warning.expiresMs === undefined || warning.expiresMs > now;
}

const severityRank = (severity) => LEVEL_BY_SEVERITY[severity] ?? 0;

/**
 * The warnings of a WFS answer, as the bilingual alerts the pivot is built
 * from: one entry per warning, expired and cancelled ones dropped, most
 * severe first.
 */
export function parseWarnings(body, now = Date.now()) {
  const alerts = new Map();
  for (const feature of body?.features ?? []) {
    const warning = parseWarning(feature?.properties, now);
    // A district message holds several warnings under one identifier.
    const key = warning && `${warning.id}|${warning.event?.de}|${warning.start}`;
    if (warning && !alerts.has(key)) {
      alerts.set(key, warning);
    }
  }
  return [...alerts.values()].sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) || (a.onsetMs ?? 0) - (b.onsetMs ?? 0),
  );
}

const cellOf = (feature, kind) =>
  feature
    ? {
        id: String(feature.properties.WARNCELLID),
        name: String(feature.properties.NAME ?? feature.properties.WARNCELLID),
        district: feature.properties.KREIS ? String(feature.properties.KREIS) : undefined,
        kind,
      }
    : undefined;

export async function fetchWarnings(latitude, longitude, { timeout, now = Date.now() } = {}) {
  const body = await fetchJson(warningsUrl(latitude, longitude), { timeout });
  return parseWarnings(body, now);
}

/** The warnings of a cell typed by the user (9 digits, validated). */
export async function fetchCellWarnings(id, { timeout, now = Date.now() } = {}) {
  if (!WARNCELL_ID.test(String(id))) {
    throw new Error(`Invalid warn cell id "${id}"`);
  }
  const body = await fetchJson(cellWarningsUrl(id), { timeout });
  return parseWarnings(body, now);
}

/** The municipality cell holding a point, or undefined outside Germany. */
export async function fetchCellAt(latitude, longitude, { timeout } = {}) {
  const body = await fetchJson(cellAtUrl(latitude, longitude), { timeout });
  return cellOf(body?.features?.[0], 'municipality');
}

/** The cell of an id, or undefined when unknown. */
export async function fetchCellById(id, { timeout } = {}) {
  if (!WARNCELL_ID.test(String(id))) {
    return undefined;
  }
  const body = await fetchJson(cellByIdUrl(id), { timeout });
  return cellOf(body?.features?.[0], cellKindOf(id));
}

/** Municipality cells whose name contains a text (letters, digits, - . ' ( )). */
export async function searchCells(text, { timeout, limit = 8 } = {}) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/[^\p{L}\p{N} .'()-]/gu, '');
  if (cleaned.length < 2) {
    return [];
  }
  const body = await fetchJson(searchCellsUrl(cleaned, limit), { timeout });
  return (body?.features ?? []).map((feature) => cellOf(feature, 'municipality'));
}
