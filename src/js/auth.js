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

/**
 * Où le code choisi par l'administrateur est rangé, dans son propre navigateur.
 *
 * Le numéro de version est le seul moyen de réinitialiser le code à distance :
 * il n'existe aucun serveur qui le détiendrait, et personne d'autre que le
 * navigateur de l'administrateur ne sait ce qu'il a choisi. En changer fait
 * oublier l'ancien code partout, et l'application retombe sur celui d'origine
 * ci-dessous. L'ancienne clef est effacée au passage, pour ne pas laisser
 * traîner une empreinte qui ne sert plus.
 */
const CODE_KEY = 'sanctimaps.adminCode.v2';
const OLD_CODE_KEYS = ['sanctimaps.adminCode.v1'];

/**
 * Code administrateur au premier lancement ; modifiable ensuite.
 *
 * Il est écrit ici, donc dans le JavaScript publié, donc lisible par qui ouvre
 * la page. Ce n'est pas un oubli : un site sans serveur ne peut garder aucun
 * secret, et l'avertissement en tête de ce fichier vaut d'abord pour cette
 * ligne. Le code sépare les rôles et évite les fausses manœuvres — il ne
 * protège rien, et il ne peut pas.
 */
export const DEFAULT_ADMIN_CODE = 'laurier-encens-9038';

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

// Le code d'avant la réinitialisation n'a plus d'emploi : on ne le garde pas.
for (const vieille of OLD_CODE_KEYS) write(vieille, null);

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
