// -----------------------------------------------------------------------------
// User-facing texts computed at runtime (French and English). Static texts
// live in the manifest; widget texts are multi-language objects picked by the
// core, except where a value is formatted into them.
// -----------------------------------------------------------------------------

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
  minor: { en: 'Minor', fr: 'Mineure' },
  moderate: { en: 'Moderate', fr: 'Modérée' },
  severe: { en: 'Severe', fr: 'Sévère' },
  extreme: { en: 'Extreme', fr: 'Extrême' },
};

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
 * lower case. `undefined` without an event.
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
  return { en: capitalize(out.en.join(' ')), fr: capitalize(out.fr.join(' ')), de: source };
}
