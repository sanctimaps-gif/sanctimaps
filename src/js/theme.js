/**
 * Thème clair ou sombre.
 *
 * Trois états : « système » suit le réglage du navigateur, « clair » et
 * « sombre » l'emportent dessus. Le choix est mémorisé sur l'appareil, et posé
 * sur l'élément racine, où la feuille de style le lit.
 */

const KEY = 'sanctimaps.theme.v1';
export const THEMES = ['system', 'light', 'dark'];

function read() {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

let current = read();
const listeners = new Set();

export function getTheme() {
  return current;
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  current = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Sans stockage, le choix ne vaut que pour la session en cours.
  }
  apply();
  for (const fn of listeners) fn(current);
}

/** Fait passer au thème suivant : système → clair → sombre → système. */
export function cycleTheme() {
  setTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function apply() {
  const root = document.documentElement;
  if (current === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', current);
}
