// -----------------------------------------------------------------------------
// Dashboard widgets "DWD warnings", "Pollen" and "Air quality" (manifest
// `widgets`, Gladys 5.2+).
//
// DWD warnings: the levels now and later as two tiles, then the warnings in
// force and announced of an area (a house in Germany or a typed warn cell),
// most important first, each with its period, a level badge and the official
// text behind a tap.
//
// Pollen: the DWD pollen index for today, tomorrow and the day after, the
// pollen in the air, with the advice of the level.
//
// Air quality: the UBA index of the hour at the nearest measuring station,
// pollutant by pollutant, the worst hour of the day, with the advice.
//
// The content is declarative (core vocabulary, no HTML); `onWidgetGet`
// receives no coordinates: the house comes from the `house` setting (a
// house picked in Gladys, its selector; empty = first house), the warnings
// widget also takes a warn cell id (`cell`), resolved against the watcher.
// Budget of the core: 8 components, 2 texts at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { AIR_QUALITY_WIDGET, POLLEN_WIDGET, WARNINGS_WIDGET } from './constants.js';
import { airQualityLevelOf, getAirQualityLevel } from './airQuality.js';
import {
  POLLEN_KEYS_IN_SEASON_ORDER,
  POLLEN_NAMES,
  formatPollen,
  getPollenLevel,
  peakPollen,
  pollenLevelOf,
} from './pollen.js';
import { LEVEL_NAMES, WORDS, clock, period, textLanguage, warningTitle } from './i18n.js';
import { localDate } from './pivot.js';
import { isInGermanyArea } from './geo.js';
import { utcOffsetMinutes } from './timezone.js';
import { inForce } from './sources/dwdWarnings.js';

const logger = createLogger({ name: 'widgets' });

const CONTENT_TTL = 300;
const MESSAGE_TTL = 60;
const MAX_ITEMS = 8;
const DWD_PAGE = 'https://www.dwd.de/warnungen';

// The vocabulary of the widgets has six colors, the DWD four levels plus
// "none": yellow (1) and orange (2) share `warning`, red (3) and violet (4)
// share `danger`, the number makes the difference.
export const LEVEL_COLORS = [
  WIDGET_COLORS.SUCCESS,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.DANGER,
  WIDGET_COLORS.DANGER,
];
export const LEVEL_ICONS = ['check-circle', 'info', 'alert-triangle', 'alert-octagon', 'zap'];

/** Theme color of a pollen level. */
export function pollenColor(levelKey) {
  return (
    {
      none: WIDGET_COLORS.SUCCESS,
      low: WIDGET_COLORS.INFO,
      moderate: WIDGET_COLORS.WARNING,
      high: WIDGET_COLORS.DANGER,
    }[levelKey] ?? WIDGET_COLORS.NEUTRAL
  );
}

function message(text) {
  return { ttl_seconds: MESSAGE_TTL, components: [{ type: 'text', variant: 'body', text }] };
}

const OUTSIDE_GERMANY = {
  en: 'The DWD warnings, the pollen and the air quality indices cover Germany only: this house is outside.',
  fr: 'Les avertissements du DWD, l’indice pollinique et la qualité de l’air ne couvrent que l’Allemagne : cette maison est en dehors.',
  de: 'DWD-Warnungen, Pollenindex und Luftqualität gelten nur für Deutschland: dieses Zuhause liegt außerhalb.',
};

function noHouse(name) {
  return message(
    name
      ? {
          en: `No located house or warn cell named "${name}".`,
          fr: `Aucune maison localisée ni cellule d’alerte nommée « ${name} ».`,
          de: `Kein Zuhause mit Standort und keine Warnzelle namens „${name}“.`,
        }
      : {
          en: 'No location yet: place your house on the map in Gladys.',
          fr: 'Aucune position : placez votre maison sur la carte dans Gladys.',
          de: 'Noch kein Standort: platziere dein Zuhause in Gladys auf der Karte.',
        },
  );
}

const truncate = (text, max) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text;

const all = (fn) => ({ en: fn('en'), fr: fn('fr'), de: fn('de') });

function levelTile(label, level) {
  return {
    type: 'value',
    label,
    value: all((lang) => (level === 0 ? WORDS[lang].none : WORDS[lang].level(level))),
    color: LEVEL_COLORS[level],
    icon: LEVEL_ICONS[level],
  };
}

function card(warning, active, context) {
  const span = period(warning, active, context);
  const { language: lang } = context;
  const official = [warning.description?.de, warning.instruction].filter(Boolean).join('\n\n');
  const german = {
    en: 'Official text (German):',
    fr: 'Texte officiel (en allemand) :',
    de: '',
  }[lang];
  return {
    title: truncate(warningTitle(warning, lang), 60),
    subtitle: truncate(warning.watch ? `${WORDS[lang].watch} · ${span}` : span, 60),
    date: warning.start,
    badge: {
      text: all((l) => WORDS[l].level(warning.level)),
      color: LEVEL_COLORS[warning.level],
    },
    ...(official
      ? {
          description: truncate(
            lang === 'de' ? official : `${german}\n${warning.headline ?? ''}\n\n${official}`,
            2000,
          ),
        }
      : {}),
    links: [
      {
        url: DWD_PAGE,
        label: { en: 'DWD warnings', fr: 'Avertissements DWD', de: 'DWD-Warnungen' },
      },
    ],
  };
}

/**
 * Build the warnings widget content (pure: tested without network).
 * @param {object[]} alerts see src/sources/dwdWarnings.js
 * @param {{ area?: object, now?: number, language?: string, fetchedAt?: number }} options
 */
export function buildWarningsContent(alerts, { area, now = Date.now(), language, fetchedAt } = {}) {
  const lang = textLanguage(language);
  const timeZone = area?.timeZone ?? 'Europe/Berlin';
  const context = { now, timeZone, language: lang };
  const active = alerts.filter((a) => inForce(a, now));
  const upcoming = alerts.filter((a) => !inForce(a, now));
  const currentLevel = Math.max(0, ...active.map((a) => a.level));
  const upcomingLevel = Math.max(0, ...upcoming.map((a) => a.level));
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: all((l) =>
        alerts.length === 0
          ? LEVEL_NAMES[l][0]
          : `${LEVEL_NAMES[l][Math.max(currentLevel, upcomingLevel)]} · ${alerts.length}`,
      ),
    },
    levelTile(
      all((l) => WORDS[l].now),
      currentLevel,
    ),
    levelTile(
      all((l) => WORDS[l].later),
      upcomingLevel,
    ),
  ];
  const items = [
    ...active.map((w) => card(w, true, context)),
    ...upcoming.map((w) => card(w, false, context)),
  ].slice(0, MAX_ITEMS);
  if (items.length > 0) {
    components.push({ type: 'card-list', display: 'list', items });
  }
  const name = truncate(area?.name || alerts[0]?.area || '', 30);
  const at = fetchedAt ? clock(fetchedAt, timeZone) : undefined;
  components.push({
    type: 'text',
    variant: 'caption',
    text: all((l) =>
      truncate(
        {
          en: `DWD warnings${name ? ` for ${name}` : ''}${at ? `, read at ${at}` : ''}.`,
          fr: `Avertissements du DWD${name ? ` pour ${name}` : ''}${at ? `, lus à ${at}` : ''}.`,
          de: `DWD-Warnungen${name ? ` für ${name}` : ''}${at ? `, gelesen um ${at}` : ''}.`,
        }[l],
        80,
      ),
    ),
  });
  return { ttl_seconds: CONTENT_TTL, components };
}

const DAY_LABELS = [
  { en: 'Today', fr: 'Aujourd’hui', de: 'Heute' },
  { en: 'Tomorrow', fr: 'Demain', de: 'Morgen' },
  { en: 'Day after', fr: 'Après-demain', de: 'Übermorgen' },
];

/**
 * Build the pollen widget content (pure: tested without network).
 * @param {object} pollen see src/sources/dwdPollen.js
 * @param {{ today: string }} options local calendar date of the house
 */
export function buildPollenContent(pollen, { today }) {
  const days = pollen.days.filter((d) => d.date >= today).slice(0, 3);
  const current = days[0];
  const peak = peakPollen(current);
  const components = [];
  if (!peak) {
    return message({
      en: 'No pollen forecast for today yet.',
      fr: 'Pas encore de prévision pollinique pour aujourd’hui.',
      de: 'Noch keine Pollenvorhersage für heute.',
    });
  }
  const level = getPollenLevel(peak.level);
  const color = pollenColor(peak.level);
  components.push({
    type: 'text',
    variant: 'heading',
    text: {
      en: `Pollen · ${level.label.en}`,
      fr: `Pollens · ${level.label.fr}`,
      de: `Pollen · ${level.label.de}`,
    },
  });
  components.push({
    type: 'gauge',
    value: peak.value,
    min: 0,
    max: 3,
    label:
      current.date === today
        ? DAY_LABELS[0]
        : { en: 'Next day', fr: 'Prochain jour', de: 'Nächster Tag' },
    color,
  });
  for (const [i, day] of days.slice(1).entries()) {
    const dayPeak = peakPollen(day);
    if (dayPeak) {
      components.push({
        type: 'value',
        label: DAY_LABELS[i + 1],
        value: formatPollen(dayPeak.value),
        icon: 'calendar',
        color: pollenColor(dayPeak.level),
      });
    }
  }
  // Only the pollen in the air, highest first: out of season, every pollen
  // is at zero and a list of zeros says less than one line.
  const known = POLLEN_KEYS_IN_SEASON_ORDER.map((key) => ({
    key,
    value: current.values[key],
  })).filter((e) => Number.isFinite(e.value));
  const items = known
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((e) => {
      const levelKey = pollenLevelOf(e.value);
      const details = getPollenLevel(levelKey);
      return {
        label: POLLEN_NAMES[e.key],
        value: all((l) => `${formatPollen(e.value)} · ${details.label[l]}`),
        icon: 'feather',
        color: pollenColor(levelKey),
      };
    });
  if (items.length === 0) {
    items.push({
      label: { en: 'In the air', fr: 'Dans l’air', de: 'In der Luft' },
      value: {
        en: `None of the ${known.length} pollen`,
        fr: `Aucun des ${known.length} pollens`,
        de: `Keiner der ${known.length} Pollen`,
      },
      icon: 'feather',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  items.push({
    label: { en: 'Region', fr: 'Région', de: 'Region' },
    value: truncate(pollen.region.name, 40),
    icon: 'map-pin',
    color: WIDGET_COLORS.NEUTRAL,
  });
  components.push({ type: 'status', items });
  components.push({ type: 'text', variant: 'body', text: level.advice });
  return { ttl_seconds: CONTENT_TTL, components };
}

/** Theme color of a UBA air quality level. */
export function airQualityColor(levelKey) {
  return (
    {
      very_good: WIDGET_COLORS.SUCCESS,
      good: WIDGET_COLORS.SUCCESS,
      moderate: WIDGET_COLORS.WARNING,
      poor: WIDGET_COLORS.DANGER,
      very_poor: WIDGET_COLORS.DANGER,
    }[levelKey] ?? WIDGET_COLORS.NEUTRAL
  );
}

const SETTING_NAMES = {
  background: { en: 'background', fr: 'fond', de: 'Hintergrund' },
  traffic: { en: 'traffic', fr: 'trafic', de: 'Verkehr' },
  industry: { en: 'industry', fr: 'industrie', de: 'Industrie' },
};

/**
 * Build the air quality widget content (pure: tested without network).
 * @param {object} airQuality see src/sources/ubaAirQuality.js
 * @param {{ timeZone?: string }} options local time of the house
 */
export function buildAirQualityContent(airQuality, { timeZone = 'Europe/Berlin' } = {}) {
  const { current, peak, station } = airQuality;
  const levelKey = airQualityLevelOf(current.index);
  const level = getAirQualityLevel(levelKey);
  const color = airQualityColor(levelKey);
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: all(
        (l) =>
          `${{ en: 'Air quality', fr: 'Qualité de l’air', de: 'Luftqualität' }[l]} · ${level.label[l]}`,
      ),
    },
    {
      type: 'value',
      label: all((l) => WORDS[l].now),
      value: level.label,
      icon: 'wind',
      color,
    },
  ];
  if (peak && peak.index > current.index) {
    const peakLevel = getAirQualityLevel(airQualityLevelOf(peak.index));
    components.push({
      type: 'value',
      label: { en: 'Worst (24 h)', fr: 'Pire (24 h)', de: 'Schlechteste (24 h)' },
      value: peakLevel.label,
      icon: 'trending-up',
      color: airQualityColor(peakLevel.key),
    });
  }
  // The pollutants, worst first.
  const items = [...current.components]
    .sort((a, b) => b.index - a.index)
    .slice(0, 5)
    .map((c) => {
      const itemLevel = getAirQualityLevel(airQualityLevelOf(c.index));
      return {
        label: c.pollutant.name,
        value: all(
          (l) => `${c.pollutant.symbol} ${c.value} ${c.pollutant.unit} · ${itemLevel.label[l]}`,
        ),
        icon: 'activity',
        color: airQualityColor(itemLevel.key),
      };
    });
  const km = Math.round(station.distanceKm ?? 0);
  const setting = SETTING_NAMES[station.setting];
  items.push({
    label: { en: 'Station', fr: 'Station', de: 'Station' },
    value: all((l) =>
      truncate(`${station.name}${setting ? ` (${setting[l]})` : ''}, ${km} km`, 60),
    ),
    icon: 'map-pin',
    color: WIDGET_COLORS.NEUTRAL,
  });
  const at = clock(Date.parse(current.datetime), timeZone);
  items.push({
    label: { en: 'Measured', fr: 'Mesure', de: 'Messung' },
    value: all((l) =>
      current.incomplete
        ? { en: `${at} (partial)`, fr: `${at} (partielle)`, de: `${at} (unvollständig)` }[l]
        : at,
    ),
    icon: 'clock',
    color: WIDGET_COLORS.NEUTRAL,
  });
  components.push({ type: 'status', items });
  components.push({ type: 'text', variant: 'body', text: level.advice });
  return { ttl_seconds: CONTENT_TTL, components };
}

/**
 * @param {{ provider: object, watcher: object, rememberPreferences: Function }} deps
 */
export function createWidgets({ provider, watcher, rememberPreferences, now = Date.now }) {
  return {
    [WARNINGS_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        // A typed cell wins over the house (the house list cannot name a cell).
        const wanted = String(settings.cell ?? '').trim() || settings.house;
        const area = watcher.findArea(wanted);
        if (!area) {
          const house = watcher.findHouse(wanted);
          return house ? message(OUTSIDE_GERMANY) : noHouse(wanted);
        }
        try {
          const alerts = await provider.getAlertsFor(area);
          return buildWarningsContent(alerts, {
            area,
            now: now(),
            language,
            fetchedAt: alerts.fetchedAt,
          });
        } catch (err) {
          logger.warn(`Warnings widget: ${err.message}`);
          return message({
            en: 'Warnings unavailable for now, retrying soon.',
            fr: 'Avertissements indisponibles pour le moment, nouvel essai bientôt.',
            de: 'Warnungen gerade nicht verfügbar, neuer Versuch folgt.',
          });
        }
      },
    },
    [POLLEN_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const house = watcher.findHouse(settings.house);
        if (!house) {
          return noHouse(settings.house);
        }
        if (!isInGermanyArea(house.latitude, house.longitude)) {
          return message(OUTSIDE_GERMANY);
        }
        const pollen = await provider.getPollen(house.latitude, house.longitude);
        if (!pollen) {
          return message({
            en: 'No pollen forecast for this house, or the DWD does not answer for now.',
            fr: 'Aucune prévision pollinique pour cette maison, ou le DWD ne répond pas pour le moment.',
            de: 'Keine Pollenvorhersage für dieses Zuhause, oder der DWD antwortet gerade nicht.',
          });
        }
        const today = localDate(
          new Date(now()).toISOString(),
          utcOffsetMinutes(house.latitude, house.longitude, now()),
        );
        return buildPollenContent(pollen, { today });
      },
    },
    [AIR_QUALITY_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const house = watcher.findHouse(settings.house);
        if (!house) {
          return noHouse(settings.house);
        }
        if (!isInGermanyArea(house.latitude, house.longitude)) {
          return message(OUTSIDE_GERMANY);
        }
        const airQuality = await provider.getAirQuality(house.latitude, house.longitude);
        if (!airQuality) {
          return message({
            en: 'No measuring station within 50 km, or no recent index from the Umweltbundesamt.',
            fr: 'Aucune station de mesure à moins de 50 km, ou pas d’indice récent de l’Umweltbundesamt.',
            de: 'Keine Messstation im Umkreis von 50 km, oder kein aktueller Index vom Umweltbundesamt.',
          });
        }
        return buildAirQualityContent(airQuality, { timeZone: house.timeZone });
      },
    },
  };
}

export const WIDGET_KEYS = [WARNINGS_WIDGET, POLLEN_WIDGET, AIR_QUALITY_WIDGET];
