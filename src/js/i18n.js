import fr from './locales/fr.js';
import en from './locales/en.js';
import es from './locales/es.js';
import it from './locales/it.js';
import pt from './locales/pt.js';
import de from './locales/de.js';
import nl from './locales/nl.js';
import pl from './locales/pl.js';
import ru from './locales/ru.js';
import ar from './locales/ar.js';
import zh from './locales/zh.js';
import la from './locales/la.js';

const BUNDLES = { fr, en, es, it, pt, de, nl, pl, ru, ar, zh, la };

/** Langues proposées, chacune écrite dans sa propre langue. */
export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'zh', label: '中文' },
  { code: 'la', label: 'Latina' },
];

const STORAGE_KEY = 'sanctimaps.lang';
const FALLBACK = 'en';

function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && BUNDLES[saved]) return saved;
  } catch {
    // Stockage indisponible (navigation privée) : on continue sans mémoriser.
  }
  for (const tag of navigator.languages || [navigator.language || '']) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (BUNDLES[code]) return code;
  }
  return 'fr';
}

let current = detect();
const listeners = new Set();

export function getLanguage() {
  return current;
}

export function getDirection() {
  return LANGUAGES.find((l) => l.code === current)?.dir || 'ltr';
}

export function setLanguage(code) {
  if (!BUNDLES[code] || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Sans stockage, le choix vaut pour la session en cours seulement.
  }
  document.documentElement.lang = code;
  document.documentElement.dir = getDirection();
  for (const fn of listeners) fn(code);
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(bundle, path) {
  let node = bundle;
  for (const part of path) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Traduit une clé pointée. `{n}` et consorts sont remplacés par `params`.
 * Une valeur en tableau est une forme genrée : `params.sex` choisit laquelle.
 */
export function t(key, params = {}) {
  const path = key.split('.');
  let value = lookup(BUNDLES[current], path);
  if (value === undefined) value = lookup(BUNDLES[FALLBACK], path);
  if (value === undefined) return key;
  if (Array.isArray(value)) value = params.sex === 'f' ? value[1] : value[0];
  return String(value).replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));
}

/** Titre d'un saint, accordé au genre lorsque la langue le demande. */
export function titleLabel(titleKey, sex) {
  return t(`title.${titleKey}`, { sex });
}

const monthCache = new Map();

/** Noms de mois de la langue courante, fournis par le navigateur. */
export function monthNames() {
  if (monthCache.has(current)) return monthCache.get(current);
  const fmt = new Intl.DateTimeFormat(current === 'la' ? 'en' : current, { month: 'long' });
  const names = [];
  for (let m = 0; m < 12; m++) names.push(fmt.format(new Date(Date.UTC(2001, m, 15))));
  // Le latin n'est pas une locale du navigateur : ses mois sont écrits ici.
  if (current === 'la') {
    names.splice(0, 12, 'Ianuarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Iunius',
      'Iulius', 'Augustus', 'September', 'October', 'November', 'December');
  }
  monthCache.set(current, names);
  return names;
}

/** « 08-28 » -> date lisible dans la langue courante. */
export function formatFeast(feast) {
  if (!feast) return '';
  const [m, d] = feast.split('-').map(Number);
  if (!m || !d) return feast;
  if (current === 'la') return `${d} ${monthNames()[m - 1]}`;
  return new Intl.DateTimeFormat(current, { day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(2001, m - 1, d)));
}

/**
 * Jour de l'année en toutes lettres, jour de semaine compris.
 *
 * L'année n'y figure pas : le saint du jour se fête tous les ans, et donner
 * « 2026 » laisserait croire à une date unique.
 */
export function formatDay(date) {
  const day = date.getDate();
  const month = monthNames()[date.getMonth()];
  if (current === 'la') {
    const WEEK = ['Dies Solis', 'Dies Lunae', 'Dies Martis', 'Dies Mercurii',
      'Dies Iovis', 'Dies Veneris', 'Dies Saturni'];
    return `${WEEK[date.getDay()]}, ${day} ${month}`;
  }
  return new Intl.DateTimeFormat(current, {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(date);
}

/** Chiffres romains de I à XXI, la seule plage utile pour des siècles. */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

/** « 2 » -> « 2nd », pour les langues qui numérotent ainsi leurs siècles. */
function ordinal(n) {
  const ten = n % 100;
  if (ten >= 11 && ten <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/**
 * Année, siècle ou millénaire, selon ce que la source sait vraiment.
 *
 * Wikidata ne donne pas toujours une année : pour les saints anciens, elle ne
 * connaît souvent que le siècle, et l'enregistre alors comme une année ronde
 * avec une « précision » qui vaut 7. Écrire « vers 200 » serait alors une
 * fausse exactitude — la source ne dit pas 200, elle dit « IIe siècle ». La
 * précision voyage donc avec la fiche, et l'affichage la respecte :
 *
 *   précision 9 et plus : l'année, telle quelle
 *   précision 8         : la décennie — « années 250 »
 *   précision 7         : le siècle   — « IIe siècle »
 *   précision 6         : le millénaire
 *
 * Chaque langue dit cela à sa façon : « IIe siècle » en français, « 2nd
 * century » en anglais, « 2. Jahrhundert » en allemand. Le motif est donc
 * traduit, avec le chiffre en romain (`{r}`), en arabe (`{n}`) ou en ordinal
 * anglais (`{o}`), et chaque langue prend celui qui lui convient.
 */
export function formatYear(year, { circa = false, precision = 9 } = {}) {
  if (year == null) return t('misc.unknown');
  const num = (value) => new Intl.NumberFormat(current === 'la' ? 'en' : current,
    { useGrouping: false }).format(value);
  const abs = Math.abs(year);
  const bc = (label) => (year < 0 ? `${label} ${t('misc.bc')}` : label);

  if (precision <= 8) {
    // Peu importe où l'année tombe dans son siècle : 101 comme 200 sont du
    // deuxième, et la division plafonnée le dit sans avoir à s'en soucier.
    const rank = precision <= 6 ? Math.ceil(abs / 1000) : Math.ceil(abs / 100);
    const key = precision <= 6 ? 'misc.millennium' : 'misc.century';
    if (precision === 8) return bc(t('misc.decade', { n: num(Math.floor(abs / 10) * 10) }));
    return bc(t(key, {
      n: num(rank),
      r: ROMAN[rank] || num(rank),
      o: ordinal(rank),
      // Le français écrit « Ier siècle » mais « IIe siècle » : le suffixe
      // change au premier rang seulement, et les autres langues l'ignorent.
      s: rank === 1 ? 'er' : 'e',
    }));
  }

  const label = bc(num(abs));
  return circa ? `${t('misc.circa')} ${label}` : label;
}

/**
 * Le texte d'une fiche dans la langue où on la lit — et rien d'autre.
 *
 * Le corpus ne porte de la prose qu'en deux langues : le français, qu'il
 * écrit, et l'anglais, qu'il rapporte de Wikipédia. Servir l'anglais à qui lit
 * en français n'est pas rendre service : une notice « Italian Roman Catholic
 * bishop » sous un nom français se remarque plus qu'elle n'instruit, et donne
 * l'impression d'une carte à moitié traduite. Dans ces deux langues, on montre
 * donc ce qu'on a dans cette langue, ou rien.
 *
 * Les dix autres langues de l'interface n'ont, elles, aucune prose à leur
 * nom : leur refuser le repli les priverait de tout. Elles gardent donc le
 * français puis l'anglais, faute de mieux.
 */
export function pickText(value, lang = current) {
  if (typeof value === 'string') return value;
  if (!value) return '';
  if (value[lang]) return value[lang];
  if (lang === 'fr' || lang === 'en') return '';
  return value.fr || value.en || '';
}

export function formatNumber(n) {
  return new Intl.NumberFormat(current === 'la' ? 'en' : current).format(n);
}

/** Comparateur alphabétique respectant la langue courante. */
export function collator() {
  return new Intl.Collator(current === 'la' ? 'en' : current, { sensitivity: 'base' });
}
