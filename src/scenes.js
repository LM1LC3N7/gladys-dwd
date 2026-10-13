// -----------------------------------------------------------------------------
// Scene action "Current DWD warnings" (manifest `scene_actions`): a summary
// ready to send in a message (Telegram, the chat, a speaker), plus the
// numbers a following condition can test. It reads what the watcher already
// holds, no request to the DWD, in the language of the last widget or
// weather request (a scene action receives none).
// -----------------------------------------------------------------------------

import { GET_WARNINGS_ACTION } from './constants.js';
import { LEVEL_NAMES, WORDS, period, textLanguage, warningTitle } from './i18n.js';
import { inForce } from './sources/dwdWarnings.js';

export const SCENE_ACTION_KEYS = [GET_WARNINGS_ACTION];

const TEXTS = {
  en: {
    none: (area) => `${area}: no DWD warning.`,
    header: (area, n) => `${area}: ${n} DWD ${n === 1 ? 'warning' : 'warnings'}`,
    pending: (area) => `${area}: warnings not read yet.`,
    noArea: 'No area followed: place a house in Germany on the map, or enter a warn cell.',
  },
  fr: {
    none: (area) => `${area} : aucun avertissement du DWD.`,
    header: (area, n) => `${area} : ${n} avertissement${n > 1 ? 's' : ''} du DWD`,
    pending: (area) => `${area} : avertissements pas encore lus.`,
    noArea:
      'Aucune zone suivie : placez une maison en Allemagne sur la carte, ou saisissez une cellule d’alerte.',
  },
  de: {
    none: (area) => `${area}: keine DWD-Warnung.`,
    header: (area, n) => `${area}: ${n} DWD-${n === 1 ? 'Warnung' : 'Warnungen'}`,
    pending: (area) => `${area}: Warnungen noch nicht gelesen.`,
    noArea:
      'Kein Gebiet beobachtet: ein Zuhause in Deutschland auf der Karte platzieren oder eine Warnzelle eintragen.',
  },
};

/**
 * The summary of the warnings of some areas (pure).
 * @param {{ area: object, warnings?: object[] }[]} entries areas with their cached warnings
 * @param {{ now: number, language?: string }} options
 */
export function summarize(entries, { now, language }) {
  const lang = textLanguage(language);
  const text = TEXTS[lang];
  const words = WORDS[lang];
  const blocks = [];
  let count = 0;
  let currentLevel = 0;
  let upcomingLevel = 0;
  for (const { area, warnings } of entries) {
    const name = area.name || area.key;
    if (!warnings) {
      blocks.push(text.pending(name));
      continue;
    }
    const context = { now, timeZone: area.timeZone ?? 'Europe/Berlin', language: lang };
    const active = warnings.filter((w) => inForce(w, now));
    const upcoming = warnings.filter((w) => !inForce(w, now));
    count += warnings.length;
    currentLevel = Math.max(currentLevel, ...active.map((w) => w.level));
    upcomingLevel = Math.max(upcomingLevel, ...upcoming.map((w) => w.level));
    if (warnings.length === 0) {
      blocks.push(text.none(name));
      continue;
    }
    const lines = [text.header(name, warnings.length)];
    for (const warning of active) {
      lines.push(`- ${warningTitle(warning, lang)}, ${period(warning, true, context)}`);
    }
    for (const warning of upcoming) {
      const label = warning.watch ? `${words.watch}: ` : '';
      lines.push(`- ${label}${warningTitle(warning, lang)}, ${period(warning, false, context)}`);
    }
    blocks.push(lines.join('\n'));
  }
  return {
    summary: blocks.length > 0 ? blocks.join('\n\n') : text.noArea,
    count,
    current_level: currentLevel,
    upcoming_level: upcomingLevel,
    current_level_name: LEVEL_NAMES[lang][currentLevel],
    upcoming_level_name: LEVEL_NAMES[lang][upcomingLevel],
  };
}

/**
 * @param {{ watcher: object, provider: object, getPreferences: Function, now?: Function }} deps
 */
export function createSceneActions({ watcher, provider, getPreferences, now = Date.now }) {
  return {
    [GET_WARNINGS_ACTION]: async (fields = {}) => {
      const areas = watcher.areasFor(fields.area);
      const entries = await Promise.all(
        areas.map(async (area) => ({
          area,
          warnings: provider.cachedAlerts(area) ?? (await provider.getAlertsFor(area)),
        })),
      );
      return summarize(entries, { now: now(), language: getPreferences().language });
    },
  };
}
