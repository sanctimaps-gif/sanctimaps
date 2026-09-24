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
import { unproject } from '../src/js/map/projection.js';
import { AGENT, extracts, progress, shorten, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  api: 'https://www.wikidata.org/w/api.php',
  wikipedia: 'https://{lang}.wikipedia.org',
  out: join(ROOT, 'data', 'apparitions', 'wikidata.json'),
  classes: [],
  chunk: 40,
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
  --chunk N        taille des lots d'identifiants (défaut : 40)
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

/**
 * La liste des apparitions, et rien d'autre.
 *
 * Demander les faits en même temps que le chemin de classe — `P31/P279*` suivi
 * de quinze OPTIONAL — a dépassé les soixante secondes du service public, trois
 * fois de suite. C'est la leçon déjà apprise sur les saints : un chemin de
 * propriété coûte cher, et chaque OPTIONAL le multiplie. On demande donc
 * d'abord les identifiants, qui ne coûtent rien, puis les faits par lots
 * d'identifiants — où le moteur part d'un ensemble déjà réduit.
 */
const instances = (classes) => `
SELECT DISTINCT ?a WHERE {
  VALUES ?classe { ${classes.map((q) => `wd:${q}`).join(' ')} }
  ?a wdt:P31/wdt:P279* ?classe .
}`;

/**
 * Les faits, un par requête.
 *
 * La requête unique — quarante identifiants, quinze OPTIONAL, trois COALESCE —
 * a dépassé les soixante secondes du service public, trois fois de suite. Un
 * OPTIONAL ne coûte pas cher tout seul ; quinze en cascade se multiplient, et
 * le moteur renonce.
 *
 * Chacun de ces morceaux ne demande donc **qu'un seul fait**, sans un seul
 * OPTIONAL : l'élément qui ne le porte pas ne rend simplement pas de ligne.
 * C'est plus de requêtes, chacune courte et lisible, et l'on sait laquelle
 * manque quand il en manque une. Le recollement — les coordonnées de
 * l'événement ou à défaut celles du lieu, la commune avant le lieu-dit — se
 * fait ici, en JavaScript, où il se relit.
 */
const MORCEAUX = [
  ['coord', '?a wdt:P625 ?v .'],
  ['coordL', '?a wdt:P276 ?l . ?l wdt:P625 ?v .'],
  ['iso', '?a wdt:P17 ?p . ?p wdt:P298 ?v .'],
  ['isoL', '?a wdt:P276 ?l . ?l wdt:P17 ?p . ?p wdt:P298 ?v .'],
  // L'année : le moment, le début, ou la date de création de l'élément —
  // dans cet ordre, du plus précis au plus vague.
  ['quand', '?a wdt:P585 ?v .'],
  ['ouvre', '?a wdt:P580 ?v .'],
  ['fonde', '?a wdt:P571 ?v .'],
  ['fin', '?a wdt:P582 ?v .'],
  ['nameFr', '?a rdfs:label ?v . FILTER(LANG(?v) = "fr")'],
  ['nameEn', '?a rdfs:label ?v . FILTER(LANG(?v) = "en")'],
  ['descFr', '?a schema:description ?v . FILTER(LANG(?v) = "fr")'],
  ['descEn', '?a schema:description ?v . FILTER(LANG(?v) = "en")'],
  // La localité : la commune administrative d'abord — celle de l'événement,
  // puis celle du lieu —, le lieu-dit ensuite. Une grotte nommée
  // « Massabielle » ne situe personne ; « Lourdes », si.
  ['villeFr', '?a wdt:P131 ?c . ?c rdfs:label ?v . FILTER(LANG(?v) = "fr")'],
  ['villeEn', '?a wdt:P131 ?c . ?c rdfs:label ?v . FILTER(LANG(?v) = "en")'],
  ['villeLFr', '?a wdt:P276 ?l . ?l wdt:P131 ?c . ?c rdfs:label ?v . FILTER(LANG(?v) = "fr")'],
  ['villeLEn', '?a wdt:P276 ?l . ?l wdt:P131 ?c . ?c rdfs:label ?v . FILTER(LANG(?v) = "en")'],
  ['lieuFr', '?a wdt:P276 ?l . ?l rdfs:label ?v . FILTER(LANG(?v) = "fr")'],
  ['lieuEn', '?a wdt:P276 ?l . ?l rdfs:label ?v . FILTER(LANG(?v) = "en")'],
  ['feastEn', '?a wdt:P841 ?f . ?f rdfs:label ?v . FILTER(LANG(?v) = "en")'],
];

const morceau = (ids, corps) => `
SELECT ?a ?v WHERE {
  VALUES ?a { ${ids.map((q) => `wd:${q}`).join(' ')} }
  ${corps}
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

/**
 * Une division administrative n'est pas une localité.
 *
 * `P131` remonte la hiérarchie des territoires, et Wikidata s'y arrête où elle
 * veut : Lourdes pour les apparitions de Lourdes, mais « le Japon » pour celles
 * d'Akita, « la province de Prusse » pour Gietrzwałd, « la Mayenne » pour
 * Pontmain. Sur une fiche, « Lieu : Japon » ne situe personne.
 *
 * Ces libellés-là se reconnaissent : ils commencent par le mot de la division.
 * Quand le premier candidat en est un, on descend au suivant — le nom du lieu
 * lui-même, qui est une grotte, une chapelle ou un hameau, mais qui situe.
 */
const DIVISION = new RegExp(
  '^(?:la |le |les |l[\'’])?(?:province|provincia|région|region|regione|district|comt[ée]|county'
  + '|municip|d[ée]partement|departamento|governorate|pr[ée]fecture|canton|vo[ïi]vodie|oblast'
  + '|arrondissement|secteur|sector|commune de|state of|[ée]tat d)'
  // Et la même chose en suffixe : « Akita Prefecture », « Mayo County ».
  + '|\\b(?:prefecture|province|county|district|region|oblast|voivodeship|state)$', 'i');

/**
 * Le nom de la localité, tranché par les localités que la carte connaît déjà.
 *
 * Les libellés en division se reconnaissent souvent à leur premier mot, mais
 * pas toujours : « le Var », « l'Isère », « la Tarraconaise », « São Paulo »
 * sont des départements, une province romaine et un État, et rien dans leur nom
 * ne le dit. Ce qui les distingue, c'est qu'aucune localité de ce nom ne se
 * trouve près du point : le Var n'est pas une ville à trois kilomètres de la
 * chapelle, São Paulo est à quatre-vingt-dix de Campinas.
 *
 * On préfère donc le candidat qui **est une localité connue près du point**,
 * puis, à défaut, celui qui n'a pas l'air d'une division, puis le premier venu.
 * Les cent treize mille localités sont déjà là, dans `data/generated/cities` :
 * il n'y a rien à demander à personne.
 */
function localite(vue, { nomsDuPays = [], villes = [], lng, lat } = {}) {
  const candidats = [vue.villeLFr, vue.villeFr, vue.lieuFr, vue.villeLEn, vue.villeEn, vue.lieuEn]
    .map((v) => String(v || '').trim()).filter(Boolean);
  const pays = new Set(nomsDuPays.map((n) => fold(n)));
  const recevable = (c) => !pays.has(fold(c)) && !/^\d+(?:er|e|ème)\b/i.test(c);

  const proche = (nom) => villes.some((v) => v.nom === fold(nom)
    && Math.hypot((v.lat - lat) * 111, (v.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180)) <= 30);

  return candidats.find((c) => recevable(c) && proche(c))
    || candidats.find((c) => recevable(c) && !DIVISION.test(c))
    || candidats.find(recevable)
    || '';
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
  // Les noms de pays, pour ne pas écrire « Lieu : Japon » sur la fiche d'une
  // apparition japonaise : c'est le pays, il est déjà dit à la ligne d'après.
  const nomsPays = JSON.parse(readFileSync(join(ROOT, 'data', 'generated', 'country-names.json'), 'utf8'));

  // Les localités d'un pays, lues une fois et gardées : c'est ce qui permet de
  // dire qu'« Isère » n'est pas une ville et que « Knock » en est une.
  const cacheVilles = new Map();
  const localitesDe = (iso) => {
    if (!cacheVilles.has(iso)) {
      let liste = [];
      try {
        liste = JSON.parse(readFileSync(join(ROOT, 'data', 'generated', 'cities', `${iso}.json`), 'utf8'))
          .map((v) => {
            const [lng, lat] = unproject(v.x, v.y);
            return { nom: fold(v.n), lng, lat };
          });
      } catch { /* pays sans fichier de localités : on s'en passe */ }
      cacheVilles.set(iso, liste);
    }
    return cacheVilles.get(iso);
  };

  const classes = await chercherClasses(options);
  if (!classes.length) throw new Error('aucune classe d’apparition trouvée : rien à importer');
  console.log(`\nClasses retenues : ${classes.join(', ')}`);

  const tous = [...new Set((await sparql(options.endpoint, instances(classes), options))
    .map((row) => idOf(row.a?.value)).filter(Boolean))];
  console.log(`${tous.length} apparitions à interroger.`);

  // Chaque morceau est demandé à part, par lots d'identifiants. Un morceau qui
  // ne répond pas laisse un champ vide et n'emporte pas la collecte : mieux
  // vaut une fiche sans jour de fête qu'une heure de travail perdue.
  const parQid = new Map(tous.map((qid) => [qid, { qid }]));
  const premier = (a, b) => (a || b || '');
  for (const [champ, corps] of MORCEAUX) {
    let vues = 0;
    for (let i = 0; i < tous.length; i += options.chunk) {
      const lot = tous.slice(i, i + options.chunk);
      try {
        for (const row of await sparql(options.endpoint, morceau(lot, corps), options)) {
          const vue = parQid.get(idOf(row.a?.value));
          if (!vue) continue;
          vue[champ] = premier(vue[champ], row.v?.value);
          vues += 1;
        }
      } catch (error) {
        console.warn(`  ${champ} : ${error.message}`);
      }
      await sleep(options.pause);
    }
    console.log(`  ${champ.padEnd(9)} ${vues}`);
  }

  // Le recollement, ici plutôt que dans la requête : les coordonnées de
  // l'événement ou à défaut celles du lieu, la commune avant le lieu-dit,
  // le moment avant le début avant la fondation.
  for (const vue of parQid.values()) {
    vue.coord = premier(vue.coord, vue.coordL);
    vue.iso = premier(vue.iso, vue.isoL);
    vue.debut = premier(premier(vue.quand, vue.ouvre), vue.fonde);
    const point = pointOf(vue.coord);
    vue.ville = point
      ? localite(vue, {
        nomsDuPays: Object.values(nomsPays[vue.iso] || {}),
        villes: localitesDe(vue.iso),
        lng: point[0],
        lat: point[1],
      })
      : '';
  }
  console.log(`${parQid.size} apparitions distinctes.`);

  // Les récits, comme pour les saints : le titre de l'article, puis son
  // introduction, réduite à trois phrases.
  const articles = new Map();
  const bios = { fr: new Map(), en: new Map() };
  if (options.bios) {
    const avecArticle = [...parQid.keys()];
    for (let i = 0; i < avecArticle.length; i += options.chunk) {
      const lot = avecArticle.slice(i, i + options.chunk);
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
      progress(`  articles : ${Math.min(i + options.chunk, avecArticle.length)}/${avecArticle.length}`,
        { done: i + options.chunk >= avecArticle.length });
    }
    for (const lang of ['fr', 'en']) {
      const titres = [...new Set([...articles.values()].map((a) => a[lang]).filter(Boolean))];
      if (titres.length) {
        bios[lang] = await extracts(lang, titres, { ...options, label: 'récits' });
      }
    }
  }

  // ---- Le tri -------------------------------------------------------------

  // Ce qui est écarté l'est **nommément**. Un compte — « vingt-deux sans
  // coordonnées » — ne dit pas si l'on vient de perdre une apparition obscure
  // ou Lourdes : c'est en lisant les noms qu'on décide s'il faut écrire la
  // fiche à la main.
  const ecartes = { coord: 0, pays: 0, cadre: 0, ville: 0, annee: 0, nom: 0, doublon: 0 };
  const perdus = [];
  const pris = [];
  const vus = new Set();
  for (const vue of parQid.values()) {
    const nomFr = vue.nameFr || vue.nameEn;
    const ecarter = (raison) => {
      ecartes[raison] += 1;
      perdus.push({ raison, nom: nomFr || '(sans nom)', qid: vue.qid });
    };
    if (!nomFr) { ecarter('nom'); continue; }

    const point = pointOf(vue.coord);
    if (!point) { ecarter('coord'); continue; }
    const [lng, lat] = point;
    if (Math.abs(lat) > 85 || Math.abs(lng) > 180) { ecarter('coord'); continue; }

    const iso = vue.iso;
    const country = iso ? pays.get(iso) : null;
    if (!country) { ecarter('pays'); continue; }
    if (!insideBox(country, lng, lat, world.worldSize)) { ecarter('cadre'); continue; }

    const ville = vue.ville;
    if (!ville) { ecarter('ville'); continue; }

    const annee = yearOf(vue.debut);
    if (annee == null) { ecarter('annee'); continue; }
    const anneeFin = yearOf(vue.fin);

    const id = slug(nomFr, vue.qid);
    if (vus.has(id)) { ecarter('doublon'); continue; }
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
    if (!n) continue;
    console.log(`  ${raison.padEnd(9)} ${n}`);
    for (const p of perdus.filter((x) => x.raison === raison)) {
      console.log(`      ${p.nom} (${p.qid})`);
    }
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
