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

/** Année éventuellement approximative, avec mention avant Jésus-Christ. */
export function formatYear(year, { circa = false } = {}) {
  if (year == null) return t('misc.unknown');
  const abs = new Intl.NumberFormat(current === 'la' ? 'en' : current, { useGrouping: false })
    .format(Math.abs(year));
  const label = year < 0 ? `${abs} ${t('misc.bc')}` : abs;
  return circa ? `${t('misc.circa')} ${label}` : label;
}

export function formatNumber(n) {
  return new Intl.NumberFormat(current === 'la' ? 'en' : current).format(n);
}

/** Comparateur alphabétique respectant la langue courante. */
export function collator() {
  return new Intl.Collator(current === 'la' ? 'en' : current, { sensitivity: 'base' });
}
