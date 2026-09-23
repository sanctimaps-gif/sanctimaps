/**
 * Cherche une biographie aux fiches qui n'en ont aucune, dans toutes les
 * langues où Wikipédia en a une.
 *
 *   node tools/completer-bios.mjs
 *   node tools/completer-bios.mjs --dry-run
 *   node tools/completer-bios.mjs --langues es,it,pl
 *
 * ## Pourquoi il en manque sept cent soixante-douze
 *
 * L'import de masse ne demandait à Wikidata que deux articles : le français et
 * l'anglais. C'est ce qui s'affiche, et cela couvrait quatre fiches sur cinq.
 * Le cinquième cinquième, lui, n'a d'article dans aucune de ces deux
 * langues — et ce n'est pas un hasard : ce sont deux cent quarante-huit
 * martyrs de la guerre d'Espagne, cent trente Italiens, soixante-douze Chinois
 * de 1900, cinquante-deux Polonais, trente Coréens. Leur vie est écrite, mais
 * en espagnol, en italien, en polonais, en coréen.
 *
 * L'article existe donc presque toujours ; c'est la question qui était trop
 * étroite.
 *
 * ## Ce que l'outil rapporte, et ce qu'il ne fait pas
 *
 * Il dépose les introductions trouvées dans `data/saints/bios-importees.json`,
 * langue par langue, avec l'adresse de chaque article — l'attribution n'est
 * pas facultative sous licence CC BY-SA. `build-data.mjs` les verse dans les
 * fiches qui n'ont rien.
 *
 * Il ne traduit pas. La carte n'affiche que le français : une biographie
 * espagnole reste invisible tant qu'elle n'est pas traduite à la main, dans
 * `data/saints/traductions.json`, comme l'ont été les cinq cent trente-huit
 * biographies anglaises. Ce que cet outil apporte, c'est la matière de cette
 * traduction — et, en attendant, une fiche qui sait où l'on parle d'elle.
 *
 * ## Pourquoi il faut Internet
 *
 * Wikidata et Wikipédia ne sont pas joignables depuis tous les réseaux.
 * L'atelier « Compléter les biographies » le lance sur une machine de GitHub,
 * qui l'est.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extracts, progress, shorten, sleep, sparql } from './lib/wikimedia.mjs';
import { lireCorpus } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'saints', 'bios-importees.json');

/**
 * Les langues interrogées, dans l'ordre où l'on préfère les lire.
 *
 * Le français et l'anglais d'abord — l'import a pu les manquer depuis, un
 * article paraît tous les jours. Viennent ensuite les langues des pays d'où
 * viennent les fiches sans récit : l'espagnol et l'italien en tête, puis le
 * polonais, le portugais, l'allemand, et les trois langues d'Asie qui portent
 * les martyrs de Chine, de Corée et du Viêt Nam.
 */
const LANGUES = ['fr', 'en', 'es', 'it', 'pl', 'pt', 'de', 'nl', 'ca', 'la',
  'ko', 'zh', 'vi', 'ru', 'uk', 'el', 'tr', 'ar', 'hu', 'cs', 'ro', 'hr', 'sl'];

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  wikipedia: 'https://{lang}.wikipedia.org',
  langues: LANGUES,
  lot: 200,
  pause: 300,
  dryRun: false,
};

const HELP = `Cherche une biographie aux fiches qui n'en ont aucune.

  --endpoint URL   point d'entrée SPARQL
  --wikipedia URL  adresse de Wikipédia, « {lang} » valant la langue
  --langues a,b,c  langues à interroger (défaut : ${LANGUES.length} langues)
  --lot N          identifiants par requête (défaut 200)
  --dry-run        chercher et compter sans rien écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--endpoint') options.endpoint = String(argv[i += 1]);
    else if (arg === '--wikipedia') options.wikipedia = String(argv[i += 1]);
    else if (arg === '--lot') options.lot = Number(argv[i += 1]) || DEFAULTS.lot;
    else if (arg === '--langues') {
      options.langues = String(argv[i += 1]).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--help' || arg === '-h') options.help = true;
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

/**
 * Tous les articles d'un élément, langue par langue.
 *
 * Une seule requête rend les vingt-trois langues à la fois : demander
 * `schema:isPartOf` sans le contraindre, puis lire le domaine du site, coûte
 * moins qu'une requête par langue et ne fatigue pas le service public.
 */
const articlesFor = (qids) => `
SELECT ?s ?site ?titre WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?article schema:about ?s ; schema:isPartOf ?site ; schema:name ?titre .
  FILTER(CONTAINS(STR(?site), ".wikipedia.org"))
}`;

const langueDe = (site) => (/^https?:\/\/([a-z-]+)\.wikipedia\.org/i.exec(site) || [])[1] || null;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = lireCorpus();
  // Une fiche qui a déjà un récit n'a rien à demander : la biographie écrite à
  // la main ou rapportée du français l'emporte sur tout ce qu'on irait
  // chercher ailleurs.
  const manquantes = saints.filter((s) => !s.bio?.fr && !s.bio?.en);
  const parQid = new Map();
  for (const saint of manquantes) {
    const qid = qidDe(saint);
    if (qid) parQid.set(qid, saint);
  }
  console.log(`${manquantes.length} fiches sans biographie, dont ${parQid.size}`
    + ' avec un identifiant Wikidata.');
  if (!parQid.size) return;

  // 1. Quels articles existent, et dans quelles langues.
  const voulues = new Set(options.langues);
  const titres = new Map();            // langue -> Map(titre -> id de fiche)
  const qids = [...parQid.keys()];
  for (let i = 0; i < qids.length; i += options.lot) {
    const lot = qids.slice(i, i + options.lot);
    const rows = await sparql(options.endpoint, articlesFor(lot), options);
    for (const row of rows) {
      const lang = langueDe(row.site.value);
      if (!lang || !voulues.has(lang)) continue;
      const qid = String(row.s.value).replace(/^.*\/entity\//, '').toUpperCase();
      const saint = parQid.get(qid);
      if (!saint) continue;
      if (!titres.has(lang)) titres.set(lang, new Map());
      titres.get(lang).set(row.titre.value, saint.id);
    }
    progress(`  articles : ${Math.min(i + options.lot, qids.length)} / ${qids.length}`,
      { done: i + options.lot >= qids.length });
    await sleep(options.pause);
  }

  const couvertes = new Set();
  for (const parTitre of titres.values()) for (const id of parTitre.values()) couvertes.add(id);
  console.log(`\nArticles trouvés pour ${couvertes.size} fiches, dans ${titres.size} langues :`);
  for (const [lang, parTitre] of [...titres].sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${lang.padEnd(4)} ${parTitre.size}`);
  }

  // 2. L'introduction de chacun, réduite à trois phrases.
  const trouvees = {};
  for (const lang of options.langues) {
    const parTitre = titres.get(lang);
    if (!parTitre) continue;
    const textes = await extracts(lang, [...parTitre.keys()],
      { wikipedia: options.wikipedia, pause: options.pause, label: 'biographies' });
    for (const [titre, texte] of textes) {
      const id = parTitre.get(titre);
      const court = shorten(texte);
      if (!court) continue;
      trouvees[id] ??= { bio: {}, sources: [] };
      trouvees[id].bio[lang] = court;
      trouvees[id].sources.push({
        label: `Wikipédia (${lang})`,
        url: `${options.wikipedia.replace('{lang}', lang)}/wiki/`
          + `${encodeURIComponent(titre.replace(/ /g, '_'))}`,
      });
    }
  }

  const n = Object.keys(trouvees).length;
  const parLangue = {};
  for (const { bio } of Object.values(trouvees)) {
    for (const lang of Object.keys(bio)) parLangue[lang] = (parLangue[lang] || 0) + 1;
  }
  console.log(`\n${n} biographies rapportées sur ${manquantes.length} fiches sans récit.`);
  for (const [lang, k] of Object.entries(parLangue).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang.padEnd(4)} ${k}`);
  }
  const enFrancais = parLangue.fr || 0;
  console.log(`\n${enFrancais} sont en français et s'afficheront telles quelles ;`);
  console.log(`les ${n - enFrancais} autres attendent une traduction dans`
    + ' data/saints/traductions.json.');

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  // Ce que l'on avait déjà trouvé se garde : un article retiré de Wikipédia
  // entre deux passages ne doit pas effacer la biographie qu'il avait donnée.
  let anciennes = {};
  if (existsSync(OUT)) {
    anciennes = JSON.parse(readFileSync(OUT, 'utf8')).biographies || {};
  }
  const toutes = { ...anciennes, ...trouvees };
  writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikipédia, introductions d’articles (CC BY-SA), via Wikidata (CC0)',
    note: 'Écrit par tools/completer-bios.mjs pour les fiches qui n’avaient aucun'
      + ' récit. Ne pas modifier à la main : le fichier est réécrit d’un bloc.'
      + ' La traduction en français, elle, s’écrit à la main dans traductions.json.',
    biographies: Object.fromEntries(Object.entries(toutes).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${OUT}`);
}

await main();
