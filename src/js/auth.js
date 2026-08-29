/**
 * Comptes et permissions.
 *
 * AVERTISSEMENT : SanctiMaps est un site statique, sans serveur. Ce module
 * n'est donc pas un dispositif de sécurité et ne peut pas l'être : le contrôle
 * s'exécute dans le navigateur du visiteur, qui peut toujours le contourner par
 * la console. Il sert à séparer les rôles et à éviter les fausses manœuvres,
 * pas à protéger des données. Une vraie autorisation demanderait un serveur.
 */

const SESSION_KEY = 'sanctimaps.session.v1';
const CODE_KEY = 'sanctimaps.adminCode.v1';

/** Code administrateur au premier lancement ; modifiable ensuite. */
export const DEFAULT_ADMIN_CODE = 'sanctimaps';

export const VISITOR = 'visitor';
export const USER = 'user';
export const ADMIN = 'admin';

/** Ce que chaque rôle a le droit de faire. */
const RIGHTS = {
  [VISITOR]: { browse: true },
  [USER]: { browse: true, propose: true },
  [ADMIN]: { browse: true, propose: true, publish: true, edit: true, remove: true, moderate: true },
};

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Sans stockage, la session ne vaut que pour l'onglet en cours.
  }
}

/** Empreinte SHA-256 si le navigateur la fournit, sinon le code tel quel. */
async function fingerprint(code) {
  if (!globalThis.crypto?.subtle) return `plain:${code}`;
  const bytes = new TextEncoder().encode(`sanctimaps:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadSession() {
  const raw = read(SESSION_KEY);
  if (!raw) return { role: VISITOR, name: '' };
  try {
    const parsed = JSON.parse(raw);
    return RIGHTS[parsed.role]
      ? { role: parsed.role, name: String(parsed.name || '') }
      : { role: VISITOR, name: '' };
  } catch {
    return { role: VISITOR, name: '' };
  }
}

let session = loadSession();
const listeners = new Set();

export function getSession() {
  return { ...session };
}

export function can(right) {
  return Boolean(RIGHTS[session.role]?.[right]);
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(next) {
  session = next;
  write(SESSION_KEY, JSON.stringify(session));
  for (const fn of listeners) fn(getSession());
}

/** Ouvre une session utilisateur : aucun code n'est demandé. */
export function signInUser(name) {
  apply({ role: USER, name: String(name || '').trim() });
  return { ok: true };
}

/** Ouvre une session administrateur si le code correspond. */
export async function signInAdmin(name, code) {
  const stored = read(CODE_KEY) || await fingerprint(DEFAULT_ADMIN_CODE);
  if (await fingerprint(code) !== stored) return { ok: false, reason: 'code' };
  apply({ role: ADMIN, name: String(name || '').trim() });
  return { ok: true };
}

export function signOut() {
  apply({ role: VISITOR, name: '' });
}

/** Change le code administrateur ; réservé à une session administrateur. */
export async function changeAdminCode(current, next) {
  if (session.role !== ADMIN) return { ok: false, reason: 'role' };
  const stored = read(CODE_KEY) || await fingerprint(DEFAULT_ADMIN_CODE);
  if (await fingerprint(current) !== stored) return { ok: false, reason: 'code' };
  if (!next || next.length < 4) return { ok: false, reason: 'short' };
  write(CODE_KEY, await fingerprint(next));
  return { ok: true };
}

/** Vrai tant que le code n'a jamais été changé. */
export function usesDefaultCode() {
  return !read(CODE_KEY);
}
