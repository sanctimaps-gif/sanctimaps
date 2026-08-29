/**
 * Fond de carte détaillé.
 *
 * Au-delà d'un certain zoom, la carte vectorielle n'a plus rien à montrer :
 * nos données s'arrêtent aux limites des pays et aux villages de mille
 * habitants. Un fond de tuiles prend alors le relais et apporte les rues, les
 * routes et les cours d'eau — la carte devient une vraie carte de terrain.
 *
 * C'est le seul endroit de l'application qui sorte sur le réseau. Le reste —
 * contours, villes, saints, recherche — fonctionne sans aucune requête, et
 * continue de fonctionner si le fond de carte est coupé ou refusé. Le réglage
 * ci-dessous permet de s'en passer tout à fait.
 */

const KEY = 'sanctimaps.basemap.v1';

export const MODES = ['auto', 'off'];

/**
 * Gabarit d'adresse des tuiles, au format habituel {z}/{x}/{y}.
 *
 * OpenStreetMap est le fond par défaut : libre, sans clé, et son usage
 * raisonnable est toléré. La mention de source qu'il demande est affichée dès
 * qu'une tuile est visible — c'est une condition de sa licence, pas une
 * politesse. Pour un autre fournisseur, il suffit de changer ces deux lignes.
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '© OpenStreetMap';

function read() {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

let current = read();
const listeners = new Set();

export function getBasemap() {
  return current;
}

export function setBasemap(mode) {
  if (!MODES.includes(mode)) return;
  current = mode;
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Sans stockage, le choix ne vaut que pour la session en cours.
  }
  for (const fn of listeners) fn(current);
}

export function onBasemapChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
