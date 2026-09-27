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
 * Neuf relations disent cela, et neuf seulement :
 *
 * | propriété      | ce qu'elle dit         | notre mot     |
 * | -------------- | ---------------------- | ------------- |
 * | P19            | lieu de naissance      | `naissance`   |
 * | P20            | lieu de mort           | `mort`        |
 * | P119           | lieu de sépulture      | `sepulture`   |
 * | P551           | lieu de résidence      | `residence`   |
 * | P551 + P580    | résidence d'avant 18 ans | `enfance`   |
 * | P69            | lieu d'études          | `formation`   |
 * | P69 + P582     | études finies avant 20 ans | `enfance` |
 * | P937           | lieu de travail        | `oeuvre`      |
 * | P112 ⁻¹        | ce qu'il a fondé       | `fondation`   |
 * | P793 + P276    | événement notable situé | `miracle`, `apparition` |
 * | P710 ⁻¹        | événement auquel il a pris part | `miracle`, `apparition` |
 *
 * ## L'enfance, et ce qu'on peut honnêtement en dire
 *
 * Wikidata n'a pas de propriété « a grandi ici ». Elle a des résidences, et
 * parfois la date où elles commencent ; elle a des lieux d'études, et parfois
 * celle où elles finissent. Quand cette date tombe dans les dix-huit premières
 * années d'une vie dont on connaît le début, le lieu est dit `enfance` ; sinon
 * il reste `residence` ou `formation`. On ne devine pas le reste : un saint dont
 * on ignore l'année de naissance n'aura jamais de lieu d'enfance ici, et c'est
 * plus honnête qu'un « sans doute » posé sur une carte.
 *
 * ## Les miracles et les apparitions
 *
 * Un événement notable (P793) porté par une fiche de saint et situé par un
 * qualificatif de lieu (P276), ou un événement dont le saint est participant
 * (P710) et qui a des coordonnées : ces deux prises ramènent de tout — des
 * conciles, des canonisations, des batailles. On ne garde que ce que le nom de
 * l'événement désigne comme un miracle ou une apparition, et l'on jette le
 * reste plutôt que d'appeler « miracle » un synode.
 *
 * Wikidata ne connaît de la sorte qu'une poignée de cas. Les grands lieux de
 * miracle et de prédilection sont donc écrits à la main, dans
 * `data/saints/lieux-notables.json`, qui n'est pas réécrit par cet outil.
 *
 * ## Ce qui n'y est pas, et pourquoi
 *
 * Les dédicaces. Il y a des milliers d'églises Saint-Pierre, et Pierre n'en a
 * marqué aucune : elles ont été marquées **par d'autres, après lui**. La
 * demande était « les lieux marqués par le saint de son vivant ou de sa mort » ;
 * une dédicace est le contraire — c'est le lieu qui se réclame du saint. Les
 * inclure aurait donné quatre mille croix à Rome et aucune information.
 *
 * Restent donc les lieux où il a grandi, étudié, vécu, œuvré, fondé, où il a vu
 * le ciel s'ouvrir, où il est mort, et où il repose. Chaque lieu porte son
 * motif : la fiche dit « Sépulture » ou « Enfance », et non un point muet de
 * plus.
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
 * Les motifs, du plus parlant au plus banal.
 *
 * L'ordre compte : un même lieu peut être à la fois la résidence et la
 * sépulture, et c'est la sépulture qu'on retient — elle est plus parlante, et
 * c'est elle que le pèlerin cherche. `predilection` ne vient jamais d'ici : il
 * est écrit à la main, et le rang lui sert seulement à se ranger dans la liste.
 */
export const MOTIFS = [
  'sepulture', 'mort', 'apparition', 'miracle', 'predilection',
  'fondation', 'oeuvre', 'enfance', 'formation', 'residence', 'naissance',
];

const RANG = new Map(MOTIFS.map((nom, i) => [nom, i]));

/**
 * Les relations interrogées, et ce qu'elles ramènent.
 *
 * `quoi` est le motif par défaut ; `affine`, quand il existe, le corrige au vu
 * des dates ou du nom de l'événement, et rend `null` pour jeter la ligne.
 */
const RELATIONS = [
  { quoi: 'sepulture', motif: '?s wdt:P119 ?lieu .' },
  { quoi: 'mort', motif: '?s wdt:P20 ?lieu .' },
  { quoi: 'fondation', motif: '?lieu wdt:P112 ?s .' },
  { quoi: 'oeuvre', motif: '?s wdt:P937 ?lieu .' },
  {
    // La résidence avec la date où elle commence : c'est elle qui distingue le
    // village d'une enfance de la ville d'un ministère.
    quoi: 'residence',
    motif: '?s p:P551 ?dit . ?dit ps:P551 ?lieu .\n  OPTIONAL { ?dit pq:P580 ?debut . }',
    affine: (row, saint) => (jeune(anneeDe(row.debut), saint, 18) ? 'enfance' : 'residence'),
  },
  {
    // Le lieu d'études, avec la date où elles s'achèvent : une école quittée
    // avant vingt ans est une enfance, une université ne l'est pas.
    quoi: 'formation',
    motif: '?s p:P69 ?dit . ?dit ps:P69 ?lieu .\n  OPTIONAL { ?dit pq:P582 ?fin . }',
    affine: (row, saint) => (jeune(anneeDe(row.fin), saint, 20) ? 'enfance' : 'formation'),
  },
  {
    // Un événement notable de sa vie, situé par un qualificatif de lieu.
    quoi: 'evenement',
    motif: '?s p:P793 ?dit . ?dit ps:P793 ?fait . ?dit pq:P276 ?lieu .\n'
      + '  OPTIONAL { ?fait rdfs:label ?faitFr . FILTER(LANG(?faitFr) = "fr") }\n'
      + '  OPTIONAL { ?fait rdfs:label ?faitEn . FILTER(LANG(?faitEn) = "en") }',
    affine: (row) => sorteDeFait(row.faitFr?.value, row.faitEn?.value),
  },
  {
    // Un événement auquel il a pris part, et qui a lui-même des coordonnées :
    // les apparitions mariales sont dans ce cas, avec leurs voyants.
    quoi: 'evenement',
    motif: '?fait wdt:P710 ?s . BIND(?fait AS ?lieu)\n'
      + '  OPTIONAL { ?fait rdfs:label ?faitFr . FILTER(LANG(?faitFr) = "fr") }\n'
      + '  OPTIONAL { ?fait rdfs:label ?faitEn . FILTER(LANG(?faitEn) = "en") }',
    affine: (row) => sorteDeFait(row.faitFr?.value, row.faitEn?.value),
  },
  { quoi: 'naissance', motif: '?s wdt:P19 ?lieu .' },
];

/** « +1858-02-11T00:00:00Z » -> 1858 ; « -0044-03-15… » -> -44. */
function anneeDe(cell) {
  const m = /^([+-]?)(\d{1,4})-/.exec(String(cell?.value || ''));
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * Number(m[2]);
}

/** Cette date tombe-t-elle dans les premières années d'une vie qu'on date ? */
function jeune(annee, saint, age) {
  if (annee == null || saint?.born == null) return false;
  return annee >= saint.born && annee <= saint.born + age;
}

/**
 * Ce qu'un événement notable est, à lire son nom.
 *
 * Wikidata range sous « événement notable » le sacre, le concile, le procès et
 * la canonisation aussi bien que la vision. On ne retient que les deux sortes
 * qu'on a promis de montrer, et l'on jette le reste : mieux vaut un lieu de
 * moins qu'un synode appelé miracle.
 */
function sorteDeFait(fr, en) {
  const texte = `${fr || ''} ${en || ''}`.toLowerCase();
  if (/apparition|vision|apparaît|appearance|marian/.test(texte)) return 'apparition';
  if (/miracle|miraculous|stigmat|guérison|healing|resurrection|multiplication/.test(texte)) {
    return 'miracle';
  }
  return null;
}

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
SELECT * WHERE {
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

  for (const { quoi: parDefaut, motif, affine } of RELATIONS) {
    let trouves = 0;
    let ecartes = 0;
    for (let i = 0; i < qids.length; i += options.lot) {
      const lot = qids.slice(i, i + options.lot);
      let rows = [];
      try {
        rows = await sparql(options.endpoint, requete(lot, motif), options);
      } catch (error) {
        // Un lot qui résiste ne doit pas emporter la collecte entière : on le
        // dit, et l'on continue. Ce qui manque manquera, et se verra au compte.
        console.warn(`  ${parDefaut} ${i}-${i + options.lot} : ${error.message}`);
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
          // Le motif se décide fiche par fiche : la même résidence est une
          // enfance pour qui l'a quittée à seize ans, une résidence pour l'autre.
          const quoi = affine ? affine(row, saint) : parDefaut;
          if (!quoi) { ecartes += 1; continue; }
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
      progress(`  ${parDefaut} : ${Math.min(i + options.lot, qids.length)}/${qids.length}`,
        { done: i + options.lot >= qids.length });
    }
    comptes[parDefaut] = (comptes[parDefaut] || 0) + trouves;
    console.log(`  ${parDefaut.padEnd(10)} ${trouves}`
      + (ecartes ? ` (${ecartes} lignes écartées)` : ''));
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
  // Le détail par motif : c'est lui qui dit si l'enfance a pris, et combien de
  // miracles Wikidata connaît vraiment.
  const parMotif = {};
  for (const liste of lieux.values()) {
    for (const l of liste) parMotif[l.quoi] = (parMotif[l.quoi] || 0) + 1;
  }
  for (const nom of MOTIFS) {
    if (parMotif[nom]) console.log(`  ${nom.padEnd(12)} ${parMotif[nom]}`);
  }
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
    source: 'Wikidata (CC0), propriétés P19, P20, P69, P112, P119, P276, P551,'
      + ' P710, P793 et P937',
    note: 'Écrit par tools/import-lieux.mjs. Ne pas modifier à la main : le fichier'
      + ' est réécrit d’un bloc. Les lieux écrits à la main vivent dans'
      + ' lieux-notables.json, que cet outil ne touche pas. « quoi » vaut '
      + MOTIFS.join(', ') + '.',
    lieux: sortie,
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${options.out}`);
}

await main();
