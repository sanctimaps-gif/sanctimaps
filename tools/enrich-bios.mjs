/**
 * Donne une biographie aux fiches écrites à la main.
 *
 *   node tools/enrich-bios.mjs              # toutes les fiches qui n'en ont pas
 *   node tools/enrich-bios.mjs --dry-run    # apparier sans rien écrire
 *   node tools/enrich-bios.mjs --limit 20   # un échantillon, pour voir
 *
 * ## Pourquoi un second outil
 *
 * `import-saints.mjs` part de Wikidata et fabrique des fiches : il connaît
 * l'identifiant de chaque saint, l'article s'en déduit sans risque. Les deux
 * cent quatre-vingt-cinq fiches écrites à la main font le chemin inverse —
 * elles portent un nom, des dates et une fête, mais aucun identifiant. Ce sont
 * pourtant les plus regardées : les apôtres, Marie, Joseph, François d'Assise.
 * Elles avaient une notice d'une ligne et pas de récit.
 *
 * ## L'appariement, et pourquoi il est méfiant
 *
 * Chercher « Sébastien » sur Wikidata ramène aussi bien le martyr que Jean-
 * Sébastien Bach. Un homonyme mal apparié mettrait la biographie d'un autre
 * sous le nom du saint, et sur les fiches les plus lues : mieux vaut cent
 * fiches sans récit qu'une fiche avec le mauvais.
 *
 * Trois garde-fous, donc :
 *
 * 1. **Le statut de canonisation** (`P411`) est exigé. La propriété ne
 *    s'applique qu'aux saints, bienheureux et vénérables : le musicien sort.
 * 2. **Le nom ne suffit jamais.** Il faut en plus une concordance : la même
 *    date de fête, ou une année de mort à cinq ans près. Un nom seul,
 *    fût-il exact, ne fait pas entrer la fiche.
 * 3. **Le meilleur candidat l'emporte, et il doit l'emporter seul.** Deux
 *    candidats à égalité de score, c'est un doute : la fiche est laissée sans
 *    biographie et l'on dit lequel a été écarté.
 *
 * Ce que l'outil ne fait pas : écrire. Il ne rédige rien, il rapporte
 * l'introduction de l'article de Wikipédia, réduite à trois phrases, et joint
 * l'adresse — le texte est en CC BY-SA, l'attribution voyage avec lui.
 *
 * Le résultat va dans `data/saints/biographies.json`, à part des fiches, comme
 * les patronages : une biographie s'ajoute à une fiche sans qu'il faille
 * rouvrir les huit fichiers du corpus, et `build:data` fait la jonction.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENT, extracts, progress, shorten, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAINTS_DIR = join(ROOT, 'data', 'saints');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  out: join(SAINTS_DIR, 'biographies.json'),
  wikipedia: 'https://{lang}.wikipedia.org',
  wikidata: 'https://www.wikidata.org',
  pause: 300,
  limit: 0,
  search: true,
  dryRun: false,
};

/** Écrit par l'importateur, réécrit à chaque import : on n'y touche pas. */
const IMPORTED = 'wikidata.json';
const PATRONAGES = 'patronages.json';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

const HELP = `Donne une biographie aux fiches écrites à la main.

  --limit N        n'apparier que les N premières fiches
  --dry-run        apparier et compter, sans rien écrire
  --out FICHIER    autre destination que data/saints/biographies.json
  --no-search      s'en tenir au libellé exact, sans second passage
  --endpoint URL   autre service SPARQL
  --wikipedia URL  autre Wikipédia (« {lang} » est remplacé)
  --wikidata URL   autre Wikidata, pour la recherche par mots
  --pause MS       attente entre deux requêtes (défaut 300)
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i += 1];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--out') options.out = next();
    else if (arg === '--endpoint') options.endpoint = next();
    else if (arg === '--wikipedia') options.wikipedia = next();
    else if (arg === '--wikidata') options.wikidata = next();
    else if (arg === '--no-search') options.search = false;
    else if (arg === '--pause') options.pause = Number(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Requête
// ---------------------------------------------------------------------------

/** Une chaîne SPARQL : les guillemets et les contre-obliques se protègent. */
const literal = (text, lang) => `"${String(text).replace(/[\\"]/g, '\\$&')}"@${lang}`;

/**
 * Les saints qui portent l'un de ces noms.
 *
 * On entre par le libellé, qui est une chaîne littérale et donc le point
 * d'entrée le plus sélectif du graphe, puis on exige `P411` — le moteur ne
 * visite ainsi qu'une poignée d'éléments. Les libellés secondaires
 * (`skos:altLabel`) comptent aussi : Wikidata range « Jean Bosco » sous
 * « Don Bosco », et l'un ou l'autre doit suffire.
 */
const byName = (labels) => `
SELECT ?s ?feastEn ?born ?died ?wikiFr ?wikiEn ?nameFr ?nameEn WHERE {
  VALUES ?label { ${labels.join(' ')} }
  VALUES ?labelProp { rdfs:label skos:altLabel }
  ?s ?labelProp ?label ; wdt:P411 ?status .
  OPTIONAL { ?s wdt:P841 ?feast . ?feast rdfs:label ?feastEn . FILTER(LANG(?feastEn) = "en") }
  OPTIONAL { ?s wdt:P569 ?born }
  OPTIONAL { ?s wdt:P570 ?died }
  OPTIONAL { ?s rdfs:label ?nameFr . FILTER(LANG(?nameFr) = "fr") }
  OPTIONAL { ?s rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?artFr schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> ;
             schema:name ?wikiFr }
  OPTIONAL { ?artEn schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?wikiEn }
}
LIMIT 40`;

/**
 * Les mêmes faits, pour des identifiants déjà trouvés.
 *
 * Le second passage part de la recherche par mots, qui rend des identifiants
 * et non des libellés : on redemande ici ce qu'il faut pour les noter, avec la
 * même exigence de `P411`.
 */
const byIds = (qids) => `
SELECT ?s ?feastEn ?born ?died ?wikiFr ?wikiEn ?nameFr ?nameEn WHERE {
  VALUES ?s { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?s wdt:P411 ?status .
  OPTIONAL { ?s wdt:P841 ?feast . ?feast rdfs:label ?feastEn . FILTER(LANG(?feastEn) = "en") }
  OPTIONAL { ?s wdt:P569 ?born }
  OPTIONAL { ?s wdt:P570 ?died }
  OPTIONAL { ?s rdfs:label ?nameFr . FILTER(LANG(?nameFr) = "fr") }
  OPTIONAL { ?s rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?artFr schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> ;
             schema:name ?wikiFr }
  OPTIONAL { ?artEn schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?wikiEn }
}`;

/**
 * La recherche par mots de Wikidata, pour les noms qui ne tombent pas juste.
 *
 * Le corpus dit « Patrick », « Boniface », « Louis IX » ; Wikidata range ces
 * saints sous « Patrick d'Irlande », « Boniface de Mayence », « Louis IX de
 * France ». Le libellé exact ne les trouve donc pas, et ce sont des saints
 * majeurs. `wbsearchentities` accepte, lui, le nom approché.
 *
 * Ce second passage élargit ce que l'on va **regarder**, jamais ce que l'on
 * va **retenir** : les candidats trouvés repassent par la même notation, le
 * même seuil et la même règle du doute.
 */
async function search(name, lang, options) {
  const url = new URL(`${options.wikidata}/w/api.php`);
  for (const [key, value] of Object.entries({
    action: 'wbsearchentities',
    search: name,
    language: lang,
    uselang: lang,
    type: 'item',
    limit: '10',
    format: 'json',
    formatversion: '2',
  })) url.searchParams.set(key, value);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return (data.search || []).map((hit) => hit.id).filter((id) => /^Q\d+$/.test(id));
  } catch (error) {
    console.warn(`\n  recherche « ${name} » : ${error.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const idOf = (uri) => String(uri || '').replace(/^.*\/entity\//, '');

function yearOf(value) {
  const match = /^([+-]?)(\d{4,})-/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[2]);
  if (!year) return null;
  return match[1] === '-' ? -year : year;
}

function feastOf(text) {
  const lower = String(text || '').toLowerCase();
  const month = MONTHS.findIndex((name) => lower.includes(name));
  const day = /(\d{1,2})/.exec(lower);
  if (month < 0 || !day) return '';
  const n = Number(day[1]);
  if (n < 1 || n > 31) return '';
  return `${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

/** Les fiches écrites à la main qui n'ont pas encore de biographie. */
function handwritten() {
  const list = [];
  for (const file of readdirSync(SAINTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== IMPORTED && f !== PATRONAGES).sort()) {
    const raw = JSON.parse(readFileSync(join(SAINTS_DIR, file), 'utf8'));
    for (const saint of raw.saints || []) if (!saint.bio) list.push(saint);
  }
  return list;
}

// ---------------------------------------------------------------------------
// Appariement
// ---------------------------------------------------------------------------

/**
 * Note un candidat pour une fiche : plus c'est haut, plus c'est le même homme.
 *
 * La fête vaut trois points parce qu'elle est la marque propre du saint : deux
 * hommes du même nom fêtés le même jour, c'est le même. Une année à cinq ans
 * près en vaut deux — le corpus donne souvent des dates traditionnelles, et
 * Wikidata des dates établies, l'écart est normal. Le nom exact ne vaut qu'un
 * point : il est ce qui a amené le candidat, il ne peut pas le confirmer.
 */
function score(saint, candidate) {
  let points = 0;
  if (saint.feast && candidate.feast && saint.feast === candidate.feast) points += 3;
  const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 5;
  if (near(saint.died, candidate.died)) points += 2;
  if (near(saint.born, candidate.born)) points += 2;
  if (candidate.nameFr && candidate.nameFr === saint.name.fr) points += 1;
  if (candidate.nameEn && candidate.nameEn === saint.name.en) points += 1;
  return points;
}

/** Une fête concordante, ou une année : le nom seul n'ouvre pas la porte. */
const ENOUGH = 3;

/** « Boniface de Mayence » -> ['boniface', 'mayence'] : accents et casse ôtés. */
const words = (text) => String(text || '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

/**
 * Le candidat porte-t-il bien le nom du saint ?
 *
 * La recherche par mots est indulgente : « Casimir » lui ramène aussi des
 * Casimir qui n'en sont pas. On exige donc qu'un mot substantiel du nom se
 * retrouve dans le libellé — « Boniface » dans « Boniface de Mayence ». Ce
 * n'est pas une preuve, c'est un plancher : la note, elle, réclame toujours
 * une fête ou des années.
 */
function samePerson(saint, candidate) {
  const mine = new Set([...words(saint.name.fr), ...words(saint.name.en)]);
  if (!mine.size) return true;
  const theirs = [...words(candidate.nameFr), ...words(candidate.nameEn)];
  return theirs.some((word) => mine.has(word));
}

function best(saint, rows) {
  const byQid = new Map();
  for (const row of rows) {
    const qid = idOf(row.s?.value);
    if (!qid) continue;
    const found = byQid.get(qid) || { qid };
    // Une même personne revient sur plusieurs lignes — un libellé par ligne :
    // on garde la première valeur non vide de chaque champ.
    found.feast = found.feast || feastOf(row.feastEn?.value);
    found.born = found.born ?? yearOf(row.born?.value);
    found.died = found.died ?? yearOf(row.died?.value);
    found.nameFr = found.nameFr || row.nameFr?.value || '';
    found.nameEn = found.nameEn || row.nameEn?.value || '';
    found.wikiFr = found.wikiFr || row.wikiFr?.value || '';
    found.wikiEn = found.wikiEn || row.wikiEn?.value || '';
    byQid.set(qid, found);
  }

  const ranked = [...byQid.values()]
    .filter((candidate) => samePerson(saint, candidate))
    .map((candidate) => ({ ...candidate, points: score(saint, candidate) }))
    .filter((candidate) => candidate.points >= ENOUGH)
    .sort((a, b) => b.points - a.points);

  if (!ranked.length) return { kind: 'aucun' };
  // Deux candidats aussi convaincants l'un que l'autre : c'est un doute, non
  // un choix. On préfère la fiche sans récit à la fiche avec le mauvais.
  if (ranked.length > 1 && ranked[0].points === ranked[1].points) {
    return { kind: 'ambigu', a: ranked[0].qid, b: ranked[1].qid };
  }
  return { kind: 'trouvé', candidate: ranked[0] };
}

// ---------------------------------------------------------------------------
// Marche
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  let saints = handwritten();
  if (options.limit) saints = saints.slice(0, options.limit);
  console.log(`${saints.length} fiches écrites à la main sans biographie.\n`);

  const matched = [];
  const dropped = { aucun: 0, ambigu: 0, panne: 0 };
  const doubts = [];
  /** Les fiches que le libellé exact n'a pas trouvées : à repasser par mots. */
  const retry = [];

  for (const [i, saint] of saints.entries()) {
    const labels = [
      literal(saint.name.fr, 'fr'),
      saint.name.en && saint.name.en !== saint.name.fr ? literal(saint.name.en, 'en') : '',
    ].filter(Boolean);

    let rows;
    try {
      rows = await sparql(options.endpoint, byName(labels), options);
    } catch (error) {
      // Une fiche perdue ne doit pas emporter les deux cent quatre-vingt-quatre
      // autres : on compte la panne et l'on continue.
      console.warn(`\n  ${saint.id} : ${error.message}`);
      dropped.panne += 1;
      await sleep(options.pause);
      continue;
    }

    const verdict = best(saint, rows);
    if (verdict.kind === 'trouvé') matched.push({ saint, ...verdict.candidate });
    else if (verdict.kind === 'aucun') retry.push(saint);
    else {
      dropped[verdict.kind] += 1;
      doubts.push(`${saint.id} : ${verdict.a} ou ${verdict.b}`);
    }
    progress(`  appariement : ${matched.length}/${i + 1}`, { done: i + 1 === saints.length });
    await sleep(options.pause);
  }

  // Second passage, par mots : le corpus dit « Patrick », Wikidata range le
  // saint sous « Patrick d'Irlande ». Le libellé exact ne les rapproche pas,
  // la recherche par mots si — et la notation reste la même.
  if (options.search && retry.length) {
    console.log(`\n${retry.length} fiches sans candidat : second passage par mots.`);
    for (const [i, saint] of retry.entries()) {
      const qids = new Set();
      for (const [name, lang] of [[saint.name.fr, 'fr'], [saint.name.en, 'en']]) {
        if (!name) continue;
        for (const qid of await search(name, lang, options)) qids.add(qid);
        await sleep(options.pause);
      }

      let verdict = { kind: 'aucun' };
      if (qids.size) {
        try {
          verdict = best(saint, await sparql(options.endpoint, byIds([...qids]), options));
        } catch (error) {
          console.warn(`\n  ${saint.id} : ${error.message}`);
          dropped.panne += 1;
        }
      }
      if (verdict.kind === 'trouvé') matched.push({ saint, ...verdict.candidate });
      else if (verdict.kind === 'ambigu') {
        dropped.ambigu += 1;
        doubts.push(`${saint.id} : ${verdict.a} ou ${verdict.b}`);
      } else dropped.aucun += 1;
      progress(`  second passage : ${i + 1}/${retry.length}`, { done: i + 1 === retry.length });
      await sleep(options.pause);
    }
  } else dropped.aucun += retry.length;

  // Les introductions se demandent par vingt, une fois tous les appariements
  // faits : vingt titres en un appel valent mieux que vingt appels.
  const bios = {};
  for (const lang of ['fr', 'en']) {
    const key = lang === 'fr' ? 'wikiFr' : 'wikiEn';
    const titles = [...new Set(matched.map((m) => m[key]).filter(Boolean))];
    if (titles.length) bios[lang] = await extracts(lang, titles, options);
  }

  const out = {};
  let sansArticle = 0;
  for (const m of matched) {
    const bio = {};
    const sources = [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${m.qid}` }];
    for (const [lang, key, label] of [['fr', 'wikiFr', 'Wikipédia (fr)'], ['en', 'wikiEn', 'Wikipédia (en)']]) {
      const text = m[key] && bios[lang]?.get(m[key]);
      if (!text) continue;
      const petite = shorten(text);
      if (!petite) continue;
      bio[lang] = petite;
      const base = options.wikipedia.replace('{lang}', lang);
      sources.push({ label, url: `${base}/wiki/${encodeURIComponent(m[key].replace(/ /g, '_'))}` });
    }
    // Apparié mais sans article lisible : rien à joindre, et l'on ne va pas
    // inscrire une source pour une biographie qui n'existe pas.
    if (!bio.fr && !bio.en) { sansArticle += 1; continue; }
    out[m.saint.id] = { bio, sources };
  }

  console.log(`\n${Object.keys(out).length} fiches reçoivent une biographie.`);
  console.log('Sans suite :');
  console.log(`  aucun candidat      ${dropped.aucun}`);
  console.log(`  appariement douteux ${dropped.ambigu}`);
  console.log(`  sans article        ${sansArticle}`);
  if (dropped.panne) console.log(`  service en panne    ${dropped.panne}`);
  for (const doubt of doubts.slice(0, 10)) console.log(`    doute : ${doubt}`);

  if (options.dryRun) {
    console.log('\n--dry-run : rien n’a été écrit.');
    return;
  }

  const body = [
    '{',
    '"source": "Wikidata et Wikipédia — appariement automatique",',
    '"note": "Biographies rapportées pour les fiches écrites à la main, par'
    + ' tools/enrich-bios.mjs. Le texte vient de l\'introduction de l\'article'
    + ' de Wikipédia (CC BY-SA) : l\'adresse de l\'article est jointe, et'
    + ' l\'attribution voyage avec le texte. Ne pas modifier à la main — le'
    + ' fichier est réécrit à chaque passage ; une biographie écrite à la main'
    + ' se met dans la fiche elle-même, où elle a priorité.",',
    '"biographies": {',
    Object.entries(out).map(([id, value]) => `${JSON.stringify(id)}: ${JSON.stringify(value)}`).join(',\n'),
    '}',
    '}',
    '',
  ].join('\n');
  writeFileSync(options.out, body);
  console.log(`\nÉcrit dans ${options.out}`);
  console.log('Enchaînez avec :  npm run build:data && npm run check');
}

main().catch((error) => {
  console.error(`\nÉchec de l'enrichissement : ${error.message}`);
  process.exit(1);
});
