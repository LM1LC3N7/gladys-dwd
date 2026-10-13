// -----------------------------------------------------------------------------
// Pollen levels (pure functions): the DWD scale 0 to 3, the names of the
// pollen, and the discrete levels the scene trigger and the widget use.
// -----------------------------------------------------------------------------

// The pollen of the DWD index, in the order of their season.
export const POLLEN_KEYS_IN_SEASON_ORDER = [
  'Hasel',
  'Erle',
  'Esche',
  'Birke',
  'Graeser',
  'Roggen',
  'Beifuss',
  'Ambrosia',
];

export const POLLEN_NAMES = {
  Hasel: { en: 'Hazel', fr: 'Noisetier', de: 'Hasel' },
  Erle: { en: 'Alder', fr: 'Aulne', de: 'Erle' },
  Esche: { en: 'Ash', fr: 'Frêne', de: 'Esche' },
  Birke: { en: 'Birch', fr: 'Bouleau', de: 'Birke' },
  Graeser: { en: 'Grasses', fr: 'Graminées', de: 'Gräser' },
  Roggen: { en: 'Rye', fr: 'Seigle', de: 'Roggen' },
  Beifuss: { en: 'Mugwort', fr: 'Armoise', de: 'Beifuß' },
  Ambrosia: { en: 'Ragweed', fr: 'Ambroisie', de: 'Ambrosia' },
};

// The DWD scale: 0 none, 1 low, 2 moderate, 3 high; halves in between.
export const POLLEN_LEVELS = [
  {
    key: 'none',
    rank: 0,
    label: { en: 'None', fr: 'Aucune', de: 'Keine' },
    advice: {
      en: 'No pollen exposure expected.',
      fr: 'Aucune exposition aux pollens attendue.',
      de: 'Keine Pollenbelastung erwartet.',
    },
  },
  {
    key: 'low',
    rank: 1,
    label: { en: 'Low', fr: 'Faible', de: 'Gering' },
    advice: {
      en: 'Only the most sensitive people notice it.',
      fr: 'Seules les personnes les plus sensibles le ressentent.',
      de: 'Nur sehr empfindliche Menschen merken etwas.',
    },
  },
  {
    key: 'moderate',
    rank: 2,
    label: { en: 'Moderate', fr: 'Moyenne', de: 'Mittel' },
    advice: {
      en: 'Allergy sufferers feel symptoms: keep the windows closed in the morning, ventilate in the evening.',
      fr: 'Les personnes allergiques ressentent des symptômes : fenêtres fermées le matin, aération le soir.',
      de: 'Allergiker spüren Beschwerden: morgens die Fenster geschlossen halten, abends lüften.',
    },
  },
  {
    key: 'high',
    rank: 3,
    label: { en: 'High', fr: 'Forte', de: 'Hoch' },
    advice: {
      en: 'Strong symptoms for allergy sufferers: limit the time outdoors, take the treatment prescribed.',
      fr: 'Symptômes forts pour les personnes allergiques : limiter le temps dehors, suivre le traitement prescrit.',
      de: 'Starke Beschwerden für Allergiker: weniger Zeit im Freien, die verordneten Mittel nehmen.',
    },
  },
];

export const POLLEN_LEVEL_KEYS = POLLEN_LEVELS.map((l) => l.key);

export const getPollenLevel = (key) => POLLEN_LEVELS.find((l) => l.key === key);

/** Level key of a DWD value (0 to 3, halves rounded up: "1-2" is moderate). */
export function pollenLevelOf(value) {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return POLLEN_LEVELS[Math.min(3, Math.max(0, Math.ceil(value - 0.01)))].key;
}

/** "2-3" again, from a value, as the DWD shows it. */
export function formatPollen(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return Number.isInteger(value) ? String(value) : `${Math.floor(value)}-${Math.ceil(value)}`;
}

/**
 * The pollen of a day that count: the highest value, the keys at that
 * value. `undefined` when the day holds no value.
 */
export function peakPollen(day) {
  const entries = Object.entries(day?.values ?? {});
  if (entries.length === 0) {
    return undefined;
  }
  const value = Math.max(...entries.map(([, v]) => v));
  return {
    value,
    level: pollenLevelOf(value),
    keys: entries.filter(([, v]) => v === value).map(([k]) => k),
  };
}

/**
 * The day of a pollen forecast that describes `date` (local calendar date):
 * the file is issued once a day, so after midnight "tomorrow" is today.
 */
export function pollenDay(pollen, date) {
  return pollen?.days?.find((d) => d.date === date);
}

/** Levels crossed between two level keys, in the walking order. */
export function crossedPollenLevels(previousKey, levelKey) {
  const from = getPollenLevel(previousKey)?.rank ?? 0;
  const to = getPollenLevel(levelKey)?.rank ?? 0;
  const direction = to > from ? 'worsening' : 'improving';
  const step = to > from ? 1 : -1;
  const crossed = [];
  for (let rank = from + step; step > 0 ? rank <= to : rank >= to; rank += step) {
    crossed.push({ level: POLLEN_LEVELS[rank].key, direction });
  }
  return crossed;
}
