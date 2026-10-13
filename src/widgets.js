// -----------------------------------------------------------------------------
// Dashboard widgets "Warnings" and "Pollen" (manifest `widgets`, Gladys 5.1+).
//
// Warnings: the official DWD warnings in force at the house, with their
// severity, their period and the DWD advice, which the native weather widget
// does not show.
//
// Pollen: the DWD pollen index for today, tomorrow and the day after, pollen
// by pollen, with the advice of the level.
//
// The content is declarative (core vocabulary, no HTML); `onWidgetGet`
// receives no coordinates: the house comes from the `house` setting (name or
// selector, empty = first house), resolved against getHouses().
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
import { SEVERITY_LABELS, localDayClock } from './i18n.js';
import { localDate } from './pivot.js';
import { isInGermanyArea } from './geo.js';
import { utcOffsetMinutes } from './timezone.js';

const logger = createLogger({ name: 'widgets' });

const CONTENT_TTL = 300;
const MESSAGE_TTL = 60;

/** Theme color of a CAP severity. */
export function severityColor(severity) {
  return (
    {
      minor: WIDGET_COLORS.WARNING,
      moderate: WIDGET_COLORS.WARNING,
      severe: WIDGET_COLORS.DANGER,
      extreme: WIDGET_COLORS.DANGER,
    }[severity] ?? WIDGET_COLORS.NEUTRAL
  );
}

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
};

function noHouse(name) {
  return message(
    name
      ? {
          en: `No located house named "${name}".`,
          fr: `Aucune maison localisée nommée « ${name} ».`,
        }
      : {
          en: 'No location yet: place your house on the map in Gladys.',
          fr: 'Aucune position : placez votre maison sur la carte dans Gladys.',
        },
  );
}

const truncate = (text, max) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Build the warnings widget content (pure: tested without network).
 * @param {object[]} alerts see src/sources/dwdWarnings.js
 * @param {{ utcOffsetMinutes?: number }} options local time of the house
 */
export function buildWarningsContent(alerts, { utcOffsetMinutes: offset = 0 } = {}) {
  const components = [];
  if (alerts.length === 0) {
    components.push({
      type: 'text',
      variant: 'heading',
      text: { en: 'No warning in force', fr: 'Aucun avertissement en cours' },
    });
    components.push({
      type: 'status',
      items: [
        {
          label: { en: 'DWD warnings', fr: 'Avertissements DWD' },
          value: { en: 'None', fr: 'Aucun' },
          icon: 'check-circle',
          color: WIDGET_COLORS.SUCCESS,
        },
      ],
    });
    return { ttl_seconds: CONTENT_TTL, components };
  }
  const worst = alerts[0];
  components.push({
    type: 'text',
    variant: 'heading',
    text: {
      en: `${alerts.length === 1 ? '1 warning' : `${alerts.length} warnings`} · ${SEVERITY_LABELS[worst.severity].en}`,
      fr: `${alerts.length === 1 ? '1 avertissement' : `${alerts.length} avertissements`} · ${SEVERITY_LABELS[worst.severity].fr}`,
    },
  });
  components.push({
    type: 'card-list',
    display: 'list',
    items: alerts.slice(0, 8).map((alert) => {
      const period =
        alert.start && alert.end
          ? `${localDayClock(alert.start, offset)} → ${localDayClock(alert.end, offset)}`
          : alert.end
            ? `→ ${localDayClock(alert.end, offset)}`
            : '';
      return {
        title: {
          en: truncate(alert.event?.en ?? alert.headline ?? '', 60),
          fr: truncate(alert.event?.fr ?? alert.headline ?? '', 60),
        },
        subtitle: period,
        date: alert.start,
        badge: { text: SEVERITY_LABELS[alert.severity], color: severityColor(alert.severity) },
        description: truncate(
          [alert.headline, alert.description?.en ?? alert.description?.fr]
            .filter(Boolean)
            .join('\n\n'),
          2000,
        ),
        links: [
          {
            url: 'https://www.dwd.de/warnungen',
            label: { en: 'DWD warnings', fr: 'Avertissements DWD' },
          },
        ],
      };
    }),
  });
  if (worst.area) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: truncate(`DWD warnings for ${worst.area} (texts in German).`, 80),
        fr: truncate(`Avertissements du DWD pour ${worst.area} (textes en allemand).`, 80),
      },
    });
  }
  return { ttl_seconds: CONTENT_TTL, components };
}

const DAY_LABELS = [
  { en: 'Today', fr: 'Aujourd’hui' },
  { en: 'Tomorrow', fr: 'Demain' },
  { en: 'Day after', fr: 'Après-demain' },
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
    },
  });
  components.push({
    type: 'gauge',
    value: peak.value,
    min: 0,
    max: 3,
    label:
      current.date === today
        ? { en: 'Today', fr: 'Aujourd’hui' }
        : { en: 'Next day', fr: 'Prochain jour' },
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
        value: {
          en: `${formatPollen(e.value)} · ${details.label.en}`,
          fr: `${formatPollen(e.value)} · ${details.label.fr}`,
        },
        icon: 'feather',
        color: pollenColor(levelKey),
      };
    });
  items.push({
    label: { en: 'Region', fr: 'Région' },
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
  const resolve = (settings) => {
    const house = watcher.findHouse(settings.house);
    if (!house) {
      return { error: noHouse(settings.house) };
    }
    if (!isInGermanyArea(house.latitude, house.longitude)) {
      return { error: message(OUTSIDE_GERMANY) };
    }
    return { house };
  };
  return {
    [WARNINGS_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const { house, error } = resolve(settings);
        if (error) {
          return error;
        }
        try {
          const alerts = await provider.getAlerts(house.latitude, house.longitude);
          return buildWarningsContent(alerts, {
            utcOffsetMinutes: utcOffsetMinutes(house.latitude, house.longitude, now()),
          });
        } catch (err) {
          logger.warn(`Warnings widget: ${err.message}`);
          return message({
            en: 'Warnings unavailable for now, retrying soon.',
            fr: 'Avertissements indisponibles pour le moment, nouvel essai bientôt.',
          });
        }
      },
    },
    [POLLEN_WIDGET]: {
      async get({ settings = {}, language, units }) {
        rememberPreferences({ language, units });
        const { house, error } = resolve(settings);
        if (error) {
          return error;
        }
        const pollen = await provider.getPollen(house.latitude, house.longitude);
        if (!pollen) {
          return message({
            en: 'No pollen forecast for this house, or the DWD does not answer for now.',
            fr: 'Aucune prévision pollinique pour cette maison, ou le DWD ne répond pas pour le moment.',
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
