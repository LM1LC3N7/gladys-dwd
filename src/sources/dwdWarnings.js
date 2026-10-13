// -----------------------------------------------------------------------------
// The official DWD warnings, as the WFS features of its GeoServer: one
// feature per (warning, municipality), with the CAP fields the DWD fills
// (event, severity, onset, expiry, description, instruction) in German.
//
// https://maps.dwd.de/geoserver/dwd/ows?service=WFS&typeName=dwd:Warnungen_Gemeinden
//
// The point of the house is tested on the server (INTERSECTS, latitude
// first: the layer is in EPSG:4326 with the geographic axis order). The
// German event name is translated here word by word (the DWD event names
// are a closed vocabulary of a few dozen words); the texts stay German.
// -----------------------------------------------------------------------------

import { DWD_GEOSERVER_URL } from '../constants.js';
import { fetchJson } from '../http.js';
import { translateEvent } from '../i18n.js';

const LAYER = 'dwd:Warnungen_Gemeinden';
const PROPERTIES = [
  'IDENTIFIER',
  'NAME',
  'WARNCELLID',
  'MSGTYPE',
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

export function warningsUrl(latitude, longitude) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: LAYER,
    outputFormat: 'application/json',
    propertyName: PROPERTIES.join(','),
    CQL_FILTER: `INTERSECTS(THE_GEOM,POINT(${latitude.toFixed(4)} ${longitude.toFixed(4)}))`,
  });
  return `${DWD_GEOSERVER_URL}/ows?${params}`;
}

const SEVERITIES = { minor: 'minor', moderate: 'moderate', severe: 'severe', extreme: 'extreme' };

// CAP event group of the DWD -> pivot alert type. Glaze and thaw follow the
// "neige-verglas" doctrine of the pivot (snow); the groups the pivot has no
// type for stay untyped.
const GROUP_TYPES = {
  WIND: 'wind',
  THUNDERSTORM: 'thunderstorm',
  RAIN: 'rain',
  SNOWFALL: 'snow',
  FOG: 'fog',
  FROST: 'cold',
  GLAZE: 'snow',
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

export function alertType(properties) {
  const group = String(properties?.EC_GROUP ?? '').toUpperCase();
  if (GROUP_TYPES[group]) {
    return GROUP_TYPES[group];
  }
  const event = String(properties?.EVENT ?? '').toUpperCase();
  return EVENT_TYPES.find(([, pattern]) => pattern.test(event))?.[0];
}

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
    };
  }
  if (lower !== undefined) {
    return { en: `Above ${lower} m above sea level.`, fr: `Au-dessus de ${lower} m d’altitude.` };
  }
  return { en: `Below ${upper} m above sea level.`, fr: `En dessous de ${upper} m d’altitude.` };
}

/**
 * The warnings of a WFS answer, as the bilingual alerts the pivot is built
 * from. One entry per warning (the point lies in one municipality, but a
 * warning updated keeps its identifier), expired ones dropped.
 */
export function parseWarnings(body, now = Date.now()) {
  const alerts = new Map();
  for (const feature of body?.features ?? []) {
    const p = feature?.properties;
    if (!p || String(p.MSGTYPE ?? '').toLowerCase() === 'cancel') {
      continue;
    }
    const expires = Date.parse(p.EXPIRES);
    if (Number.isFinite(expires) && expires < now) {
      continue;
    }
    const id = String(p.IDENTIFIER ?? `${p.EVENT}:${p.ONSET}`);
    if (alerts.has(id)) {
      continue;
    }
    const event = translateEvent(p.EVENT, p.HEADLINE);
    const altitude = altitudeNote(p);
    const text = (lang) =>
      [p.DESCRIPTION, altitude?.[lang], p.INSTRUCTION].filter(Boolean).join('\n');
    alerts.set(id, {
      id,
      code: p.EC_II === undefined ? undefined : String(p.EC_II),
      group: p.EC_GROUP,
      type: alertType(p),
      severity: SEVERITIES[String(p.SEVERITY ?? '').toLowerCase()] ?? 'minor',
      event,
      headline: p.HEADLINE,
      description: { en: text('en'), fr: text('fr') },
      instruction: p.INSTRUCTION,
      area: p.NAME,
      start: dateOrUndefined(p.ONSET),
      end: dateOrUndefined(p.EXPIRES),
    });
  }
  return [...alerts.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

const severityRank = (severity) => ['minor', 'moderate', 'severe', 'extreme'].indexOf(severity);

export async function fetchWarnings(latitude, longitude, { timeout, now = Date.now() } = {}) {
  const body = await fetchJson(warningsUrl(latitude, longitude), { timeout });
  return parseWarnings(body, now);
}
