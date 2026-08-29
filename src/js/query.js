import { fold } from './data.js';

/**
 * Analyse de la barre de recherche unique.
 *
 * L'utilisateur tape une phrase — « Italie XIIIe », « Espagne 1515 »,
 * « 4 septembre », « Thérèse » — et le module en extrait ce qu'il reconnaît :
 * un pays, un siècle, une année, une date de fête. Ce qui reste sert de
 * recherche libre sur le nom, la ville ou le pays.
 *
 * Chaque élément reconnu est rendu sous forme de « jeton », que l'interface
 * affiche : l'utilisateur voit ainsi ce que la barre a compris, et peut le
 * retirer d'un clic plutôt que de deviner.
 */

const ROMAN_UNITS = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
const ROMAN_TENS = ['', 'x', 'xx'];

/** Chiffres romains de I à XXI, seule plage utile pour des siècles. */
const ROMAN = new Map();
for (let tens = 0; tens < ROMAN_TENS.length; tens++) {
  for (let unit = 0; unit < ROMAN_UNITS.length; unit++) {
    const value = tens * 10 + unit;
    if (value >= 1 && value <= 21) ROMAN.set(ROMAN_TENS[tens] + ROMAN_UNITS[unit], value);
  }
}

/** Marqueurs de siècle rencontrés dans les langues proposées. */
const CENTURY_WORDS = [
  'siecle', 'siecles', 'century', 'centuries', 'secolo', 'siglo', 'seculo',
  'jahrhundert', 'eeuw', 'wiek', 'vek', 'saeculum', 's',
];

/** Suffixes ordinaux collés au nombre : 12e, 12ème, 12th, 12º… */
const ORDINAL = /^(\d{1,2})(?:e|er|ere|eme|emes|es|th|st|nd|rd|o|a|º|ª)?$/;

function isCenturyWord(token) {
  return CENTURY_WORDS.includes(token.replace(/\.$/, ''));
}

/** Index des noms de pays, dans la langue affichée et en anglais. */
export function buildCountryIndex(atlas, lang) {
  const entries = [];
  for (const country of atlas.countries) {
    const names = new Set([
      atlas.countryName(country.id, lang),
      atlas.names[country.id]?.en,
      atlas.names[country.id]?.native,
    ].filter(Boolean));
    for (const name of names) {
      const folded = fold(name);
      if (folded) entries.push({ id: country.id, tokens: folded.split(/\s+/), label: name });
    }
  }
  // Les noms les plus longs d'abord : « Amérique du Sud » avant « Amérique ».
  entries.sort((a, b) => b.tokens.length - a.tokens.length);
  return entries;
}

function matchCountry(tokens, index, from) {
  for (const entry of index) {
    const n = entry.tokens.length;
    if (from + n > tokens.length) continue;
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (tokens[from + i] !== entry.tokens[i]) { ok = false; break; }
    }
    if (ok) return { id: entry.id, label: entry.label, length: n };
  }
  return null;
}

function matchMonth(token, months) {
  if (token.length < 3) return null;
  for (let i = 0; i < months.length; i++) {
    const month = fold(months[i]);
    if (month.startsWith(token) && token.length >= 3) return i + 1;
  }
  return null;
}

/**
 * @param {string} text saisie brute
 * @param {object} options index des pays et noms de mois (langue courante + anglais)
 * @returns {{country, century, year, feast, terms, tokens}} filtres reconnus
 */
export function parseQuery(text, { countryIndex = [], months = [] } = {}) {
  const raw = fold(text).replace(/[,;]/g, ' ').trim();
  const words = raw ? raw.split(/\s+/) : [];
  const result = { country: null, century: null, year: null, feast: null, terms: [], tokens: [] };
  if (!words.length) return result;

  let i = 0;
  while (i < words.length) {
    const word = words[i];

    // « France », « Royaume-Uni », « United States »…
    if (!result.country) {
      const hit = matchCountry(words, countryIndex, i);
      if (hit) {
        result.country = hit.id;
        result.tokens.push({ kind: 'country', value: hit.id, label: hit.label });
        i += hit.length;
        continue;
      }
    }

    // « XIIIe », « XIII siècle », « XIII »
    const roman = ROMAN.get(word.replace(/(?:e|er|ere|eme|es)$/, ''));
    if (roman && !result.century) {
      result.century = roman;
      result.tokens.push({ kind: 'century', value: roman });
      i += isCenturyWord(words[i + 1] || '') ? 2 : 1;
      continue;
    }

    const ordinal = ORDINAL.exec(word);
    if (ordinal && !result.century) {
      const value = Number(ordinal[1]);
      const explicit = word !== ordinal[1]; // un suffixe a été écrit : « 13e »
      const followed = isCenturyWord(words[i + 1] || '');
      if (value >= 1 && value <= 21 && (explicit || followed)) {
        result.century = value;
        result.tokens.push({ kind: 'century', value });
        i += followed ? 2 : 1;
        continue;
      }
    }

    // « 4 septembre » ou « septembre 4 »
    const day = /^(\d{1,2})$/.exec(word);
    if (day && !result.feast) {
      const month = matchMonth(words[i + 1] || '', months);
      if (month && Number(day[1]) >= 1 && Number(day[1]) <= 31) {
        result.feast = { month, day: Number(day[1]) };
        result.tokens.push({ kind: 'feast', value: result.feast });
        i += 2;
        continue;
      }
    }
    const monthFirst = matchMonth(word, months);
    if (monthFirst && !result.feast) {
      const next = /^(\d{1,2})$/.exec(words[i + 1] || '');
      const dayValue = next ? Number(next[1]) : null;
      result.feast = { month: monthFirst, day: dayValue >= 1 && dayValue <= 31 ? dayValue : null };
      result.tokens.push({ kind: 'feast', value: result.feast });
      i += result.feast.day ? 2 : 1;
      continue;
    }

    // « 1515 » : une année, qu'on lit comme « vivant à cette date ».
    const year = /^(\d{3,4})$/.exec(word);
    if (year && !result.year) {
      result.year = Number(year[1]);
      result.tokens.push({ kind: 'year', value: result.year });
      i += 1;
      continue;
    }

    result.terms.push(word);
    i += 1;
  }

  return result;
}

/** Retire un jeton reconnu de la saisie, en conservant le reste. */
export function removeToken(parsed, kind) {
  const next = { ...parsed, tokens: parsed.tokens.filter((t) => t.kind !== kind) };
  if (kind === 'country') next.country = null;
  if (kind === 'century') next.century = null;
  if (kind === 'year') next.year = null;
  if (kind === 'feast') next.feast = null;
  return next;
}

/**
 * Reconstruit une saisie à partir de filtres, pour réécrire la barre après le
 * retrait d'un jeton.
 */
export function stringifyQuery(parsed, { atlas, lang, months }) {
  const parts = [];
  for (const token of parsed.tokens) {
    if (token.kind === 'country') parts.push(atlas.countryName(token.value, lang));
    else if (token.kind === 'century') parts.push(`${token.value}e`);
    else if (token.kind === 'year') parts.push(String(token.value));
    else if (token.kind === 'feast') {
      const name = months[token.value.month - 1];
      parts.push(token.value.day ? `${token.value.day} ${name}` : name);
    }
  }
  parts.push(...parsed.terms);
  return parts.join(' ');
}
