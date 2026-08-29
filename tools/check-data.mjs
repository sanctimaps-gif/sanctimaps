/**
 * Contrôles de cohérence sur les données générées et les locales.
 *
 *   npm run check
 *
 * Sort en code 1 dès qu'une anomalie est trouvée, de sorte que la commande
 * puisse servir de garde-fou avant un commit.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const { saints } = read('saints.json');
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

for (const [year, expected] of [[1, 1], [100, 1], [101, 2], [1789, 18], [2000, 20], [-44, -1]]) {
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

// --- Bilan ------------------------------------------------------------------

if (problems.length) {
  console.error(`\n${problems.length} anomalie(s) :`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n${checks} contrôles passés.`);
