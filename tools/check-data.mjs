/**
 * Contrôles de cohérence sur les données générées et les locales.
 *
 *   npm run check
 *
 * Sort en code 1 dès qu'une anomalie est trouvée, de sorte que la commande
 * puisse servir de garde-fou avant un commit.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCorpus } from './lib/corpus.mjs';

import { WORLD_SIZE, project, unproject } from '../src/js/map/projection.js';
import { centuryOf } from '../src/js/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'generated');
const read = (p) => JSON.parse(readFileSync(join(GEN, p), 'utf8'));

const problems = [];
const fail = (msg) => problems.push(msg);
let checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };

// --- Géographie -------------------------------------------------------------

const world = read('world.json');
if (world.worldSize !== WORLD_SIZE) fail('world.json ne partage pas WORLD_SIZE avec la projection');
if (!world.countries.length) fail('aucun pays dans world.json');
ok(`${world.countries.length} pays et ${world.continents.length} continents`);

const countryIds = new Set(world.countries.map((c) => c.id));
for (const c of world.countries) {
  if (!c.d || c.d.length < 10) fail(`${c.id} : tracé vide`);
  if (c.focus[0] >= c.focus[2] || c.focus[1] >= c.focus[3]) fail(`${c.id} : cadrage dégénéré`);
}
ok('tracés et cadrages non dégénérés');

const assigned = new Set(world.continents.flatMap((c) => c.countries));
for (const id of countryIds) if (!assigned.has(id)) fail(`${id} n'appartient à aucun continent`);
ok('chaque pays est rattaché à un continent');

const detailFiles = readdirSync(join(GEN, 'countries'));
if (detailFiles.length !== world.countries.length) {
  fail(`${detailFiles.length} contours détaillés pour ${world.countries.length} pays`);
}
ok(`${detailFiles.length} contours haute définition`);

// --- Projection -------------------------------------------------------------

for (const [lng, lat] of [[0, 0], [2.35, 48.85], [-77.03, -12.05], [174.8, -41.3]]) {
  const [x, y] = project(lng, lat);
  const [lng2, lat2] = unproject(x, y);
  if (Math.abs(lng - lng2) > 1e-6 || Math.abs(lat - lat2) > 1e-6) {
    fail(`projection non réversible en ${lng},${lat}`);
  }
}
ok('projection réversible');

// --- Saints -----------------------------------------------------------------

const saints = lireCorpus();
const { candidates } = read('candidates.json');
const names = read('country-names.json');

if (saints.length < 100) fail(`corpus trop maigre : ${saints.length} saints`);
ok(`${saints.length} saints répartis sur ${new Set(saints.map((s) => s.country)).size} pays`);

const ids = new Set();
for (const s of saints) {
  if (ids.has(s.id)) fail(`identifiant en double : ${s.id}`);
  ids.add(s.id);
  if (!countryIds.has(s.country)) fail(`${s.id} : pays inconnu ${s.country}`);
  if (!s.name?.fr || !s.name?.en) fail(`${s.id} : nom incomplet`);
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s.feast)) fail(`${s.id} : fête ${s.feast}`);

  // Le point projeté doit retomber sur les coordonnées d'origine.
  const shift = s.x > WORLD_SIZE ? WORLD_SIZE : 0;
  const [lng, lat] = unproject(s.x - shift, s.y);
  if (Math.abs(lng - s.lng) > 0.01 || Math.abs(lat - s.lat) > 0.01) {
    fail(`${s.id} : point projeté incohérent`);
  }
}
ok('fiches valides et points cohérents avec leurs coordonnées');

for (const id of new Set(saints.map((s) => s.country))) {
  if (!names[id]) fail(`${id} : aucun nom traduit`);
}
ok('tous les pays porteurs de saints ont un nom traduit');
const placeFiles = readdirSync(join(GEN, 'cities'));
let placeCount = 0;
for (const file of placeFiles) placeCount += read(join('cities', file)).length;
ok(`${placeCount} localités réparties sur ${placeFiles.length} fichiers de pays`);

// --- Siècles ----------------------------------------------------------------

for (const [year, expected] of [[1, 1], [100, 1], [101, 2], [1789, 18], [2000, 20],
  [-44, -1], [-100, -1], [-101, -2], [-200, -2], [-201, -3]]) {
  if (centuryOf(year) !== expected) fail(`siècle de ${year} : ${centuryOf(year)} au lieu de ${expected}`);
}
ok('calcul des siècles');

// --- Candidats de l'assistant ------------------------------------------------

if (candidates.length < 20) fail(`réservoir de candidats trop maigre : ${candidates.length}`);
const corpusIds = new Set(saints.map((s) => s.id));
for (const c of candidates) {
  if (corpusIds.has(c.id)) fail(`candidat ${c.id} : identifiant déjà pris par le corpus`);
  if (!c.name?.fr) fail(`candidat ${c.id} : nom français manquant`);
}
// Le réservoir contient exprès des fiches fautives : l'assistant doit avoir de
// quoi montrer que sa vérification écarte vraiment quelque chose.
const faulty = candidates.filter((c) => !countryIds.has(c.country)
  || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(c.feast)
  || (c.born != null && c.died != null && c.died < c.born));
if (!faulty.length) fail('aucune fiche candidate fautive : la vérification ne serait pas démontrable');
ok(`${candidates.length} candidats, dont ${faulty.length} détectés fautifs dès ce contrôle`);

// --- Fond documentaire de l'expert -------------------------------------------

// Ce fond est écrit à la main : il faut donc le contrôler plus sévèrement que
// le reste. Un lieu qui tomberait hors du pays annoncé serait une faute
// invisible à l'écran mais visible sur la carte.
const { entries, aliases } = read('reference.json');
if (entries.length < 100) fail(`fond documentaire trop maigre : ${entries.length}`);

const boxes = new Map(world.countries.map((c) => [c.id, c]));
const inside = (place) => {
  const country = boxes.get(place.country);
  const [x, y] = project(place.lng, place.lat);
  const box = country.bbox;
  const shifted = country.focus[0] > WORLD_SIZE ? x + WORLD_SIZE : x;
  const w = (box[2] - box[0]) * 0.08;
  const h = (box[3] - box[1]) * 0.08;
  return shifted >= box[0] - w && shifted <= box[2] + w && y >= box[1] - h && y <= box[3] + h;
};

const refIds = new Set();
let deaths = 0;
for (const e of entries) {
  if (refIds.has(e.id) || ids.has(e.id)) fail(`fond : identifiant en double ${e.id}`);
  refIds.add(e.id);
  if (!e.name?.fr || !e.name?.en) fail(`fond : ${e.id} nom incomplet`);
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(e.feast)) fail(`fond : ${e.id} fête ${e.feast}`);
  if (e.born != null && e.died != null && e.died < e.born) fail(`fond : ${e.id} dates ${e.born} → ${e.died}`);
  // Les fiches venues du réservoir n'ont pas d'histoire rédigée : on ne la
  // réclame qu'à celles qui ont été écrites pour le fond.
  if (!e.desc?.fr) fail(`fond : ${e.id} notice manquante`);
  if (e.source !== 'pool' && !e.bio?.fr) fail(`fond : ${e.id} histoire manquante`);
  for (const key of ['birth', 'death']) {
    const place = e[key];
    if (!place) continue;
    if (key === 'death') deaths += 1;
    if (!countryIds.has(place.country)) fail(`fond : ${e.id} pays inconnu ${place.country}`);
    else if (!inside(place)) fail(`fond : ${e.id} ${key} hors du cadre de ${place.country}`);
  }
  if (!e.birth) fail(`fond : ${e.id} sans lieu de naissance`);
}
ok(`${entries.length} fiches de référence, dont ${deaths} avec un lieu de mort`);

// Chaque graphie doit mener à une localité qui existe vraiment dans ce pays :
// une correspondance fausse enverrait chercher un lieu introuvable.
let aliasCount = 0;
for (const [country, table] of Object.entries(aliases)) {
  const names = new Set(read(join('cities', `${country}.json`)).map((p) => p.n));
  for (const target of new Set(Object.values(table))) {
    if (!names.has(target)) fail(`graphies : ${country} ne contient pas ${target}`);
  }
  aliasCount += Object.keys(table).length;
}
ok(`${aliasCount} graphies de lieux, toutes résolues dans la table`);

// --- Locales ----------------------------------------------------------------

const localeDir = join(ROOT, 'src', 'js', 'locales');
const files = readdirSync(localeDir).filter((f) => f.endsWith('.js'));
const bundles = await Promise.all(files.map(async (f) => [
  f.replace('.js', ''), (await import(join(localeDir, f))).default,
]));

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? flatten(v, `${prefix}${k}.`)
    : [`${prefix}${k}`]
));

const reference = new Set(flatten(bundles.find(([code]) => code === 'fr')[1]));
for (const [code, bundle] of bundles) {
  const keys = new Set(flatten(bundle));
  for (const key of reference) if (!keys.has(key)) fail(`locale ${code} : clé manquante ${key}`);
  for (const key of keys) if (!reference.has(key)) fail(`locale ${code} : clé en trop ${key}`);
}
ok(`${bundles.length} langues, toutes complètes (${reference.size} clés)`);

// --- Pages indexables --------------------------------------------------------

/**
 * Les pages générées ne valent que si leurs liens tombent juste.
 *
 * Un lien mort dans une page statique ne se voit pas à l'usage — personne ne
 * clique quatre mille six cents fiches — mais un moteur de recherche, lui, les
 * suit toutes. On vérifie donc que chaque page annoncée existe, et que chaque
 * lien interne mène à un fichier présent. Les pages sont facultatives : tant
 * qu'elles n'ont pas été générées, le contrôle passe son tour.
 */
const pagesDir = join(ROOT, 'saints');
if (existsSync(pagesDir)) {
  const published = saints.filter((s) => (s.status ?? 'published') === 'published');

  // Chaque page vit dans un dossier à son nom : l'adresse s'écrit sans
  // extension. Une fiche se reconnaît à son JSON-LD — c'est la seule marque
  // qui la distingue à coup sûr d'une page de prénom ou d'un renvoi, dont les
  // noms de dossier voisinent avec les siens.
  const dossiers = readdirSync(pagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pagesDir, d.name, 'index.html')))
    .map((d) => `saints/${d.name}/index.html`);
  const fiches = dossiers.filter((rel) => readFileSync(join(ROOT, rel), 'utf8')
    .includes('"@type":"Person"'));
  if (fiches.length !== published.length) {
    fail(`pages : ${fiches.length} fiches écrites pour ${published.length} saints publiés`);
  }

  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const base = locs[0].replace(/\/$/, '');
  /** Un fichier, ou l'`index.html` du dossier que l'adresse désigne. */
  const fichierDe = (rel) => {
    const chemin = join(ROOT, rel);
    if (rel.endsWith('/') || rel === '') return join(chemin, 'index.html');
    return chemin;
  };
  let morts = 0;
  for (const loc of locs) {
    const rel = loc.slice(base.length).replace(/^\//, '');
    if (!existsSync(fichierDe(rel))) { morts += 1; if (morts < 4) fail(`plan du site : ${rel} n'existe pas`); }
  }
  if (morts >= 4) fail(`plan du site : ${morts} adresses sans fichier`);

  // Une adresse de dossier qui ne porterait pas d'`index.html` répondrait par
  // une liste de fichiers, ou par rien du tout selon l'hébergeur : le plan du
  // site le dirait, mais les liens entre pages, eux, sont relatifs et n'y
  // passent pas. On les vérifie donc de la même manière, depuis une poignée de
  // pages tirées au hasard — les relire toutes coûterait une minute pour la
  // même certitude.
  const echantillon = ['saints/index.html', 'pays/index.html', 'calendrier/index.html',
    'lieux/index.html', 'epoques/index.html', 'lettre/index.html',
    'pays/france/index.html', 'lieux/rome/index.html',
    ...fiches.filter((_, i) => i % 97 === 0)];
  let brises = 0;
  for (const rel of echantillon) {
    const html = readFileSync(join(ROOT, rel), 'utf8');
    for (const [, href] of html.matchAll(/href="([^"#?:]+)"/g)) {
      const cible = fichierDe(join(dirname(rel), href) + (href.endsWith('/') ? '/' : ''));
      if (!existsSync(cible)) { brises += 1; if (brises < 4) fail(`lien brisé dans ${rel} : ${href}`); }
    }
  }
  if (brises >= 4) fail(`${brises} liens internes brisés`);
  ok(`${fiches.length} fiches, ${locs.length} adresses au plan du site, liens vérifiés sur ${echantillon.length} pages`);
}

// --- Les chiffres écrits à la main dans l'accueil ----------------------------

/**
 * L'accueil annonce des nombres, et les annonçait faux.
 *
 * Le bandeau et l'écran d'attente disent « 4 589 saints », « 91 pays »,
 * « 509 villes et régions ». Ce sont des repères pour le lecteur et pour les
 * moteurs de recherche, et ils sont écrits dans le fichier — il faut bien
 * qu'ils y soient, puisque c'est leur présence sans JavaScript qui leur donne
 * leur valeur. Mais une fusion de doublons en a fait mentir deux, sans que rien
 * ne le dise : la page promettait quatre mille six cent vingt-huit fiches pour
 * quatre mille cinq cent quatre-vingt-neuf.
 *
 * On ne les génère pas — l'accueil est écrit à la main, et le rester vaut mieux.
 * On les relit, et le contrôle échoue bruyamment plutôt que de laisser la page
 * se vanter à faux.
 */
const accueil = join(ROOT, 'index.html');
if (existsSync(accueil)) {
  const html = readFileSync(accueil, 'utf8');
  const published = saints.filter((s) => (s.status ?? 'published') === 'published');
  const villes = new Map();
  for (const s of published) {
    if (!s.city) continue;
    const clef = `${s.country}|${s.city}`;
    villes.set(clef, (villes.get(clef) || 0) + 1);
  }
  const siecles = new Set(published
    .map((s) => centuryOf(s.born ?? s.died)).filter((n) => n != null));
  const attendus = {
    saints: published.length,
    pays: new Set(published.map((s) => s.country)).size,
    'villes et régions': [...villes.values()].filter((n) => n >= 2).length,
    lieux: [...villes.values()].filter((n) => n >= 2).length,
    'siècles': siecles.size,
    'jours de fête': new Set(published.map((s) => s.feast)).size,
    'biographies en français': published.filter((s) => s.bio?.fr).length,
  };
  // « <b>4 589</b> saints » : on relit le nombre qui précède chaque étiquette,
  // l'espace fine insécable comprise.
  let faux = 0;
  for (const [label, attendu] of Object.entries(attendus)) {
    const motif = new RegExp(`<b>([\\d\\s  ]+)</b>\\s*${label}`, 'gi');
    for (const trouve of html.matchAll(motif)) {
      const dit = Number(trouve[1].replace(/[^\d]/g, ''));
      if (dit !== attendu) {
        faux += 1;
        fail(`index.html annonce ${dit} ${label} pour ${attendu}`);
      }
    }
  }
  // L'adresse de contact : promise au lecteur, elle ne doit pas disparaître
  // d'un remaniement de l'écran d'attente.
  if (!html.includes('mailto:sanctimaps@gmail.com')) {
    fail('index.html : l’adresse de contact a disparu');
  }
  if (!faux) ok('les chiffres et l’adresse de contact de l’accueil disent vrai');
}

// --- Bilan ------------------------------------------------------------------

if (problems.length) {
  console.error(`\n${problems.length} anomalie(s) :`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n${checks} contrôles passés.`);
