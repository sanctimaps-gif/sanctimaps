/**
 * Les célébrations de l'AELF qu'aucune fiche ne couvre.
 *
 *   node tools/aelf-sans-fiche.mjs          # la liste, une ligne par intitulé
 *   node tools/aelf-sans-fiche.mjs --json   # la même, pour un autre outil
 *
 * Une célébration sans fiche — la Croix glorieuse, saints Côme et Damien, le
 * Christ-Roi — a sa propre page, écrite dans `data/aelf/celebrations.json`.
 * Cet outil dit lesquelles manquent encore, et `npm run check` s'en sert pour
 * qu'aucune ne reste sans page.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  celebrationDe, cleCelebration, celebrationNotable, honores, lireJour,
} from '../src/js/liturgie.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

export function sansFiche({ sansAuto = process.argv.includes('--sans-auto') } = {}) {
  const { jours } = lire('data', 'aelf', 'calendrier.json');
  const corpus = {
    saints: lire('data', 'generated', 'saints.json').saints,
    apparitions: lire('data', 'generated', 'apparitions.json').apparitions,
    celebrations: lire('data', 'aelf', 'celebrations.json').celebrations,
  };
  // Les pages relevées d'office comptent aussi, sauf si l'on veut les écrire.
  let auto = {};
  try { auto = lire('data', 'aelf', 'celebrations-auto.json').celebrations; } catch { /* aucune */ }
  const avecAuto = sansAuto ? {} : auto;
  const manquent = new Map();
  for (const [iso, jour] of Object.entries(jours)) {
    if (!celebrationNotable(jour)) continue;
    const date = new Date(`${iso}T12:00:00`);
    if (honores(corpus, jour, date).length) continue;
    if (celebrationDe(jour, corpus.celebrations)?.page || celebrationDe(jour, avecAuto)?.page) continue;
    const { titre, degre } = lireJour(jour);
    const cle = cleCelebration(titre);
    if (!manquent.has(cle)) manquent.set(cle, { cle, titre, degre, dates: [] });
    manquent.get(cle).dates.push(iso);
  }
  return [...manquent.values()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const liste = sansFiche();
  if (process.argv.includes('--json')) console.log(JSON.stringify(liste, null, 1));
  else for (const c of liste) console.log(`${c.cle}\t${c.titre}\t${c.degre}\t${c.dates.join(' ')}`);
}
