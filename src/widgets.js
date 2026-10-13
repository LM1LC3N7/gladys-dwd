// -----------------------------------------------------------------------------
// Dashboard widgets "DWD warnings" and "Pollen" (manifest `widgets`, Gladys
// 5.1+).
//
// DWD warnings: the levels now and later as two tiles, then the warnings in
// force and announced of an area (a house in Germany or a typed warn cell),
// most important first, each with its period, a level badge and the official
// text behind a tap.
//
// Pollen: the DWD pollen index for today, tomorrow and the day after, pollen
// by pollen, with the advice of the level.
//
// The content is declarative (core vocabulary, no HTML); `onWidgetGet`
// receives no coordinates: the area comes from the `house` setting (house
// name, selector, cell id or cell name; empty = first area), resolved
// against the watcher. Budget of the core: 8 components, 2 texts at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { POLLEN_WIDGET, WARNINGS_WIDGET } from './constants.js';
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
  en: 'The DWD warnings and pollen index cover Germany only: this house is outside.',
  fr: 'Les avertissements et l’indice pollinique du DWD ne couvrent que l’Allemagne : cette maison est en dehors.',
  de: 'Die DWD-Warnungen und der Pollenindex gelten nur für Deutschland: dieses Zuhause liegt außerhalb.',
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
  // The pollen in the air, highest first; the rest left out when at zero.
  const items = POLLEN_KEYS_IN_SEASON_ORDER.map((key) => ({ key, value: current.values[key] }))
    .filter((e) => Number.isFinite(e.value))
    .sort((a, b) => b.value - a.value)
    .filter((e, i) => e.value > 0 || i < 3)
    .slice(0, 8)
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

/**
 * @param {{ provider: object, watcher: object, rememberPreferences: Function }} deps
 */
export function createWidgets({ provider, watcher, rememberPreferences, now = Date.now }) {
  return {
    [WARNINGS_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const area = watcher.findArea(settings.house);
        if (!area) {
          const house = watcher.findHouse(settings.house);
          return house ? message(OUTSIDE_GERMANY) : noHouse(settings.house);
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
  };
}

export const WIDGET_KEYS = [WARNINGS_WIDGET, POLLEN_WIDGET];
