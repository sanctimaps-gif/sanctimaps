/**
 * Va chercher les lieux qu'un saint a marqués de sa vie ou de sa mort.
 *
 *   node tools/import-lieux.mjs
 *   node tools/import-lieux.mjs --dry-run
 *   node tools/import-lieux.mjs --lot 120
 *
 * ## Ce qu'est un lieu marqué
 *
 * La carte pose une croix là où le saint est né. C'est un point, et une vie n'en
 * tient pas dans un point : Benoît est né à Nursie, mais c'est au Mont-Cassin
 * qu'il a fondé son ordre et qu'il est enterré ; Thomas Becket est né à Londres
 * et c'est Canterbury qui garde son sang.
 *
 * Six relations disent cela, et six seulement :
 *
 * | propriété | ce qu'elle dit         | notre mot     |
 * | --------- | ---------------------- | ------------- |
 * | P19       | lieu de naissance      | `naissance`   |
 * | P20       | lieu de mort           | `mort`        |
 * | P119      | lieu de sépulture      | `sepulture`   |
 * | P551      | lieu de résidence      | `residence`   |
 * | P937      | lieu de travail        | `oeuvre`      |
 * | P112 ⁻¹   | ce qu'il a fondé       | `fondation`   |
 *
 * ## Ce qui n'y est pas, et pourquoi
 *
 * Les dédicaces. Il y a des milliers d'églises Saint-Pierre, et Pierre n'en a
 * marqué aucune : elles ont été marquées **par d'autres, après lui**. La
 * demande était « les lieux marqués par le saint de son vivant ou de sa mort » ;
 * une dédicace est le contraire — c'est le lieu qui se réclame du saint. Les
 * inclure aurait donné quatre mille croix à Rome et aucune information.
 *
 * Restent donc les lieux où il a vécu, œuvré, fondé, est mort, et repose. Chaque
 * lieu porte son motif : la fiche dit « Sépulture » ou « Fondation », et non un
 * point muet de plus.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCorpus } from './lib/corpus.mjs';
import { progress, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  out: join(ROOT, 'data', 'saints', 'lieux.json'),
  lot: 120,
  pause: 300,
  dryRun: false,
};

/**
 * Les six relations, et le mot que la fiche en dira.
 *
 * L'ordre compte : un même lieu peut être à la fois la résidence et la
 * sépulture, et c'est la sépulture qu'on retient — elle est plus parlante, et
 * c'est elle que le pèlerin cherche.
 */
const RELATIONS = [
  ['sepulture', '?s wdt:P119 ?lieu .'],
  ['mort', '?s wdt:P20 ?lieu .'],
  ['fondation', '?lieu wdt:P112 ?s .'],
  ['oeuvre', '?s wdt:P937 ?lieu .'],
  ['residence', '?s wdt:P551 ?lieu .'],
  ['naissance', '?s wdt:P19 ?lieu .'],
];

const RANG = new Map(RELATIONS.map(([nom], i) => [nom, i]));

const HELP = `Relève les lieux marqués par chaque saint.

  --lot N          identifiants par requête (défaut 120)
  --out FICHIER    fichier de sortie (défaut : data/saints/lieux.json)
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

/**
 * Une relation, pour un lot d'identifiants.
 *
 * Un motif, pas quinze : la leçon des apparitions vaut ici aussi, et le
 * corpus est vingt fois plus gros. Chaque requête ne demande que le lieu, son
 * point et son nom — ce qu'il faut pour poser une croix et l'annoncer.
 */
const requete = (qids, motif) => `
SELECT ?s ?lieu ?coord ?nomFr ?nomEn WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ${motif}
  ?lieu wdt:P625 ?coord .
  OPTIONAL { ?lieu rdfs:label ?nomFr . FILTER(LANG(?nomFr) = "fr") }
  OPTIONAL { ?lieu rdfs:label ?nomEn . FILTER(LANG(?nomEn) = "en") }
}`;

const idOf = (uri) => String(uri || '').replace(/^.*\/entity\//, '');

/** « Point(3.0035 43.1841) » -> [longitude, latitude]. */
function pointOf(wkt) {
  const match = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(String(wkt || ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
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

/** Deux points à moins d'un kilomètre sont le même endroit. */
function memeEndroit(a, b) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) < 1;
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

  // saintId -> [{ nom, lat, lng, quoi, qid }]
  const lieux = new Map();
  const comptes = {};
  const sansPoint = { total: 0 };

  for (const [quoi, motif] of RELATIONS) {
    let trouves = 0;
    for (let i = 0; i < qids.length; i += options.lot) {
      const lot = qids.slice(i, i + options.lot);
      let rows = [];
      try {
        rows = await sparql(options.endpoint, requete(lot, motif), options);
      } catch (error) {
        // Un lot qui résiste ne doit pas emporter la collecte entière : on le
        // dit, et l'on continue. Ce qui manque manquera, et se verra au compte.
        console.warn(`  ${quoi} ${i}-${i + options.lot} : ${error.message}`);
      }
      for (const row of rows) {
        const point = pointOf(row.coord?.value);
        if (!point) { sansPoint.total += 1; continue; }
        const [lng, lat] = point;
        if (Math.abs(lat) > 85 || Math.abs(lng) > 180) continue;
        const nom = row.nomFr?.value || row.nomEn?.value;
        if (!nom) continue;
        const qid = idOf(row.s?.value).toUpperCase();
        for (const saint of parQid.get(qid) || []) {
          const liste = lieux.get(saint.id) || [];
          const lieu = {
            nom,
            lat: Number(lat.toFixed(4)),
            lng: Number(lng.toFixed(4)),
            quoi,
            qid: idOf(row.lieu?.value),
          };

          // Le même endroit peut revenir par deux relations — on est mort là où
          // l'on vivait, on repose là où l'on est mort. On garde la plus
          // parlante des deux, et une seule croix.
          const deja = liste.findIndex((l) => memeEndroit(l, lieu) || l.qid === lieu.qid);
          if (deja >= 0) {
            if (RANG.get(quoi) < RANG.get(liste[deja].quoi)) liste[deja] = lieu;
          } else {
            liste.push(lieu);
            trouves += 1;
          }
          lieux.set(saint.id, liste);
        }
      }
      await sleep(options.pause);
      progress(`  ${quoi} : ${Math.min(i + options.lot, qids.length)}/${qids.length}`,
        { done: i + options.lot >= qids.length });
    }
    comptes[quoi] = trouves;
    console.log(`  ${quoi.padEnd(10)} ${trouves}`);
  }

  // Le lieu de naissance est déjà la croix de la carte : le garder en double
  // n'apprendrait rien. On ne l'écarte qu'ici, une fois qu'il a servi à
  // reconnaître les doublons des autres relations.
  let naissancesEcartees = 0;
  for (const [id, liste] of lieux) {
    const saint = saints.find((s) => s.id === id);
    const reste = liste.filter((l) => {
      if (l.quoi !== 'naissance') return true;
      if (saint && memeEndroit(l, saint)) { naissancesEcartees += 1; return false; }
      return true;
    });
    if (reste.length) lieux.set(id, reste); else lieux.delete(id);
  }

  const total = [...lieux.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\n${total} lieux pour ${lieux.size} saints`
    + ` (${(total / Math.max(1, lieux.size)).toFixed(1)} par saint).`);
  console.log(`  ${naissancesEcartees} lieux de naissance écartés : la croix y est déjà.`);
  if (sansPoint.total) console.log(`  ${sansPoint.total} lignes sans coordonnées, écartées.`);
  const plusieurs = [...lieux.values()].filter((l) => l.length > 1).length;
  console.log(`  ${plusieurs} saints ont plus d’un lieu.`);

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  const sortie = {};
  for (const [id, liste] of [...lieux].sort(([a], [b]) => a.localeCompare(b))) {
    sortie[id] = liste.sort((a, b) => RANG.get(a.quoi) - RANG.get(b.quoi));
  }
  writeFileSync(options.out, `${JSON.stringify({
    source: 'Wikidata (CC0), propriétés P19, P20, P112, P119, P551 et P937',
    note: 'Écrit par tools/import-lieux.mjs. Ne pas modifier à la main : le fichier'
      + ' est réécrit d’un bloc. « quoi » vaut sepulture, mort, fondation, oeuvre,'
      + ' residence ou naissance.',
    lieux: sortie,
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${options.out}`);
}

await main();
