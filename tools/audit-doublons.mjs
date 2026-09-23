/**
 * Cherche dans le corpus les fiches qui décrivent deux fois la même personne.
 *
 *   node tools/audit-doublons.mjs
 *   node tools/audit-doublons.mjs --tout      # y compris ce qui est déjà tranché
 *   node tools/audit-doublons.mjs --seuil 7   # descendre plus bas dans le doute
 *
 * ## Pourquoi il y a des doublons
 *
 * Le corpus vient de deux endroits : deux cent quatre-vingt-cinq fiches
 * écrites à la main, quatre mille trois cent quarante-trois importées de
 * Wikidata. Rien n'empêchait l'une de redire ce que l'autre disait déjà, et
 * rien ne pouvait le voir : les deux fiches portent des identifiants
 * différents, souvent des noms différents — « Padre Pio » est le nom d'usage,
 * « Pio de Pietrelcina » le nom de canonisation —, parfois même des jours de
 * fête différents, quand l'Orient et l'Occident ne célèbrent pas le même jour.
 *
 * Sur la carte, deux croix se posaient au même endroit ; dans la lettre du
 * jour, le même homme revenait deux fois.
 *
 * ## Ce que l'outil fait, et ce qu'il ne fait pas
 *
 * Il rapproche et il note. Il ne fusionne rien : décider que deux noms
 * désignent la même personne demande de savoir que Jacques de Zébédée est
 * Jacques le Majeur, et qu'Élisabeth d'Aragon régna sur le Portugal — ce
 * qu'aucun seuil ne donne. Ce qu'un humain a tranché vit dans
 * `data/reference/doublons.json`, que `build-data.mjs` applique : les fusions
 * d'un côté, de l'autre les ressemblances qu'on a regardées et qu'on garde,
 * pour que la question ne soit pas reposée à chaque passage.
 *
 * ## Ce qui n'est pas un doublon
 *
 * Des martyrs tués ensemble partagent leur jour, leur ville et leur année de
 * mort : les seize carmélites de Compiègne, les filles de Nicolas II, les
 * centaines de Chinois de 1900 dont les noms se ressemblent tous. C'est le
 * gros du bruit, et c'est pourquoi la date de naissance pèse ici plus lourd
 * que la date de mort.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCorpus } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const tout = args.includes('--tout');
const seuil = Number(args[args.indexOf('--seuil') + 1]) || 8;

const plat = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Les mots d'un nom qui ne le distinguent pas.
 *
 * « de », « saint », « padre » reviennent partout : bloquer dessus
 * rapprocherait tout le corpus de tout le corpus. Restent les mots qui
 * nomment vraiment quelqu'un.
 */
const VIDES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'of', 'the', 'da', 'di',
  'del', 'della', 'von', 'van', 'saint', 'sainte', 'san', 'santa', 'sao', 'ste',
  'pere', 'padre', 'frere', 'soeur', 'mere', 'ier', 'and', 'et', 'en', 'dit', 'dite']);

const jetons = (s) => [...new Set(plat(s.name.fr).split(' ')
  .filter((m) => m.length > 2 && !VIDES.has(m)))];

/** Le corpus tel qu'il est avant fusion : deux fichiers, lus séparément. */
function corpusBrut() {
  const dir = join(ROOT, 'data', 'saints');
  const fichiers = ['afrique-asie-oceanie.json', 'ameriques.json', 'europe-centrale.json',
    'europe-nord.json', 'france.json', 'iberie.json', 'italie.json', 'orient-chretien.json',
    'wikidata.json'];
  const out = [];
  for (const f of fichiers) {
    try { out.push(...JSON.parse(readFileSync(join(dir, f), 'utf8')).saints); } catch { /* absent */ }
  }
  return out;
}

const saints = corpusBrut();
// Le corpus généré a déjà subi les fusions : c'est le corpus brut qu'il faut
// relire, sinon l'outil ne verrait plus jamais ce qu'il a servi à trouver.
const publies = saints.filter((s) => (s.status ?? 'published') === 'published');

let tranches = { doublons: [], ressemblances: [] };
try {
  tranches = JSON.parse(readFileSync(join(ROOT, 'data', 'reference', 'doublons.json'), 'utf8'));
} catch { /* rien de tranché encore */ }
const connus = new Set();
for (const { garde, ecarte } of tranches.doublons || []) connus.add([garde, ecarte].sort().join('|'));
for (const { ids } of tranches.ressemblances || []) {
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    connus.add([ids[i], ids[j]].sort().join('|'));
  }
}

// Un index par mot du nom : il évite les dix millions de comparaisons que
// ferait une boucle sur toutes les paires, et ne coûte rien.
const index = new Map();
for (const s of publies) {
  for (const t of jetons(s)) {
    if (!index.has(t)) index.set(t, []);
    index.get(t).push(s);
  }
}

const vues = new Set();
const paires = [];
for (const [mot, list] of index) {
  // « marie », « jean », « wang » : un prénom que trois cents fiches portent ne
  // rapproche rien. On ne bloque que sur les mots un peu rares.
  if (list.length > 60) continue;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const clef = [a.id, b.id].sort().join('|');
      if (vues.has(clef)) continue;
      vues.add(clef);

      const ja = new Set(jetons(a));
      const jb = new Set(jetons(b));
      const commun = [...ja].filter((x) => jb.has(x)).length;
      const sim = commun / new Set([...ja, ...jb]).size;

      const memesAnnees = a.born != null && a.born === b.born
        && a.died != null && a.died === b.died;
      const anneesProches = !memesAnnees
        && a.died != null && b.died != null && Math.abs(a.died - b.died) <= 3
        && a.born != null && b.born != null && Math.abs(a.born - b.born) <= 3;
      const memeJour = a.feast === b.feast;
      const memeLieu = Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng) < 0.2;

      let note = 0;
      const raisons = [];
      if (sim >= 0.99) { note += 4; raisons.push('même nom'); }
      else if (sim >= 0.66) { note += 3; raisons.push(`noms très proches (${sim.toFixed(2)})`); }
      else if (sim >= 0.5) { note += 2; raisons.push(`noms proches (${sim.toFixed(2)})`); }
      if (memesAnnees) { note += 4; raisons.push(`mêmes années (${a.born}–${a.died})`); }
      else if (anneesProches) { note += 3; raisons.push('années à trois ans près'); }
      if (memeJour) { note += 2; raisons.push(`même fête (${a.feast})`); }
      else raisons.push(`fêtes différentes (${a.feast} / ${b.feast})`);
      if (memeLieu) { note += 2; raisons.push('même lieu'); }
      // Deux fiches de la même source ont déjà passé l'unicité de Wikidata :
      // qu'elles se ressemblent est moins suspect que le croisement des deux
      // corpus, qui ne s'est jamais regardé lui-même.
      if ((a.source === 'wikidata') !== (b.source === 'wikidata')) {
        note += 1;
        raisons.push('l’une écrite à la main, l’autre importée');
      }
      if (note >= seuil) paires.push({ a, b, note, raisons, clef });
    }
  }
}

paires.sort((x, y) => y.note - x.note || x.a.name.fr.localeCompare(y.a.name.fr, 'fr'));
const neufs = paires.filter((p) => !connus.has(p.clef));
const liste = tout ? paires : neufs;

console.log(`DOUBLONS PROBABLES — ${publies.length} fiches avant fusion, seuil ${seuil}\n`);
if (!liste.length) {
  console.log('  Rien de neuf : tout ce qui se ressemble a déjà été tranché.');
} else {
  for (const p of liste) {
    const marque = connus.has(p.clef) ? ' (déjà tranché)' : '';
    console.log(`[${p.note}]${marque} ${p.a.name.fr} — ${p.a.id}`);
    console.log(`     ≟ ${p.b.name.fr} — ${p.b.id}`);
    console.log(`       ${p.raisons.join(' · ')}`);
    console.log(`       ${p.a.city || '?'} (${p.a.country})  vs  ${p.b.city || '?'} (${p.b.country})`);
  }
}

console.log(`\n${neufs.length} rapprochement(s) non tranché(s), ${paires.length} en tout`);
console.log(`${(tranches.doublons || []).length} fusions et `
  + `${(tranches.ressemblances || []).length} ressemblances gardées dans data/reference/doublons.json`);
if (neufs.length) {
  console.log('\nChaque ligne demande une décision, pas un seuil : ajoutez-la dans');
  console.log('« doublons » si c’est la même personne, dans « ressemblances » sinon.');
}
