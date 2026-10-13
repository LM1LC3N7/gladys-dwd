// -----------------------------------------------------------------------------
// User-facing texts computed at runtime (English, French, German). Static
// texts live in the manifest; widget texts are multi-language objects picked
// by the core, except where a value is formatted into them.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de'];

/** Language of the texts we hold: French, German, else English. */
export function textLanguage(language) {
  const code = String(language ?? '')
    .toLowerCase()
    .slice(0, 2);
  return LANGUAGES.includes(code) ? code : 'en';
}

/** "−12" with a real minus sign, as the weather sites print it. */
export function signed(value) {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** Local "HH:MM" of an instant, given the UTC offset of the place. */
export function localClock(instant, utcOffsetMinutes = 0) {
  return new Date(Date.parse(instant) + utcOffsetMinutes * 60_000).toISOString().slice(11, 16);
}

/** Local "DD.MM HH:MM" of an instant (the warnings span days). */
export function localDayClock(instant, utcOffsetMinutes = 0) {
  const iso = new Date(Date.parse(instant) + utcOffsetMinutes * 60_000).toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

export const SEVERITY_LABELS = {
  minor: { en: 'Minor', fr: 'Mineure', de: 'Gering' },
  moderate: { en: 'Moderate', fr: 'Modérée', de: 'Mäßig' },
  severe: { en: 'Severe', fr: 'Sévère', de: 'Schwer' },
  extreme: { en: 'Extreme', fr: 'Extrême', de: 'Extrem' },
};

// The four levels of the DWD, with 0 for "no warning".
export const LEVEL_NAMES = {
  en: ['No warning', 'Weather warning', 'Significant weather', 'Severe weather', 'Extreme weather'],
  fr: [
    'Aucun avertissement',
    'Avertissement',
    'Temps marquant',
    'Fortes intempéries',
    'Intempéries extrêmes',
  ],
  de: ['Keine Warnung', 'Wetterwarnung', 'Markantes Wetter', 'Unwetter', 'Extremes Unwetter'],
};

export const KIND_NAMES = {
  en: {
    thunderstorm: 'Thunderstorms',
    wind: 'Wind',
    rain: 'Rain',
    snow: 'Snow',
    frost: 'Frost',
    ice: 'Ice',
    thaw: 'Thaw',
    fog: 'Fog',
    heat: 'Heat',
    uv: 'High UV index',
    other: 'Other',
  },
  fr: {
    thunderstorm: 'Orages',
    wind: 'Vent',
    rain: 'Pluie',
    snow: 'Neige',
    frost: 'Gel',
    ice: 'Verglas',
    thaw: 'Dégel',
    fog: 'Brouillard',
    heat: 'Chaleur',
    uv: 'Indice UV élevé',
    other: 'Autre',
  },
  de: {
    thunderstorm: 'Gewitter',
    wind: 'Wind',
    rain: 'Regen',
    snow: 'Schnee',
    frost: 'Frost',
    ice: 'Glätte',
    thaw: 'Tauwetter',
    fog: 'Nebel',
    heat: 'Hitze',
    uv: 'Hoher UV-Index',
    other: 'Sonstiges',
  },
};

export const WORDS = {
  en: {
    now: 'Now',
    later: 'Later',
    none: 'None',
    tomorrow: 'tomorrow',
    until: (t) => `until ${t}`,
    from: (t) => `from ${t}`,
    inForce: 'in force',
    watch: 'Advance notice',
    level: (n) => `Level ${n}`,
  },
  fr: {
    now: 'Maintenant',
    later: 'À venir',
    none: 'Aucun',
    tomorrow: 'demain',
    until: (t) => `jusqu’à ${t}`,
    from: (t) => `à partir de ${t}`,
    inForce: 'en cours',
    watch: 'Préavis',
    level: (n) => `Niveau ${n}`,
  },
  de: {
    now: 'Jetzt',
    later: 'Später',
    none: 'Keine',
    tomorrow: 'morgen',
    until: (t) => `bis ${t}`,
    from: (t) => `ab ${t}`,
    inForce: 'aktiv',
    watch: 'Vorabinformation',
    level: (n) => `Stufe ${n}`,
  },
};

const formatters = new Map();
function formatter(key, make) {
  if (!formatters.has(key)) {
    formatters.set(key, make());
  }
  return formatters.get(key);
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };

export function localDateIn(ms, timeZone) {
  return formatter(
    `date:${timeZone}`,
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  ).format(ms);
}

export function clock(ms, timeZone) {
  return formatter(
    `clock:${timeZone}`,
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
  ).format(ms);
}

/**
 * An instant as a person says it: "14:00" today, "tomorrow 06:00", "Thu
 * 15/10 14:00" further away.
 * @param {number} ms
 * @param {{ now: number, timeZone: string, language: string }} context
 */
export function when(ms, { now, timeZone, language }) {
  const day = localDateIn(ms, timeZone);
  const time = clock(ms, timeZone);
  const today = localDateIn(now, timeZone);
  if (day === today) {
    return time;
  }
  // The calendar day after today, whatever the length of today (23 or 25 h).
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (tomorrow.toISOString().slice(0, 10) === day) {
    return `${WORDS[language].tomorrow} ${time}`;
  }
  const date = formatter(
    `day:${language}:${timeZone}`,
    () =>
      new Intl.DateTimeFormat(LOCALES[language], {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      }),
  ).format(ms);
  return `${date} ${time}`;
}

/** "until 22:00", "from tomorrow 06:00", "14:00 – 22:00". */
export function period(warning, active, context) {
  const words = WORDS[context.language];
  const { onsetMs: onset, expiresMs: expires } = warning;
  if (active) {
    return expires === undefined ? words.inForce : words.until(when(expires, context));
  }
  if (onset === undefined) {
    return expires === undefined ? '' : words.until(when(expires, context));
  }
  if (expires === undefined) {
    return words.from(when(onset, context));
  }
  const sameDay = localDateIn(onset, context.timeZone) === localDateIn(expires, context.timeZone);
  const end = sameDay ? clock(expires, context.timeZone) : when(expires, context);
  return `${when(onset, context)} – ${end}`;
}

/**
 * The title of a warning: the official headline in German, the translated
 * event with its level in English and French.
 */
export function warningTitle(warning, language) {
  if (language === 'de') {
    return warning.headline || warning.event?.de || '';
  }
  const name = warning.event?.[language] ?? warning.event?.en ?? warning.headline ?? '';
  return `${name} (${WORDS[language].level(warning.level).toLowerCase()})`;
}

// The words of the DWD warning event names (a closed vocabulary: the
// warning criteria of the DWD), in the order they are matched. Longer
// words first so that "STARKREGEN" is not read as "STARK" + "REGEN".
const EVENT_WORDS = [
  ['VORABINFORMATION', { en: 'advance notice of', fr: 'préavis de' }],
  ['EXTREM ERGIEBIGER', { en: 'extremely abundant', fr: 'extrêmement abondante' }],
  ['EXTREM HEFTIGER', { en: 'extremely intense', fr: 'extrêmement intense' }],
  ['EXTREM STARKER', { en: 'extremely heavy', fr: 'extrêmement forte' }],
  ['EXTREM STARKE', { en: 'extremely heavy', fr: 'extrêmement forte' }],
  ['EXTREME ORKANBÖEN', { en: 'extreme hurricane-force gusts', fr: 'rafales d’ouragan extrêmes' }],
  ['EXTREMES', { en: 'extreme', fr: 'extrême' }],
  ['EXTREME', { en: 'extreme', fr: 'extrême' }],
  ['EXTREM', { en: 'extreme', fr: 'extrême' }],
  ['ERGIEBIGER', { en: 'abundant', fr: 'abondante' }],
  ['ERGIEBIGEM', { en: 'abundant', fr: 'abondante' }],
  ['HEFTIGER', { en: 'intense', fr: 'intense' }],
  ['HEFTIGEM', { en: 'intense', fr: 'intense' }],
  ['SCHWERES', { en: 'severe', fr: 'violent' }],
  ['SCHWERE', { en: 'severe', fr: 'violentes' }],
  ['STARKES', { en: 'strong', fr: 'fort' }],
  ['STARKER', { en: 'heavy', fr: 'forte' }],
  ['STARKE', { en: 'strong', fr: 'forte' }],
  ['STRENGER', { en: 'severe', fr: 'sévère' }],
  ['LEICHTER', { en: 'light', fr: 'légère' }],
  ['LEICHTE', { en: 'light', fr: 'légère' }],
  ['ORKANARTIGE BÖEN', { en: 'hurricane-like gusts', fr: 'rafales tempétueuses' }],
  ['ORKANARTIGEN BÖEN', { en: 'hurricane-like gusts', fr: 'rafales tempétueuses' }],
  ['ORKANBÖEN', { en: 'hurricane-force gusts', fr: 'rafales d’ouragan' }],
  ['STURMBÖEN', { en: 'storm gusts', fr: 'rafales de tempête' }],
  ['WINDBÖEN', { en: 'wind gusts', fr: 'rafales de vent' }],
  ['BÖEN', { en: 'gusts', fr: 'rafales' }],
  ['STARKWIND', { en: 'strong wind', fr: 'vent fort' }],
  ['STURM', { en: 'storm', fr: 'tempête' }],
  ['GEWITTER', { en: 'thunderstorm', fr: 'orage' }],
  ['STARKREGEN', { en: 'heavy rain', fr: 'fortes pluies' }],
  ['DAUERREGEN', { en: 'persistent rain', fr: 'pluie persistante' }],
  ['REGEN', { en: 'rain', fr: 'pluie' }],
  ['SCHNEEVERWEHUNG', { en: 'snow drifts', fr: 'congères' }],
  ['SCHNEEFALL', { en: 'snowfall', fr: 'chutes de neige' }],
  ['SCHNEE', { en: 'snow', fr: 'neige' }],
  ['GLATTEIS', { en: 'black ice', fr: 'verglas' }],
  ['GLÄTTE', { en: 'slippery roads', fr: 'chaussées glissantes' }],
  ['GLAETTE', { en: 'slippery roads', fr: 'chaussées glissantes' }],
  ['TAUWETTER', { en: 'thaw', fr: 'dégel' }],
  ['FROST', { en: 'frost', fr: 'gel' }],
  ['NEBEL', { en: 'fog', fr: 'brouillard' }],
  ['HITZE', { en: 'heat', fr: 'chaleur' }],
  ['WÄRMEBELASTUNG', { en: 'heat stress', fr: 'stress thermique' }],
  ['UV-INDEX', { en: 'UV index', fr: 'indice UV' }],
  ['UV', { en: 'UV', fr: 'UV' }],
  ['HAGEL', { en: 'hail', fr: 'grêle' }],
  ['LEITERSEILSCHWINGUNGEN', { en: 'conductor galloping', fr: 'galop des lignes électriques' }],
  ['TEST-UNWETTER', { en: 'test (severe weather)', fr: 'test (intempéries)' }],
  ['TEST-WARNUNG', { en: 'test warning', fr: 'avertissement de test' }],
  ['UNWETTER', { en: 'severe weather', fr: 'intempéries' }],
  ['MIT', { en: 'with', fr: 'avec' }],
  ['UND', { en: 'and', fr: 'et' }],
  ['VOR', { en: 'of', fr: 'de' }],
];

const capitalize = (text) =>
  typeof text === 'string' && text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;

/**
 * The DWD event name ("SCHWERES GEWITTER mit HEFTIGEM STARKREGEN") in
 * English and French, word by word; an unknown word stays as it is, in
 * lower case. The German keeps the original. `undefined` without an event.
 */
export function translateEvent(event, headline) {
  const source = String(event ?? '').trim() || String(headline ?? '').trim();
  if (!source) {
    return undefined;
  }
  const words = source.toUpperCase().split(/\s+/);
  const out = { en: [], fr: [] };
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (const [word, translation] of EVENT_WORDS) {
      const parts = word.split(' ');
      if (words.slice(i, i + parts.length).join(' ') === word) {
        out.en.push(translation.en);
        out.fr.push(translation.fr);
        i += parts.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.en.push(words[i].toLowerCase());
      out.fr.push(words[i].toLowerCase());
      i += 1;
    }
  }
  return {
    en: capitalize(out.en.join(' ')),
    fr: capitalize(out.fr.join(' ')),
    de: capitalize(source.toLowerCase()),
  };
}
