/**
 * Va chercher le statut de canonisation de chaque fiche importée.
 *
 *   node tools/import-statuts.mjs
 *   node tools/import-statuts.mjs --dry-run
 *
 * ## Pourquoi un outil à part
 *
 * L'Église distingue quatre degrés — serviteur de Dieu, vénérable,
 * bienheureux, saint — et Wikidata les porte dans la propriété P411.
 * `import-saints.mjs` l'interroge déjà : c'est même sa condition d'entrée,
 * puisqu'il ne prend que les fiches qui en ont une. Mais il s'en servait pour
 * filtrer et la jetait ensuite, de sorte que le corpus ne savait plus qui
 * était quoi, et que les pages appelaient « saint » un serviteur de Dieu mort
 * à dix-sept ans.
 *
 * L'outil qui manquait n'est pas un réimport : refaire les quatre mille trois
 * cents fiches pour ajouter un mot rouvrirait tout — les noms, les dates, les
 * lieux —, et une correction ne doit pas coûter une révision générale. Celui-ci
 * ne demande qu'une chose, ne touche qu'un fichier, et ne peut rien casser
 * d'autre.
 *
 * ## Ce qu'il écrit
 *
 * `data/saints/statuts.json`, une table d'identifiants vers l'un des quatre
 * mots. `build-data.mjs` la lit si elle existe et la préfère à ce qu'il
 * devinait des notices ; sinon il continue de deviner, et se tait quand il ne
 * sait pas.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { progress, sparql } from './lib/wikimedia.mjs';
import { lireCorpus } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'saints', 'statuts.json');

const DEFAULTS = { endpoint: 'https://query.wikidata.org/sparql', lot: 250, dryRun: false };

const HELP = `Relève le statut de canonisation des fiches importées de Wikidata.

  --endpoint URL   point d'entrée SPARQL
  --lot N          identifiants par requête (défaut 250)
  --dry-run        interroger et compter sans rien écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--endpoint') options.endpoint = String(argv[i += 1]);
    else if (arg === '--lot') options.lot = Number(argv[i += 1]) || DEFAULTS.lot;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/**
 * Le degré, tiré du nom anglais que Wikidata donne à l'élément de statut.
 *
 * Les libellés sont peu nombreux et stables — « saint », « blessed »,
 * « venerable », « Servant of God » —, mais Wikidata en porte des variantes :
 * « canonized saint », « martyr saint ». On reconnaît le mot, pas la chaîne
 * entière, et l'ordre compte : « canonized » l'emporte sur « beatified », que
 * la notice d'un canonisé mentionne encore souvent.
 */
const DEGRES = [
  ['saint', /\bsaint\b|\bcanoniz|\bcanonis/i],
  ['bienheureux', /\bblessed\b|\bbeatif/i],
  ['venerable', /\bvenerable\b/i],
  ['serviteur', /servant of god/i],
];

function degreDe(label) {
  const texte = String(label || '');
  // « Servant of God » d'abord : il contient « God », jamais « saint », mais
  // l'inversion coûterait cher le jour où un libellé dirait les deux.
  if (DEGRES[3][1].test(texte)) return 'serviteur';
  for (const [nom, motif] of DEGRES) if (motif.test(texte)) return nom;
  return null;
}

/** L'identifiant Wikidata d'une fiche, tiré de son identifiant ou de sa source. */
function qidDe(saint) {
  const parId = /-(q\d+)$/i.exec(saint.id);
  if (parId) return parId[1].toUpperCase();
  for (const s of saint.sources || []) {
    const m = /wikidata\.org\/wiki\/(Q\d+)/i.exec(s.url || '');
    if (m) return m[1].toUpperCase();
  }
  return null;
}

const requete = (qids) => `
SELECT ?s ?statusEn WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?s wdt:P411 ?status .
  ?status rdfs:label ?statusEn . FILTER(LANG(?statusEn) = "en")
}`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = lireCorpus();
  const parQid = new Map();
  for (const saint of saints) {
    const qid = qidDe(saint);
    if (!qid) continue;
    if (!parQid.has(qid)) parQid.set(qid, []);
    parQid.get(qid).push(saint.id);
  }
  const qids = [...parQid.keys()];
  console.log(`${saints.length} fiches, dont ${qids.length} avec un identifiant Wikidata.`);

  const statuts = {};
  const inconnus = new Map();
  for (let i = 0; i < qids.length; i += options.lot) {
    const lot = qids.slice(i, i + options.lot);
    const rows = await sparql(options.endpoint, requete(lot), options);
    for (const row of rows) {
      const qid = String(row.s.value).replace(/^.*\/entity\//, '').toUpperCase();
      const label = row.statusEn?.value;
      const degre = degreDe(label);
      if (!degre) { inconnus.set(label, (inconnus.get(label) || 0) + 1); continue; }
      // Un élément peut porter plusieurs statuts — l'histoire de sa cause. On
      // garde le plus haut : c'est celui sous lequel l'Église le nomme
      // aujourd'hui.
      const rang = (d) => DEGRES.findIndex(([nom]) => nom === d);
      for (const id of parQid.get(qid) || []) {
        if (!statuts[id] || rang(degre) < rang(statuts[id])) statuts[id] = degre;
      }
    }
    progress(`  ${Math.min(i + options.lot, qids.length)} / ${qids.length}`,
      { done: i + options.lot >= qids.length });
  }

  const comptes = {};
  for (const v of Object.values(statuts)) comptes[v] = (comptes[v] || 0) + 1;
  console.log(`\nStatuts relevés : ${Object.keys(statuts).length} fiches`);
  for (const [nom, n] of Object.entries(comptes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nom.padEnd(12)} ${n}`);
  }
  console.log(`  sans statut   ${saints.length - Object.keys(statuts).length}`);
  if (inconnus.size) {
    console.log('\nLibellés non reconnus (à ajouter dans DEGRES si besoin) :');
    for (const [label, n] of inconnus) console.log(`  ${label} × ${n}`);
  }

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikidata, propriété P411 (statut de canonisation), CC0',
    note: 'Écrit par tools/import-statuts.mjs. Ne pas modifier à la main : le'
      + ' fichier est réécrit d’un bloc. Les quatre valeurs sont serviteur,'
      + ' venerable, bienheureux, saint — du premier degré au dernier.',
    statuts: Object.fromEntries(Object.entries(statuts).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${OUT}`);
}

await main();
