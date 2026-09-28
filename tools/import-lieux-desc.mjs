/**
 * Va chercher, pour chaque lieu marqué par un saint, ce qu'il est.
 *
 *   node tools/import-lieux-desc.mjs
 *   node tools/import-lieux-desc.mjs --dry-run
 *
 * Un lieu marqué porte un nom — « cathédrale Sainte-Agathe de Catane », « Frères
 * des écoles chrétiennes » — et un motif : sépulture, fondation, lieu de mort.
 * Il lui manquait de dire ce qu'il est. Wikidata le sait pour la plupart, en une
 * ligne : « cathédrale catholique de Catane, en Sicile », « congrégation
 * religieuse catholique fondée en 1680 ». C'est cette ligne qu'on relève, en
 * français et en anglais, par l'identifiant que `import-lieux.mjs` a gardé pour
 * chaque lieu.
 *
 * Comme les autres ateliers de relève, il ne touche qu'un fichier —
 * `data/saints/lieux-descriptions.json` — et `build-data` le lit s'il existe.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENT, progress, sleep } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIEUX = join(ROOT, 'data', 'saints', 'lieux.json');
const OUT = join(ROOT, 'data', 'saints', 'lieux-descriptions.json');
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const LANGUES = ['fr', 'en'];
const LOT = 50;

async function entites(ids) {
  const params = new URLSearchParams({
    action: 'wbgetentities', format: 'json', props: 'descriptions',
    languages: LANGUES.join('|'), ids: ids.join('|'),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${WIKIDATA}?${params}`, { headers: { 'User-Agent': AGENT } });
    if (res.ok) return res.json();
    if (![429, 502, 503, 504].includes(res.status)) throw new Error(`Wikidata : ${res.status}`);
    await sleep(1500 * (attempt + 1));
  }
  throw new Error('Wikidata surchargé après trois tentatives');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { lieux } = JSON.parse(readFileSync(LIEUX, 'utf8'));
  const qids = [...new Set(Object.values(lieux).flat().map((l) => l.qid).filter(Boolean))].sort();
  console.log(`${qids.length} lieux distincts portent un identifiant Wikidata.`);

  const descriptions = {};
  for (let i = 0; i < qids.length; i += LOT) {
    const data = await entites(qids.slice(i, i + LOT));
    for (const [qid, ent] of Object.entries(data?.entities || {})) {
      const d = {};
      for (const lang of LANGUES) {
        const v = ent.descriptions?.[lang]?.value?.trim();
        if (v) d[lang] = v;
      }
      if (Object.keys(d).length) descriptions[qid] = d;
    }
    progress(`  ${Math.min(i + LOT, qids.length)} / ${qids.length}`, { done: i + LOT >= qids.length });
    await sleep(200);
  }
  console.log(`\nDescriptions relevées : ${Object.keys(descriptions).length} lieux`);
  if (dryRun) { console.log('--dry-run : rien n’a été écrit.'); return; }

  writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikidata, descriptions des éléments (CC0)',
    note: 'Écrit par tools/import-lieux-desc.mjs. Ne pas modifier à la main : le'
      + ' fichier est réécrit d’un bloc. Ce qu’un lieu marqué est, en une ligne ;'
      + ' ce qui s’y est passé vit dans notes-lieux.json, écrit à la main.',
    descriptions,
  }, null, 1)}\n`, 'utf8');
  console.log(`Écrit ${OUT}`);
}

await main();
