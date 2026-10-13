// -----------------------------------------------------------------------------
// The German air quality index of the Umweltbundesamt (UBA, pure functions).
//
// The "Luftqualitätsindex" is a scale of five classes, 0 (very good) to 4
// (very poor), computed every hour at each measuring station from the worst
// of its pollutants: nitrogen dioxide and ozone (hourly means), particulate
// matter PM10 and PM2.5 (24-hour running means). The UBA API gives the index
// of the hour and the index of each pollutant: nothing is computed here, the
// scale is only named, coloured and turned into the discrete levels the scene
// trigger and the widget use. The advice is the UBA's, shortened to fit the
// 300-character text of a widget.
// -----------------------------------------------------------------------------

export const AIR_QUALITY_LEVELS = [
  {
    key: 'very_good',
    rank: 0,
    label: { en: 'Very good', fr: 'Très bonne', de: 'Sehr gut' },
    advice: {
      en: 'Best conditions to spend time outdoors.',
      fr: 'Les meilleures conditions pour passer du temps dehors.',
      de: 'Beste Voraussetzungen, um sich ausgiebig im Freien aufzuhalten.',
    },
  },
  {
    key: 'good',
    rank: 1,
    label: { en: 'Good', fr: 'Bonne', de: 'Gut' },
    advice: {
      en: 'Enjoy your outdoor activities: no adverse health effect is expected.',
      fr: 'Profitez de vos activités en plein air : aucun effet néfaste attendu sur la santé.',
      de: 'Genießen Sie Ihre Aktivitäten im Freien, gesundheitlich nachteilige Wirkungen sind nicht zu erwarten.',
    },
  },
  {
    key: 'moderate',
    rank: 2,
    label: { en: 'Moderate', fr: 'Moyenne', de: 'Mäßig' },
    advice: {
      en: 'Short-term adverse effects are unlikely. Sensitive people should limit strenuous activities outdoors.',
      fr: 'Des effets néfastes à court terme sont improbables. Les personnes sensibles limitent les efforts intenses dehors.',
      de: 'Kurzfristige nachteilige Auswirkungen sind unwahrscheinlich. Empfindliche Personen sollten anstrengende Tätigkeiten im Freien einschränken.',
    },
  },
  {
    key: 'poor',
    rank: 3,
    label: { en: 'Poor', fr: 'Mauvaise', de: 'Schlecht' },
    advice: {
      en: 'Sensitive people may feel adverse health effects: they should avoid strenuous activities outdoors.',
      fr: 'Les personnes sensibles peuvent ressentir des effets sur la santé : éviter les efforts intenses dehors.',
      de: 'Bei empfindlichen Menschen können nachteilige gesundheitliche Wirkungen auftreten: sie sollten körperlich anstrengende Tätigkeiten im Freien vermeiden.',
    },
  },
  {
    key: 'very_poor',
    rank: 4,
    label: { en: 'Very poor', fr: 'Très mauvaise', de: 'Sehr schlecht' },
    advice: {
      en: 'Adverse health effects may occur. Sensitive people and those with respiratory conditions should avoid physical exertion outdoors.',
      fr: 'Des effets sur la santé sont possibles. Personnes sensibles ou aux voies respiratoires fragiles : pas d’effort physique dehors.',
      de: 'Negative gesundheitliche Auswirkungen können auftreten. Wer empfindlich ist oder vorgeschädigte Atemwege hat, sollte körperliche Anstrengungen im Freien vermeiden.',
    },
  },
];

export const AIR_QUALITY_LEVEL_KEYS = AIR_QUALITY_LEVELS.map((l) => l.key);

const BY_KEY = new Map(AIR_QUALITY_LEVELS.map((level) => [level.key, level]));

export const getAirQualityLevel = (key) => BY_KEY.get(key);

/** Level key of a UBA index (0 to 4); undefined for anything else. */
export function airQualityLevelOf(index) {
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }
  return AIR_QUALITY_LEVELS[Math.min(index, 4)].key;
}

// The pollutants the index is made of, with the names people read. The
// numbers are the UBA component ids.
export const POLLUTANTS = {
  5: {
    key: 'no2',
    symbol: 'NO₂',
    unit: 'µg/m³',
    name: { en: 'Nitrogen dioxide', fr: 'Dioxyde d’azote', de: 'Stickstoffdioxid' },
  },
  3: {
    key: 'o3',
    symbol: 'O₃',
    unit: 'µg/m³',
    name: { en: 'Ozone', fr: 'Ozone', de: 'Ozon' },
  },
  1: {
    key: 'pm10',
    symbol: 'PM₁₀',
    unit: 'µg/m³',
    name: { en: 'Particulate matter PM10', fr: 'Particules PM10', de: 'Feinstaub PM10' },
  },
  9: {
    key: 'pm2_5',
    symbol: 'PM₂,₅',
    unit: 'µg/m³',
    name: { en: 'Fine particles PM2.5', fr: 'Particules fines PM2,5', de: 'Feinstaub PM2,5' },
  },
  4: {
    key: 'so2',
    symbol: 'SO₂',
    unit: 'µg/m³',
    name: { en: 'Sulphur dioxide', fr: 'Dioxyde de soufre', de: 'Schwefeldioxid' },
  },
  2: {
    key: 'co',
    symbol: 'CO',
    unit: 'mg/m³',
    name: { en: 'Carbon monoxide', fr: 'Monoxyde de carbone', de: 'Kohlenmonoxid' },
  },
};

/**
 * Every level crossed between two levels, in the order they are crossed, so
 * a scene filtered on "poor" still fires when the index jumps from good to
 * very poor.
 * @returns {{ level: string, direction: 'worsening' | 'improving' }[]}
 */
export function crossedAirQualityLevels(fromKey, toKey) {
  const from = getAirQualityLevel(fromKey)?.rank;
  const to = getAirQualityLevel(toKey)?.rank;
  if (from === undefined || to === undefined || from === to) {
    return [];
  }
  const direction = to > from ? 'worsening' : 'improving';
  const step = to > from ? 1 : -1;
  const crossed = [];
  for (let rank = from + step; step > 0 ? rank <= to : rank >= to; rank += step) {
    crossed.push({ level: AIR_QUALITY_LEVELS[rank].key, direction });
  }
  return crossed;
}
