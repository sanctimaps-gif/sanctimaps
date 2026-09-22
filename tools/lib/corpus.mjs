/**
 * Le corpus entier, recollé.
 *
 * Depuis que les textes longs vivent à part — voir `build-data.mjs` —, lire
 * `saints.json` seul ne donne plus que les fiches allégées : ni biographie, ni
 * notice, ni sources. C'est ce qu'il faut à l'application, qui les charge
 * ensuite ; ce n'est pas ce qu'il faut aux outils, qui écrivent des pages, des
 * lettres et des contrôles où le texte est justement le sujet.
 *
 * Ils passent donc tous par ici, et reçoivent des fiches complètes, comme
 * avant. Un seul endroit sait que le corpus est en deux morceaux.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'generated');

/** Les fiches, textes compris. */
export function lireCorpus({ gen = GEN } = {}) {
  const { saints } = JSON.parse(readFileSync(join(gen, 'saints.json'), 'utf8'));

  // Le fichier de textes peut manquer — un dépôt à moitié construit, un vieux
  // jeu de données. Les fiches sont alors ce qu'elles sont, sans récit, et
  // l'outil qui les lit le dira à sa façon plutôt que de s'arrêter net.
  let textes = {};
  try {
    textes = JSON.parse(readFileSync(join(gen, 'saints-texts.json'), 'utf8'));
  } catch { /* pas de textes : les fiches restent nues */ }

  return saints.map((saint) => (textes[saint.id] ? { ...saint, ...textes[saint.id] } : saint));
}
