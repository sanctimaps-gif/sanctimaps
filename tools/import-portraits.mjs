/**
 * Va chercher le portrait de chaque saint : l'icône, la fresque ou le tableau.
 *
 *   node tools/import-portraits.mjs
 *   node tools/import-portraits.mjs --dry-run
 *
 * ## Pourquoi un outil à part
 *
 * L'application sait demander une image à Wikidata au moment où l'on ouvre une
 * fiche. Mais les pages de biographie — `saints/<nom>/` — sont des fichiers
 * écrits d'avance : elles ne demandent rien à personne, et les moteurs de
 * recherche les lisent telles qu'elles sont. Pour qu'elles portent l'icône du
 * saint, il faut la connaître au moment de les écrire.
 *
 * Comme `import-statuts.mjs`, celui-ci ne demande qu'une chose et ne touche
 * qu'un fichier : `data/saints/portraits.json`. Il tourne sur une machine de
 * GitHub, qui a accès à Wikimedia, et `build-data` le lit s'il existe.
 *
 * ## Ce qu'il retient
 *
 * Pour chaque fiche dont l'élément Wikidata porte une image (propriété P18) :
 * l'adresse d'une vignette de Commons, la page du fichier, l'auteur et la
 * licence. Le crédit n'est pas facultatif — beaucoup de ces images sont sous
 * CC BY-SA, et elles ne se reprennent qu'avec lui.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENT, progress, sleep, sparql } from './lib/wikimedia.mjs';
import { lireCorpus } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'saints', 'portraits.json');
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql', lot: 250, largeur: 480, dryRun: false, pause: 300,
};

const HELP = `Relève l'image (P18) de chaque fiche et son crédit sur Commons.

  --endpoint URL   point d'entrée SPARQL
  --lot N          identifiants par requête SPARQL (défaut 250)
  --largeur N      largeur des vignettes, en pixels (défaut 480)
  --dry-run        interroger et compter sans rien écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--endpoint') options.endpoint = String(argv[i += 1]);
    else if (arg === '--lot') options.lot = Number(argv[i += 1]) || DEFAULTS.lot;
    else if (arg === '--largeur') options.largeur = Number(argv[i += 1]) || DEFAULTS.largeur;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
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

// Le rang compte : quand un saint a plusieurs images, Wikidata marque celle
// qu'il préfère. On les prend toutes, et l'on choisit ensuite.
const requete = (qids) => `
SELECT ?s ?img ?rank WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?s p:P18 ?st .
  ?st ps:P18 ?img ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
}`;

/** « …/Special:FilePath/Ignatius%20icon.jpg » → « Ignatius icon.jpg ». */
function fichierDe(url) {
  return decodeURIComponent(String(url).replace(/^.*\/Special:FilePath\//, '')).replace(/_/g, ' ');
}

/** Le texte d'un champ de métadonnées de Commons, sans balises ni entités. */
function texte(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function commons(titres, largeur, pause) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName', iiurlwidth: String(largeur),
    titles: titres.map((t) => `File:${t}`).join('|'),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${COMMONS}?${params}`, { headers: { 'User-Agent': AGENT } });
    if (res.ok) return res.json();
    if (![429, 502, 503, 504].includes(res.status)) throw new Error(`Commons : ${res.status}`);
    await sleep(pause * (attempt + 2) * 5);
  }
  throw new Error('Commons surchargé après trois tentatives');
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
    parQid.get(qid).push(saint.id);
  }
  const qids = [...parQid.keys()];
  console.log(`${saints.length} fiches, dont ${qids.length} avec un identifiant Wikidata.`);

  // 1. Le nom du fichier, par Wikidata.
  const fichierParQid = new Map();
  for (let i = 0; i < qids.length; i += options.lot) {
    const lot = qids.slice(i, i + options.lot);
    const rows = await sparql(options.endpoint, requete(lot), options);
    for (const row of rows) {
      const qid = String(row.s.value).replace(/^.*\/entity\//, '').toUpperCase();
      const prefere = /PreferredRank$/.test(row.rank?.value || '');
      if (fichierParQid.has(qid) && !prefere) continue;
      fichierParQid.set(qid, fichierDe(row.img.value));
    }
    progress(`  Wikidata : ${Math.min(i + options.lot, qids.length)} / ${qids.length}`,
      { done: i + options.lot >= qids.length });
    await sleep(options.pause);
  }
  console.log(`${fichierParQid.size} éléments portent une image.`);

  // 2. La vignette et le crédit, par Commons — cinquante fichiers par appel.
  const fichiers = [...new Set(fichierParQid.values())];
  const infoParFichier = new Map();
  for (let i = 0; i < fichiers.length; i += 50) {
    const lot = fichiers.slice(i, i + 50);
    const data = await commons(lot, options.largeur, options.pause);
    // Commons normalise les titres (majuscule initiale, espaces) : on suit ses
    // renvois pour retrouver le nom qu'on lui avait donné.
    const retour = new Map();
    for (const n of data?.query?.normalized || []) retour.set(n.to, n.from);
    for (const page of Object.values(data?.query?.pages || {})) {
      const ii = page.imageinfo?.[0];
      if (!ii?.thumburl) continue;
      const titre = (retour.get(page.title) || page.title).replace(/^File:/, '');
      const meta = ii.extmetadata || {};
      infoParFichier.set(titre, {
        src: ii.thumburl,
        page: ii.descriptionurl,
        auteur: texte(meta.Artist?.value).slice(0, 120),
        licence: texte(meta.LicenseShortName?.value),
      });
    }
    progress(`  Commons : ${Math.min(i + 50, fichiers.length)} / ${fichiers.length}`,
      { done: i + 50 >= fichiers.length });
    await sleep(options.pause);
  }

  const portraits = {};
  for (const [qid, fichier] of fichierParQid) {
    const info = infoParFichier.get(fichier);
    if (!info) continue;
    for (const id of parQid.get(qid) || []) portraits[id] = info;
  }
  console.log(`\nPortraits relevés : ${Object.keys(portraits).length} fiches`
    + ` sur ${saints.length}`);

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikidata, propriété P18 (image) ; vignettes et crédits de Wikimedia Commons',
    note: 'Écrit par tools/import-portraits.mjs. Ne pas modifier à la main : le'
      + ' fichier est réécrit d’un bloc. Chaque image garde son auteur et sa'
      + ' licence, qui doivent l’accompagner partout où elle paraît.',
    portraits: Object.fromEntries(Object.entries(portraits).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${OUT}`);
}

await main();
