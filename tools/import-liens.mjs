/**
 * Relève les liens attestés entre deux saints du corpus.
 *
 *   node tools/import-liens.mjs
 *   node tools/import-liens.mjs --dry-run
 *
 * ## Pourquoi un fichier à part
 *
 * La carte montre des vies isolées, une croix chacune, et l'on croirait à lire
 * quatre mille solitudes. Or Benoît a une sœur, Scholastique ; Ambroise baptise
 * Augustin ; Claire suit François ; Louis de France est le grand-oncle de Louis
 * d'Anjou. Ces liens-là sont **écrits** dans Wikidata, et il suffit de les
 * demander.
 *
 * | propriété | ce qu'elle dit     | notre mot   | et en face  |
 * | --------- | ------------------ | ----------- | ----------- |
 * | P1066     | élève de           | `maitre`    | `disciple`  |
 * | P802      | a pour élève       | `disciple`  | `maitre`    |
 * | P737      | influencé par      | `influence` | `inspire`   |
 * | P22, P25  | père, mère         | `parent`    | `enfant`    |
 * | P40       | enfant             | `enfant`    | `parent`    |
 * | P3373     | frère ou sœur      | `fratrie`   | `fratrie`   |
 * | P26       | conjoint           | `conjoint`  | `conjoint`  |
 * | P1038     | parent (au sens large) | `famille` | `famille` |
 *
 * **Les deux bouts doivent être au corpus.** Un saint dont le père n'est pas
 * une de nos fiches n'aura pas de lien : il n'y aurait rien à ouvrir au bout.
 * C'est ce qui rend la récolte petite — quelques centaines de liens — et sûre.
 *
 * Ce que ce fichier ne contient pas : les rencontres *probables*, celles que
 * personne n'a écrites mais qu'un lieu partagé et deux vies qui se recouvrent
 * rendent possibles. Elles se calculent sans réseau, et `build-data.mjs` s'en
 * charge — mais elles ne se disent pas du même ton, et ne se mêlent pas ici.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCorpus } from './lib/corpus.mjs';
import { progress, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  out: join(ROOT, 'data', 'saints', 'liens.json'),
  lot: 150,
  pause: 300,
  dryRun: false,
};

/**
 * Les relations, et le mot qu'on en dira de chaque côté.
 *
 * `[propriété, ce qu'est l'autre pour moi, ce que je suis pour l'autre]`.
 */
const RELATIONS = [
  ['P1066', 'maitre', 'disciple'],
  ['P802', 'disciple', 'maitre'],
  ['P22', 'parent', 'enfant'],
  ['P25', 'parent', 'enfant'],
  ['P40', 'enfant', 'parent'],
  ['P3373', 'fratrie', 'fratrie'],
  ['P26', 'conjoint', 'conjoint'],
  ['P1038', 'famille', 'famille'],
  ['P737', 'influence', 'inspire'],
];

/** Du plus précis au plus vague : c'est l'ordre où la fiche les présentera. */
export const SORTES = ['maitre', 'disciple', 'parent', 'enfant', 'fratrie',
  'conjoint', 'famille', 'influence', 'inspire'];

const RANG = new Map(SORTES.map((nom, i) => [nom, i]));

const HELP = `Relève les liens attestés entre saints du corpus.

  --lot N          identifiants par requête (défaut 150)
  --out FICHIER    fichier de sortie (défaut : data/saints/liens.json)
  --endpoint URL   point d'entrée SPARQL
  --pause MS       attente entre deux requêtes (défaut 300)
  --dry-run        compter sans écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i += 1];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--lot') options.lot = Number(next()) || DEFAULTS.lot;
    else if (arg === '--out') options.out = next();
    else if (arg === '--endpoint') options.endpoint = next();
    else if (arg === '--pause') options.pause = Number(next()) || DEFAULTS.pause;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/** Une relation, pour un lot d'identifiants. Rien d'autre : deux colonnes. */
const requete = (qids, prop) => `
SELECT ?s ?autre WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?s wdt:${prop} ?autre .
}`;

const idOf = (uri) => String(uri || '').replace(/^.*\/entity\//, '').toUpperCase();

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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = lireCorpus();
  const parQid = new Map();
  for (const saint of saints) {
    const qid = qidDe(saint);
    if (!qid) continue;
    if (!parQid.has(qid)) parQid.set(qid, []);
    parQid.get(qid).push(saint);
  }
  const qids = [...parQid.keys()];
  console.log(`${saints.length} fiches, dont ${qids.length} avec un identifiant Wikidata.`);

  // saintId -> Map(autreSaintId -> sorte)
  const liens = new Map();
  const poser = (a, b, sorte) => {
    if (!a || !b || a.id === b.id) return false;
    const table = liens.get(a.id) || new Map();
    const deja = table.get(b.id);
    // Deux fiches peuvent être liées deux fois — maître et père, sœur et
    // disciple. On garde la plus précise, celle qui vient en tête de SORTES.
    if (deja != null && RANG.get(deja) <= RANG.get(sorte)) return false;
    table.set(b.id, sorte);
    liens.set(a.id, table);
    return deja == null;
  };

  let horsCorpus = 0;
  for (const [prop, versLautre, versMoi] of RELATIONS) {
    let trouves = 0;
    for (let i = 0; i < qids.length; i += options.lot) {
      const lot = qids.slice(i, i + options.lot);
      let rows = [];
      try {
        rows = await sparql(options.endpoint, requete(lot, prop), options);
      } catch (error) {
        console.warn(`  ${prop} ${i}-${i + options.lot} : ${error.message}`);
      }
      for (const row of rows) {
        const moi = parQid.get(idOf(row.s?.value)) || [];
        const autres = parQid.get(idOf(row.autre?.value));
        // Le bout d'en face n'est pas au corpus : le lien ne mènerait nulle
        // part, et une fiche qui promet une fiche absente est une porte peinte.
        if (!autres) { horsCorpus += 1; continue; }
        for (const a of moi) {
          for (const b of autres) {
            if (poser(a, b, versLautre)) trouves += 1;
            // Le lien se pose des deux côtés : Scholastique est la sœur de
            // Benoît autant que Benoît est le frère de Scholastique, et
            // Wikidata ne l'écrit parfois que d'un seul.
            poser(b, a, versMoi);
          }
        }
      }
      await sleep(options.pause);
      progress(`  ${prop} : ${Math.min(i + options.lot, qids.length)}/${qids.length}`,
        { done: i + options.lot >= qids.length });
    }
    console.log(`  ${prop.padEnd(6)} ${versLautre.padEnd(10)} ${trouves}`);
  }

  const total = [...liens.values()].reduce((n, t) => n + t.size, 0);
  console.log(`\n${total} liens pour ${liens.size} saints.`);
  console.log(`  ${horsCorpus} liens écartés : l’autre bout n’est pas au corpus.`);

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  const sortie = {};
  for (const [id, table] of [...liens].sort(([a], [b]) => a.localeCompare(b))) {
    sortie[id] = [...table]
      .map(([autre, quoi]) => ({ id: autre, quoi }))
      .sort((a, b) => RANG.get(a.quoi) - RANG.get(b.quoi) || a.id.localeCompare(b.id));
  }
  writeFileSync(options.out, `${JSON.stringify({
    source: 'Wikidata (CC0), propriétés P22, P25, P26, P40, P737, P802, P1038,'
      + ' P1066 et P3373',
    note: 'Écrit par tools/import-liens.mjs. Ne pas modifier à la main : le fichier'
      + ' est réécrit d’un bloc. « quoi » vaut ' + SORTES.join(', ') + '.',
    liens: sortie,
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${options.out}`);
}

await main();
