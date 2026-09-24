/**
 * Importe les apparitions depuis Wikidata, comme les saints avant elles.
 *
 *   node tools/import-apparitions.mjs                 # tout ce qui est plaçable
 *   node tools/import-apparitions.mjs --dry-run       # compter sans rien écrire
 *   node tools/import-apparitions.mjs --classes Q123  # forcer les classes
 *
 * ## Trouver la classe plutôt que la recopier de mémoire
 *
 * Un importateur qui porte un identifiant Wikidata écrit à la main — « les
 * instances de Q1132689 » — est un importateur qui se trompera un jour sans le
 * dire : le numéro est invérifiable à la lecture, et une erreur d'un chiffre
 * rend une collecte vide ou, pire, une collecte d'autre chose.
 *
 * Celui-ci **cherche** la classe : il demande au moteur de recherche de
 * Wikidata les éléments nommés « Marian apparition », « apparition of the
 * Virgin Mary »…, puis ne garde que ceux qui ont des instances — une classe en
 * a, une apparition particulière n'en a pas. Les classes retenues sont
 * annoncées dans le journal, avec leur nombre d'instances : la collecte se
 * relit.
 *
 * ## Ce qui entre, et ce qui n'entre pas
 *
 * N'entre que ce qui est plaçable : des coordonnées — celles de l'événement ou
 * celles de son lieu —, un pays que la carte connaît, un point qui tombe
 * vraiment dans ce pays, une localité nommée, une année. Le reste est compté et
 * annoncé, non deviné.
 *
 * ## Ce qu'il ne dit pas
 *
 * L'approbation de l'Église. Wikidata ne la porte pas de façon fiable, et une
 * carte qui déclarerait « reconnue » une apparition que l'Église n'a pas
 * reconnue dirait un faux sur un sujet où le faux coûte cher. L'outil ne pose
 * donc ce mot que lorsque la notice ou le récit l'écrit en toutes lettres ; le
 * reste est laissé vide, et `data/apparitions/approbations.json` — écrit à la
 * main, relu par `build-data` — tranche pour celles que l'Église a nommées.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fold } from '../src/js/data.js';
import { AGENT, extracts, progress, shorten, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  api: 'https://www.wikidata.org/w/api.php',
  wikipedia: 'https://{lang}.wikipedia.org',
  out: join(ROOT, 'data', 'apparitions', 'wikidata.json'),
  classes: [],
  chunk: 100,
  pause: 300,
  bios: true,
  dryRun: false,
};

/** Ce que l'on cherche : les classes, non les apparitions elles-mêmes. */
const MOTS = [
  'Marian apparition',
  'apparition of the Virgin Mary',
  'Marian apparitions',
  'apparition of Jesus',
];

/**
 * Une classe a des instances ; une apparition particulière n'en a pas.
 *
 * Le plancher écarte les élément homonymes — l'article, le livre, le film
 * « Marian apparition » —, le plafond écarte une classe trop générale qu'une
 * recherche approximative ramènerait : « événement » a des millions
 * d'instances, et l'on ne veut pas de la moitié de Wikidata sur la carte.
 */
const PLANCHER = 3;
const PLAFOND = 5000;

const HELP = `Importe les apparitions depuis Wikidata.

  --classes Q1,Q2  forcer les classes au lieu de les chercher
  --out FICHIER    fichier de sortie (défaut : data/apparitions/wikidata.json)
  --endpoint URL   point d'entrée SPARQL
  --api URL        API de Wikidata, pour la recherche des classes
  --wikipedia URL  adresse de Wikipédia, « {lang} » valant la langue
  --chunk N        taille des lots d'identifiants (défaut : 100)
  --pause MS       attente entre deux requêtes (défaut : 300)
  --no-bios        ne pas aller chercher les récits sur Wikipédia
  --dry-run        compter sans écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i += 1];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-bios') options.bios = false;
    else if (arg === '--classes') options.classes = String(next()).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--out') options.out = next();
    else if (arg === '--endpoint') options.endpoint = next();
    else if (arg === '--api') options.api = next();
    else if (arg === '--wikipedia') options.wikipedia = next();
    else if (arg === '--chunk') options.chunk = Number(next()) || DEFAULTS.chunk;
    else if (arg === '--pause') options.pause = Number(next()) || DEFAULTS.pause;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

const idOf = (uri) => String(uri || '').replace(/^.*\/entity\//, '');

/** Les faits, pour les instances des classes retenues. */
const faits = (classes) => `
SELECT ?a ?coord ?iso ?debut ?fin ?nameFr ?nameEn ?descFr ?descEn
       ?villeFr ?villeEn ?lieuFr ?lieuEn ?feastEn WHERE {
  VALUES ?classe { ${classes.map((q) => `wd:${q}`).join(' ')} }
  ?a wdt:P31/wdt:P279* ?classe .

  # Les coordonnées de l'événement, ou à défaut celles du lieu où il se place :
  # Wikidata porte tantôt l'une, tantôt l'autre, et rarement les deux.
  OPTIONAL { ?a wdt:P625 ?coordA }
  OPTIONAL { ?a wdt:P276 ?lieu . OPTIONAL { ?lieu wdt:P625 ?coordL } }
  BIND(COALESCE(?coordA, ?coordL) AS ?coord)

  OPTIONAL { ?a wdt:P17 ?paysA . ?paysA wdt:P298 ?isoA }
  OPTIONAL { ?lieu wdt:P17 ?paysL . ?paysL wdt:P298 ?isoL }
  BIND(COALESCE(?isoA, ?isoL) AS ?iso)

  # L'année : le moment, le début, ou la date de création de l'élément
  # d'événement — dans cet ordre, du plus précis au plus vague.
  OPTIONAL { ?a wdt:P585 ?quand }
  OPTIONAL { ?a wdt:P580 ?ouvre }
  OPTIONAL { ?a wdt:P571 ?fonde }
  BIND(COALESCE(?quand, ?ouvre, ?fonde) AS ?debut)
  OPTIONAL { ?a wdt:P582 ?fin }

  # La localité : la commune administrative d'abord, le lieu-dit ensuite. Une
  # grotte nommée « Massabielle » ne situe personne ; « Lourdes », si.
  OPTIONAL { ?a wdt:P131 ?ville }
  OPTIONAL { ?lieu wdt:P131 ?villeL }
  OPTIONAL { ?ville rdfs:label ?villeFr . FILTER(LANG(?villeFr) = "fr") }
  OPTIONAL { ?ville rdfs:label ?villeEn . FILTER(LANG(?villeEn) = "en") }
  OPTIONAL { ?lieu rdfs:label ?lieuFr . FILTER(LANG(?lieuFr) = "fr") }
  OPTIONAL { ?lieu rdfs:label ?lieuEn . FILTER(LANG(?lieuEn) = "en") }

  OPTIONAL { ?a wdt:P841 ?feast . ?feast rdfs:label ?feastEn . FILTER(LANG(?feastEn) = "en") }

  OPTIONAL { ?a rdfs:label ?nameFr . FILTER(LANG(?nameFr) = "fr") }
  OPTIONAL { ?a rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?a schema:description ?descFr . FILTER(LANG(?descFr) = "fr") }
  OPTIONAL { ?a schema:description ?descEn . FILTER(LANG(?descEn) = "en") }
}`;

/** La commune, quand elle n'est portée que par le lieu et non par l'événement. */
const communes = (ids) => `
SELECT ?a ?villeFr ?villeEn WHERE {
  VALUES ?a { ${ids.map((q) => `wd:${q}`).join(' ')} }
  ?a wdt:P276 ?lieu . ?lieu wdt:P131 ?ville .
  OPTIONAL { ?ville rdfs:label ?villeFr . FILTER(LANG(?villeFr) = "fr") }
  OPTIONAL { ?ville rdfs:label ?villeEn . FILTER(LANG(?villeEn) = "en") }
}`;

/** Les titres d'article, d'où l'on tirera le récit. */
const articlesFor = (ids) => `
SELECT ?a ?wikiFr ?wikiEn WHERE {
  VALUES ?a { ${ids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?artFr schema:about ?a ; schema:isPartOf <https://fr.wikipedia.org/> ;
             schema:name ?wikiFr }
  OPTIONAL { ?artEn schema:about ?a ; schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?wikiEn }
}`;

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** « Point(3.0035 43.1841) » -> [longitude, latitude]. */
function pointOf(wkt) {
  const match = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(String(wkt || ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/** Année d'un instant, signe compris. */
function yearOf(value) {
  const match = /^([+-]?)(\d{4,})-/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[2]);
  if (!year) return null;
  return match[1] === '-' ? -year : year;
}

const MOIS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/** « 11 February » ou « February 11 » -> « 02-11 ». */
function feastOf(text) {
  const lower = String(text || '').toLowerCase();
  const mois = MOIS.findIndex((nom) => lower.includes(nom));
  const jour = /(\d{1,2})/.exec(lower);
  if (mois < 0 || !jour) return '';
  const n = Number(jour[1]);
  if (n < 1 || n > 31) return '';
  return `${String(mois + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

/** Identifiant lisible tiré du nom, suffixé de l'identifiant Wikidata. */
function slug(name, qid) {
  const base = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  return `ap-${base || 'apparition'}-${qid.toLowerCase()}`;
}

/**
 * L'approbation, seulement lorsqu'elle est écrite en toutes lettres.
 *
 * Rien ici ne se déduit ni ne se devine : « reconnue par l'Église » se lit, ou
 * ne se lit pas. Une apparition dont on ignore le sort reste sans mot — c'est la
 * seule chose vraie qu'on puisse en écrire, et la fiche omet alors la ligne.
 */
const APPROBATIONS = [
  ['non-reconnue', /non\s+reconnue|jamais\s+reconnue|non\s+approuv|not\s+(?:officially\s+)?(?:approved|recognized|recognised)|condamn|declared\s+(?:false|not\s+supernatural)/i],
  ['en-cours', /en\s+cours\s+d[e’']\s*(?:examen|enqu[êe]te)|[àa]\s+l[e’']\s*examen|under\s+(?:investigation|examination)|not\s+yet\s+(?:approved|recognized)/i],
  ['reconnue', /reconnue?\s+par\s+(?:l[e’']\s*)?(?:[ÉE]glise|Saint-Si[èe]ge|[ée]v[êe]que|dioc[èe]se)|approuv[ée]e?\s+par\s+(?:l[e’']\s*)?(?:[ÉE]glise|Saint-Si[èe]ge|[ée]v[êe]que)|approved\s+by\s+the\s+(?:Church|Holy\s+See|bishop|diocese)|officially\s+(?:approved|recognized|recognised)\s+by\s+the\s+(?:Catholic\s+)?Church/i],
];

function approbationDe(texte) {
  const clean = String(texte || '');
  if (!clean) return null;
  for (const [nom, motif] of APPROBATIONS) if (motif.test(clean)) return nom;
  return null;
}

/** Le point tombe-t-il dans le cadre du pays annoncé, à 8 % près ? */
function insideBox(country, lng, lat, worldSize) {
  const x = ((lng + 180) / 360) * worldSize;
  const rad = (lat * Math.PI) / 180;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI)) * worldSize;
  const box = country.bbox;
  const shifted = country.focus[0] > worldSize ? x + worldSize : x;
  const w = (box[2] - box[0]) * 0.08;
  const h = (box[3] - box[1]) * 0.08;
  return shifted >= box[0] - w && shifted <= box[2] + w && y >= box[1] - h && y <= box[3] + h;
}

// ---------------------------------------------------------------------------
// Les classes, cherchées et non recopiées
// ---------------------------------------------------------------------------

async function chercherClasses(options) {
  if (options.classes.length) {
    console.log(`Classes imposées : ${options.classes.join(', ')}`);
    return options.classes;
  }

  const candidats = new Map();
  for (const mot of MOTS) {
    const url = new URL(options.api);
    for (const [cle, valeur] of Object.entries({
      action: 'wbsearchentities',
      search: mot,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '10',
      format: 'json',
    })) url.searchParams.set(cle, valeur);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      for (const r of data.search || []) {
        if (!candidats.has(r.id)) candidats.set(r.id, `${r.label}${r.description ? ` — ${r.description}` : ''}`);
      }
    } catch (error) {
      console.warn(`  recherche « ${mot} » : ${error.message}`);
    }
    await sleep(options.pause);
  }
  console.log(`${candidats.size} candidats de classe à vérifier.`);

  const gardes = [];
  for (const [qid, label] of candidats) {
    let n = 0;
    try {
      // Le compte est **borné**. Une recherche approximative ramène parfois une
      // classe énorme — « événement », « lieu de culte » —, et compter ses
      // instances une à une passe la minute que le service public accorde : la
      // requête se perd, on la reprend trois fois, et la découverte des classes
      // coûte alors plus cher que la collecte elle-même. Au-delà du plafond, le
      // nombre exact n'apprend plus rien puisque la classe est écartée : on
      // s'arrête donc à une unité de plus.
      const rows = await sparql(options.endpoint,
        `SELECT (COUNT(*) AS ?n) WHERE {
           SELECT DISTINCT ?i WHERE { ?i wdt:P31/wdt:P279* wd:${qid} } LIMIT ${PLAFOND + 1}
         }`, options);
      n = Number(rows[0]?.n?.value || 0);
    } catch (error) {
      // Une classe qui ne répond pas est une classe qu'on n'ajoute pas : mieux
      // vaut une collecte plus étroite qu'une collecte qui n'aboutit jamais.
      console.warn(`  ${qid} : ${error.message}`);
    }
    const garde = n >= PLANCHER && n <= PLAFOND;
    console.log(`  ${garde ? '✓' : '·'} ${qid} ${String(n).padStart(5)} instances — ${label}`);
    if (garde) gardes.push(qid);
    await sleep(options.pause);
  }
  return gardes;
}

// ---------------------------------------------------------------------------
// Marche
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const world = JSON.parse(readFileSync(join(ROOT, 'data', 'generated', 'world.json'), 'utf8'));
  const pays = new Map(world.countries.map((c) => [c.id, c]));

  const classes = await chercherClasses(options);
  if (!classes.length) throw new Error('aucune classe d’apparition trouvée : rien à importer');
  console.log(`\nClasses retenues : ${classes.join(', ')}`);

  const rows = await sparql(options.endpoint, faits(classes), options);
  console.log(`${rows.length} lignes de faits.`);

  // Une ligne par combinaison de valeurs facultatives : on rassemble par
  // élément, en gardant la première valeur non vide de chaque champ.
  const parQid = new Map();
  const premier = (a, b) => (a || b || '');
  for (const row of rows) {
    const qid = idOf(row.a?.value);
    if (!qid) continue;
    const vue = parQid.get(qid) || { qid };
    for (const champ of ['coord', 'iso', 'debut', 'fin', 'nameFr', 'nameEn', 'descFr',
      'descEn', 'villeFr', 'villeEn', 'lieuFr', 'lieuEn', 'feastEn']) {
      vue[champ] = premier(vue[champ], row[champ]?.value);
    }
    parQid.set(qid, vue);
  }
  console.log(`${parQid.size} apparitions distinctes.`);

  // La commune manque parfois à l'événement comme au lieu-dit : on la redemande
  // en passant par le lieu, pour ceux-là seulement.
  const sansVille = [...parQid.values()].filter((v) => !v.villeFr && !v.villeEn).map((v) => v.qid);
  for (let i = 0; i < sansVille.length; i += options.chunk) {
    const lot = sansVille.slice(i, i + options.chunk);
    try {
      for (const row of await sparql(options.endpoint, communes(lot), options)) {
        const vue = parQid.get(idOf(row.a?.value));
        if (!vue) continue;
        vue.villeFr = premier(vue.villeFr, row.villeFr?.value);
        vue.villeEn = premier(vue.villeEn, row.villeEn?.value);
      }
    } catch (error) {
      console.warn(`  communes : ${error.message}`);
    }
    await sleep(options.pause);
  }

  // Les récits, comme pour les saints : le titre de l'article, puis son
  // introduction, réduite à trois phrases.
  const articles = new Map();
  const bios = { fr: new Map(), en: new Map() };
  if (options.bios) {
    const tous = [...parQid.keys()];
    for (let i = 0; i < tous.length; i += options.chunk) {
      const lot = tous.slice(i, i + options.chunk);
      try {
        for (const row of await sparql(options.endpoint, articlesFor(lot), options)) {
          const qid = idOf(row.a?.value);
          const entree = articles.get(qid) || {};
          if (row.wikiFr?.value) entree.fr = row.wikiFr.value;
          if (row.wikiEn?.value) entree.en = row.wikiEn.value;
          articles.set(qid, entree);
        }
      } catch (error) {
        console.warn(`  articles : ${error.message}`);
      }
      await sleep(options.pause);
      progress(`  articles : ${Math.min(i + options.chunk, tous.length)}/${tous.length}`,
        { done: i + options.chunk >= tous.length });
    }
    for (const lang of ['fr', 'en']) {
      const titres = [...new Set([...articles.values()].map((a) => a[lang]).filter(Boolean))];
      if (titres.length) {
        bios[lang] = await extracts(lang, titres, { ...options, label: 'récits' });
      }
    }
  }

  // ---- Le tri -------------------------------------------------------------

  const ecartes = { coord: 0, pays: 0, cadre: 0, ville: 0, annee: 0, nom: 0, doublon: 0 };
  const pris = [];
  const vus = new Set();
  for (const vue of parQid.values()) {
    const nomFr = vue.nameFr || vue.nameEn;
    if (!nomFr) { ecartes.nom += 1; continue; }

    const point = pointOf(vue.coord);
    if (!point) { ecartes.coord += 1; continue; }
    const [lng, lat] = point;
    if (Math.abs(lat) > 85 || Math.abs(lng) > 180) { ecartes.coord += 1; continue; }

    const iso = vue.iso;
    const country = iso ? pays.get(iso) : null;
    if (!country) { ecartes.pays += 1; continue; }
    if (!insideBox(country, lng, lat, world.worldSize)) { ecartes.cadre += 1; continue; }

    const ville = vue.villeFr || vue.villeEn || vue.lieuFr || vue.lieuEn;
    if (!ville) { ecartes.ville += 1; continue; }

    const annee = yearOf(vue.debut);
    if (annee == null) { ecartes.annee += 1; continue; }
    const anneeFin = yearOf(vue.fin);

    const id = slug(nomFr, vue.qid);
    if (vus.has(id)) { ecartes.doublon += 1; continue; }
    vus.add(id);

    const fiche = {
      id,
      kind: 'apparition',
      name: {
        fr: nomFr,
        ...(vue.nameEn ? { en: vue.nameEn } : {}),
      },
      city: ville,
      country: iso,
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      annee,
      ...(anneeFin != null && anneeFin !== annee ? { anneeFin } : {}),
      source: 'wikidata',
      sources: [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${vue.qid}` }],
    };

    const feast = feastOf(vue.feastEn);
    if (feast) fiche.feast = feast;

    if (vue.descFr || vue.descEn) {
      fiche.desc = {};
      if (vue.descFr) fiche.desc.fr = vue.descFr;
      if (vue.descEn) fiche.desc.en = vue.descEn;
    }

    // Le récit vient de l'introduction de l'article, réduite. Le texte est sous
    // licence CC BY-SA : l'adresse de l'article rejoint donc les sources, ce
    // n'est pas facultatif.
    const article = articles.get(vue.qid) || {};
    const bio = {};
    for (const lang of ['fr', 'en']) {
      const titre = article[lang];
      const petit = titre ? shorten(bios[lang].get(titre)) : '';
      if (!petit) continue;
      bio[lang] = petit;
      fiche.sources.push({
        label: `Wikipédia (${lang})`,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(titre.replace(/ /g, '_'))}`,
      });
    }
    if (Object.keys(bio).length) fiche.bio = bio;

    // L'approbation, seulement si elle est écrite quelque part en toutes
    // lettres. `approbations.json` tranchera pour les autres.
    const approbation = approbationDe([vue.descFr, vue.descEn, bio.fr, bio.en]
      .filter(Boolean).join(' · '));
    if (approbation) fiche.approbation = approbation;

    pris.push(fiche);
  }

  pris.sort((a, b) => a.annee - b.annee || a.id.localeCompare(b.id));

  console.log(`\n${pris.length} apparitions retenues sur ${parQid.size}.`);
  console.log('Écartées :');
  for (const [raison, n] of Object.entries(ecartes)) {
    if (n) console.log(`  ${raison.padEnd(9)} ${n}`);
  }
  const parPays = new Map();
  for (const f of pris) parPays.set(f.country, (parPays.get(f.country) || 0) + 1);
  console.log(`Réparties sur ${parPays.size} pays : ${[...parPays]
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const avecRecit = pris.filter((f) => f.bio?.fr || f.bio?.en).length;
  const avecFete = pris.filter((f) => f.feast).length;
  console.log(`${avecRecit} avec un récit, ${avecFete} avec un jour de fête, `
    + `${pris.filter((f) => f.approbation).length} avec une approbation lue dans le texte.`);

  if (options.dryRun) { console.log('\n--dry-run : rien n’a été écrit.'); return; }

  writeFileSync(options.out, `${JSON.stringify({
    source: 'Wikidata (CC0) et Wikipédia (CC BY-SA), articles cités fiche par fiche',
    note: 'Écrit par tools/import-apparitions.mjs. Ne pas modifier à la main : le'
      + ' fichier est réécrit d’un bloc. Ce qui s’ajoute à la main va dans'
      + ' apparitions.json, ce qui corrige l’approbation dans approbations.json.',
    apparitions: pris,
  }, null, 1)}\n`, 'utf8');
  console.log(`\nÉcrit ${options.out}`);
}

await main();
