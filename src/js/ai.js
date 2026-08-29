/**
 * Accès à l'assistant intelligent, côté navigateur.
 *
 * Aucune clé d'API n'existe ici, et la page ignore à qui elle parle : elle
 * interroge le serveur fourni avec l'application (`npm start`), qui détient la
 * configuration et s'adresse seul au modèle — local ou distant. Si ce serveur
 * n'est pas là — hébergement purement statique — ou si aucun fournisseur n'est
 * configuré, `checkAvailability` le dit et l'assistant s'en tient à son
 * réservoir hors ligne.
 *
 * Le nom du service en fonction remonte tout de même jusqu'ici, pour que
 * l'administrateur sache ce qu'il interroge et si cela lui coûte quelque chose.
 */

/** Nombre de fiches demandées par défaut à chaque appel. */
export const DEFAULT_COUNT = 5;

let availability = null;

/** Le serveur peut-il appeler le modèle ? Réponse mémorisée pour la session. */
export async function checkAvailability() {
  if (availability) return availability;
  try {
    const res = await fetch('api/ai/status');
    availability = res.ok ? await res.json() : { available: false };
  } catch {
    availability = { available: false };
  }
  return availability;
}

/**
 * Demande des fiches au modèle.
 *
 * @param {object} options
 * @param {string[]} options.countries codes ISO3 dans lesquels puiser
 * @param {number|null} options.century siècle visé, ou null
 * @param {string[]} options.exclude noms déjà présents, à ne pas reprendre
 * @param {string} options.regionLabel région lisible, pour la consigne
 * @param {number} options.count nombre de fiches souhaitées
 * @returns {Promise<{saints: Array, usage: object}>}
 * @throws {Error} avec `reason` : « no-provider », « network » ou le message du service
 */
export async function requestSaints({ countries, century, exclude, regionLabel, count }) {
  let res;
  try {
    res = await fetch('api/ai/propose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ countries, century, exclude, regionLabel, count }),
    });
  } catch {
    throw Object.assign(new Error('serveur injoignable'), { reason: 'network' });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(body?.message || `HTTP ${res.status}`), {
      reason: body?.error === 'no-provider' ? 'no-provider' : 'upstream',
    });
  }
  return body;
}
