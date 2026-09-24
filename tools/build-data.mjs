/**
 * Génère les données statiques consommées par l'application.
 *
 *   node tools/build-data.mjs
 *
 * Entrées (devDependencies, aucune requête réseau) :
 *   - world-atlas      : géométries TopoJSON des pays (110m et 50m)
 *   - world-countries  : métadonnées ISO, région, traductions des noms
 *   - all-the-cities   : villes mondiales avec population
 *
 * Sorties (data/generated/) :
 *   - world.json            carte basse définition + index des pays et continents
 *   - countries/<ISO3>.json contour haute définition, chargé à la volée
 *   - cities/<ISO3>.json    villes et villages du pays, chargés à la volée
 *   - country-names.json    noms de pays traduits
 *   - saints.json           corpus fusionné et validé
 *   - apparitions.json      second corpus : les apparitions reconnues
 *   - candidates.json       réservoir de fiches pour l'assistant
 *   - reference.json        fond documentaire consulté par l'assistant expert
 */

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { feature } from 'topojson-client';

import { WORLD_SIZE, project } from '../src/js/map/projection.js';
import { fold } from '../src/js/data.js';
import { coherent } from './lib/dates.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'generated');

const worldCountries = require('world-countries');
const cities = require('all-the-cities');

/** Langues pour lesquelles world-countries fournit une traduction. */
const NAME_LOCALES = {
  fr: 'fra', es: 'spa', it: 'ita', pt: 'por', de: 'deu', nl: 'nld',
  pl: 'pol', ru: 'rus', ar: 'ara', zh: 'zho', ja: 'jpn', ko: 'kor',
};

/**
 * Cadrages des continents, en degrés [ouest, sud, est, nord].
 *
 * Volontairement fixés à la main plutôt que déduits des pays membres : la
 * Russie est rattachée à l'Europe par la norme ISO, et l'union brute des
 * territoires étirerait la vue « Europe » jusqu'au Kamtchatka. L'Océanie
 * dépasse 180° : elle est décrite dans un repère centré Pacifique, que la
 * carte sait afficher.
 */
const CONTINENTS = {
  europe: [-26, 33, 46, 72],
  africa: [-20, -37, 53, 38],
  asia: [25, -12, 150, 57],
  'north-america': [-172, 5, -50, 73],
  'south-america': [-83, -57, -33, 14],
  oceania: [110, -49, 231, 22],
};

function continentOf(country) {
  switch (country.region) {
    case 'Europe': return 'europe';
    case 'Africa': return 'africa';
    case 'Asia': return 'asia';
    case 'Oceania': return 'oceania';
    case 'Americas':
      return country.subregion === 'South America' ? 'south-america' : 'north-america';
    default: return null; // Antarctique
  }
}

/** Territoires présents dans Natural Earth mais sans code ISO numérique. */
const UNMATCHED = {
  Kosovo: { id: 'XKX', name: 'Kosovo', continent: 'europe' },
  'N. Cyprus': { id: 'XNC', name: 'Northern Cyprus', continent: 'asia' },
  Somaliland: { id: 'XSL', name: 'Somaliland', continent: 'africa' },
  'Siachen Glacier': null,
  'Indian Ocean Ter.': null,
  'Ashmore and Cartier Is.': null,
  'Fr. S. Antarctic Lands': null,
  Antarctica: null,
};

const byCcn3 = new Map();
const byCca3 = new Map();
for (const c of worldCountries) {
  if (c.ccn3) byCcn3.set(String(c.ccn3), c);
  byCca3.set(c.cca3, c);
}

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

/**
 * Ramène les longitudes d'un anneau dans un repère continu : sans cela, un
 * polygone qui franchit l'antiméridien (Russie, Fidji) traverse toute la carte.
 */
function unwrap(ring) {
  const out = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  // Si l'anneau s'est retrouvé hors du monde, on le décale d'un tour complet.
  let mean = 0;
  for (const p of out) mean += p[0];
  mean /= out.length;
  const shift = mean > 180 ? -360 : mean < -180 ? 360 : 0;
  if (shift) for (const p of out) p[0] += shift;
  return out;
}

/** Anneau géographique -> points entiers dans l'espace monde. */
function projectRing(ring) {
  const pts = [];
  let last = null;
  for (const [lon, lat] of unwrap(ring)) {
    const [x, y] = project(lon, lat);
    const p = [Math.round(x), Math.round(y)];
    if (last && p[0] === last[0] && p[1] === last[1]) continue;
    pts.push(p);
    last = p;
  }
  return pts;
}

/** Aire signée (repère écran : positive = sens horaire). */
function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  }
  return a / 2;
}

function ringBBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function mergeBBox(a, b) {
  if (!a) return b.slice();
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function bboxContains(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

function growBBox(b, factor) {
  const w = (b[2] - b[0]) * factor;
  const h = (b[3] - b[1]) * factor;
  return [b[0] - w, b[1] - h, b[2] + w, b[3] + h];
}

/** Centroïde surfacique d'un anneau (repli sur la moyenne si aire nulle). */
function ringCentroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f;
    cx += (pts[j][0] + pts[i][0]) * f;
    cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (a === 0) {
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    return [Math.round(cx / pts.length), Math.round(cy / pts.length)];
  }
  return [Math.round(cx / (3 * a)), Math.round(cy / (3 * a))];
}

function shiftRing(pts, dx) {
  return pts.map(([x, y]) => [x + dx, y]);
}

/**
 * Un anneau qui déborde le carré Mercator (Tchoukotka poussée au-delà de 180°)
 * doit aussi apparaître sur le bord opposé, sans quoi il manque un morceau de
 * la carte du monde.
 */
function wrapCopies(rings) {
  const extra = [];
  for (const r of rings) {
    const b = ringBBox(r);
    if (b[2] > WORLD_SIZE) extra.push(shiftRing(r, -WORLD_SIZE));
    else if (b[0] < 0) extra.push(shiftRing(r, WORLD_SIZE));
  }
  return extra;
}

/** Chemin SVG en coordonnées relatives : nettement plus compact qu'en absolu. */
function toPath(rings) {
  let d = '';
  for (const pts of rings) {
    if (pts.length < 3) continue;
    d += `M${pts[0][0]} ${pts[0][1]}`;
    let [px, py] = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      d += `l${x - px} ${y - py}`;
      px = x; py = y;
    }
    d += 'Z';
  }
  return d;
}

/** Découpe une géométrie GeoJSON en liste de polygones (anneau externe + trous). */
function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * Convertit une entité pays en chemin SVG.
 *
 * `bbox` couvre l'intégralité du territoire, `focus` seulement la masse
 * principale et ce qui la borde : c'est ce cadrage-là qu'on utilise pour zoomer,
 * sinon ouvrir la France afficherait surtout l'Atlantique (Guyane) et les
 * États-Unis surtout le Pacifique (Alaska, Hawaï).
 */
function buildShape(geometry) {
  const parts = [];
  for (const poly of polygonsOf(geometry)) {
    const rings = poly.map(projectRing).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    const outer = rings[0];
    parts.push({ rings, bbox: ringBBox(outer), area: Math.abs(ringArea(outer)) });
  }
  if (!parts.length) return null;

  parts.sort((a, b) => b.area - a.area);
  const main = parts[0];
  const near = growBBox(main.bbox, 0.35);
  let focus = main.bbox.slice();
  let bbox = null;
  for (const p of parts) {
    bbox = mergeBBox(bbox, p.bbox);
    if (p !== main && bboxContains(near, p.bbox)) focus = mergeBBox(focus, p.bbox);
  }

  return {
    rings: parts.flatMap((p) => p.rings),
    bbox,
    focus,
    label: ringCentroid(main.rings[0]),
    area: parts.reduce((s, p) => s + p.area, 0),
  };
}

/**
 * Met une forme au format publié.
 *
 * `pacific` redouble le tracé un tour de globe plus loin (continent décrit
 * au-delà de 180°) et `shift` replace les repères du pays dans ce repère-là.
 */
function finalizeShape(shape, { pacific = false, shift = 0 } = {}) {
  const rings = shape.rings;
  let all = rings.concat(wrapCopies(rings));
  if (pacific) all = all.concat(rings.map((r) => shiftRing(r, WORLD_SIZE)));
  const sx = (b) => [b[0] + shift, b[1], b[2] + shift, b[3]];
  return {
    d: toPath(all),
    bbox: sx(shape.bbox),
    focus: sx(shape.focus),
    label: [shape.label[0] + shift, shape.label[1]],
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function loadFeatures(resolution) {
  const topo = require(`world-atlas/countries-${resolution}.json`);
  return feature(topo, topo.objects.countries).features;
}

function identify(f) {
  const meta = byCcn3.get(String(f.id));
  if (meta) {
    const continent = continentOf(meta);
    if (!continent) return null; // Antarctique et terres australes
    return { id: meta.cca3, name: meta.name.common, continent };
  }
  const name = f.properties?.name;
  if (name in UNMATCHED) return UNMATCHED[name];
  console.warn(`  ! pays ignoré (aucune correspondance ISO) : ${name} [id=${f.id}]`);
  return null;
}

console.log('Génération des données géographiques…');

// Le 50m fait référence pour l'identité et le cadrage : le 110m écarte
// purement et simplement les micro-États (Vatican, Malte, Monaco…), qui sont
// justement parmi les plus chargés en saints. Le 110m ne sert qu'à alléger le
// tracé de la vue mondiale, là où il existe.
const coarse = new Map();
for (const f of loadFeatures('110m')) {
  const meta = identify(f);
  if (meta && !coarse.has(meta.id)) coarse.set(meta.id, f);
}

/** Continents dont le cadrage franchit l'antiméridien. */
const PACIFIC = new Set(
  Object.entries(CONTINENTS)
    .filter(([, frame]) => project(frame[2], 0)[0] > WORLD_SIZE)
    .map(([key]) => key),
);

const countries = [];
const detailFiles = new Map();
const shiftById = new Map();
const seen = new Set();
for (const f of loadFeatures('50m')) {
  const meta = identify(f);
  if (!meta || seen.has(meta.id)) continue;
  const detail = buildShape(f.geometry);
  if (!detail) continue;
  seen.add(meta.id);

  const pacific = PACIFIC.has(meta.continent);
  const shift = pacific && (detail.focus[0] + detail.focus[2]) / 2 < WORLD_SIZE / 2 ? WORLD_SIZE : 0;
  const opts = { pacific, shift };
  shiftById.set(meta.id, shift);

  const fine = finalizeShape(detail, opts);
  detailFiles.set(meta.id, { id: meta.id, ...fine });

  const coarseFeature = coarse.get(meta.id);
  const outline = coarseFeature ? finalizeShape(buildShape(coarseFeature.geometry), opts) : fine;
  countries.push({
    id: meta.id,
    name: meta.name,
    continent: meta.continent,
    d: outline.d,
    bbox: fine.bbox,
    focus: fine.focus,
    label: fine.label,
    area: Math.round(detail.area),
  });
}
countries.sort((a, b) => a.id.localeCompare(b.id));

// Cadre du monde : union des pays, ce qui borne le déplacement de la carte.
// Quelques territoires débordent l'antiméridien après recollage (Tchoukotka,
// Fidji) ; on rogne au carré Mercator plutôt que d'étirer la carte.
//
// Le nord est en outre coupé à 79° : au-delà, Mercator étire un océan Arctique
// vide sur près d'un sixième de la hauteur, et cette bande volée à la carte
// est la place que gagnent tous les continents habités.
const NORTH_CUT = 79;
let worldBBox = null;
for (const c of countries) worldBBox = mergeBBox(worldBBox, c.bbox);
worldBBox = [
  Math.max(0, worldBBox[0]),
  Math.max(project(0, NORTH_CUT)[1], worldBBox[1]),
  Math.min(WORLD_SIZE, worldBBox[2]),
  Math.min(WORLD_SIZE, worldBBox[3]),
].map(Math.round);

const continents = Object.entries(CONTINENTS).map(([key, [w, s, e, n]]) => {
  const [x0, y0] = project(w, n);
  const [x1, y1] = project(e, s);
  const bbox = [x0, y0, x1, y1].map(Math.round);
  return {
    id: key,
    bbox,
    label: [Math.round((bbox[0] + bbox[2]) / 2), Math.round((bbox[1] + bbox[3]) / 2)],
    countries: countries.filter((c) => c.continent === key).map((c) => c.id),
  };
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'countries'), { recursive: true });

writeFileSync(
  join(OUT, 'world.json'),
  JSON.stringify({ worldSize: WORLD_SIZE, bounds: worldBBox, continents, countries }),
);
console.log(`  world.json : ${countries.length} pays, ${continents.length} continents`);

// Contours haute définition, chargés uniquement à l'ouverture d'un pays.
for (const c of countries) {
  writeFileSync(join(OUT, 'countries', `${c.id}.json`), JSON.stringify(detailFiles.get(c.id)));
}
console.log(`  countries/ : ${countries.length} contours détaillés`);

// ---------------------------------------------------------------------------
// Villes
// ---------------------------------------------------------------------------

/**
 * Nombre de localités retenues par pays.
 *
 * Assez haut pour épuiser la source : en vue pays on descend jusqu'aux
 * villages de mille habitants, et c'est ce qui donne à la carte son grain de
 * carte d'état-major. La carte n'en révèle qu'une part à la fois, du plus
 * peuplé au plus petit ; chaque pays a son fichier, chargé à son ouverture.
 */
const PLACES_PER_COUNTRY = 9000;

/**
 * Deux fiches du même nom si proches l'une de l'autre décrivent le même
 * endroit ; au-delà, ce sont deux villages homonymes, et la France en compte
 * assez pour qu'il serait faux de n'en garder qu'un. Seuil en unités monde,
 * soit une vingtaine de kilomètres sous nos latitudes.
 */
const SAME_PLACE = 600;

const cca2ToCca3 = new Map(worldCountries.map((c) => [c.cca2, c.cca3]));
const known = new Set(countries.map((c) => c.id));

const byCountry = new Map();
for (const city of cities) {
  const iso3 = cca2ToCca3.get(city.country);
  if (!iso3 || !known.has(iso3)) continue;
  // Seules les localités habitées : la source charrie aussi des entités
  // administratives sans population, qui n'ont rien à faire sur la carte.
  if (!city.featureCode?.startsWith('PPL') || !(city.population > 0)) continue;
  if (!byCountry.has(iso3)) byCountry.set(iso3, []);
  byCountry.get(iso3).push(city);
}

mkdirSync(join(OUT, 'cities'), { recursive: true });
let cityCount = 0;
let smallest = Infinity;
for (const [iso3, list] of byCountry) {
  list.sort((a, b) => b.population - a.population);
  const picked = [];
  const byName = new Map();
  const shift = shiftById.get(iso3) || 0;
  const push = (c) => {
    if (picked.length >= PLACES_PER_COUNTRY) return;
    const [x, y] = project(c.loc.coordinates[0], c.loc.coordinates[1]);
    const twins = byName.get(c.name);
    if (twins?.some((t) => Math.hypot(t[0] - x, t[1] - y) < SAME_PLACE)) return;
    if (twins) twins.push([x, y]); else byName.set(c.name, [[x, y]]);
    const place = { n: c.name, x: Math.round(x) + shift, y: Math.round(y), p: c.population };
    if (c.featureCode === 'PPLC') place.c = 1;
    picked.push(place);
  };
  for (const c of list) if (c.featureCode === 'PPLC') push(c);
  for (const c of list) push(c);
  picked.sort((a, b) => (b.c || 0) - (a.c || 0) || b.p - a.p);
  writeFileSync(join(OUT, 'cities', `${iso3}.json`), JSON.stringify(picked));
  cityCount += picked.length;
  if (picked.length > 200) smallest = Math.min(smallest, picked[picked.length - 1].p);
}
console.log(`  cities/ : ${cityCount} localités réparties sur ${byCountry.size} pays`);
console.log(`    jusqu'aux villages de ${smallest} habitants`);

// ---------------------------------------------------------------------------
// Noms de pays traduits
// ---------------------------------------------------------------------------

const names = {};
for (const c of countries) {
  const meta = byCca3.get(c.id);
  const entry = { en: c.name };
  if (meta) {
    for (const [lang, key] of Object.entries(NAME_LOCALES)) {
      const t = meta.translations?.[key]?.common;
      if (t) entry[lang] = t;
    }
    if (meta.name?.nativeName) {
      const native = Object.values(meta.name.nativeName)[0]?.common;
      if (native) entry.native = native;
    }
  }
  names[c.id] = entry;
}
writeFileSync(join(OUT, 'country-names.json'), JSON.stringify(names));
console.log(`  country-names.json : ${Object.keys(names).length} pays, ${Object.keys(NAME_LOCALES).length} langues`);

// ---------------------------------------------------------------------------
// Saints
// ---------------------------------------------------------------------------

const SAINTS_DIR = join(ROOT, 'data', 'saints');
const REQUIRED = ['id', 'name', 'sex', 'city', 'country', 'lat', 'lng', 'feast'];

/** Tournures qui trahissent un nom resté dans une autre langue. */
const ETRANGER = / of | the | di | da | do | dos | von | zu | della | degli | del | de los | de las | y /;

/**
 * Rend son nom français à une fiche qui n'en a pas.
 *
 * L'import prend le libellé français de Wikidata, et à défaut le titre de
 * l'article français. Reste le cas où Wikidata *a* un libellé français qui
 * n'est pas français : « Natale di Milano », « Aldemaro di Capua », « Hroznata
 * von Ovenec ». L'article français existe pourtant, et son titre, lui, est
 * français — « Natale de Milan », « Aldemar de Capoue », « Hroznata d'Ovenec ».
 *
 * On ne remplace que sur deux conditions, parce qu'un titre d'article n'est
 * pas toujours le nom d'un homme : le nom actuel doit porter une tournure
 * étrangère franche, et le titre ne doit pas être le nom actuel précédé d'un
 * mot — « Affaire Dominguito del Val » parle du meurtre, non du saint.
 */
function nomFrancais(saint) {
  const nom = saint.name?.fr;
  if (!nom || !ETRANGER.test(` ${nom} `)) return null;
  const source = (saint.sources || []).find((u) => /fr\.wikipedia/.test(u.url));
  if (!source) return null;
  const titre = decodeURIComponent(source.url.split('/wiki/')[1] || '')
    .replace(/_/g, ' ')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  if (!titre || titre === nom || titre.includes(nom)) return null;
  return titre;
}

const saints = [];
const ids = new Set();
const errors = [];

// Les patronages vivent dans leur propre fichier : ils s'ajoutent à des
// centaines de fiches sans qu'il faille rouvrir chacune d'elles.
const PATRONAGE_FILE = 'patronages.json';
// Le statut de canonisation, relevé par `import-statuts.mjs`. Il se lit plus
// bas, une fois les fiches fondues, mais son nom doit être connu ici : c'est
// un fichier du dossier des saints qui ne contient pas de saints.
const STATUT_FILE = 'statuts.json';
// Les biographies rapportées des Wikipédia autres que la française et
// l'anglaise, par `completer-bios.mjs`. Même remarque : ce n'est pas un
// fichier de saints.
const BIOS_IMPORTEES_FILE = 'bios-importees.json';
const patronages = JSON.parse(readFileSync(join(SAINTS_DIR, PATRONAGE_FILE), 'utf8')).patronage;

// Les biographies rapportées de Wikipédia pour les fiches écrites à la main
// vivent de même à part, parce qu'elles sont refaites d'un bloc à chaque
// passage de `enrich-bios.mjs`. Le fichier peut manquer — il n'est pas
// nécessaire à la carte, et une fiche sans récit reste une fiche entière.
const BIO_FILE = 'biographies.json';
let biographies = {};
try {
  biographies = JSON.parse(readFileSync(join(SAINTS_DIR, BIO_FILE), 'utf8')).biographies || {};
} catch { /* pas de biographies rapportées : la fiche garde sa notice */ }

// Les traductions des biographies qui n'existaient qu'en anglais. Elles vivent
// à part pour la raison inverse des précédentes : elles sont écrites à la main
// et ne doivent *pas* être refaites par un outil. Le fichier se garde, et
// survit à un réimport qui réécrirait `wikidata.json` d'un bloc.
const TRAD_FILE = 'traductions.json';
let traductions = {};
try {
  traductions = JSON.parse(readFileSync(join(SAINTS_DIR, TRAD_FILE), 'utf8')).traductions || {};
} catch { /* pas de traductions : les fiches concernées restent sans récit */ }

// Les biographies allées chercher dans les autres Wikipédia — l'espagnole,
// l'italienne, la polonaise, la coréenne — pour les fiches qui n'avaient de
// récit dans aucune des deux langues que l'import demandait. Elles ne
// s'affichent pas telles quelles : la carte ne montre que le français, et
// c'est `traductions.json` qui les y fait entrer une à une. Elles servent
// d'abord à savoir où l'on parle de ces saints-là.
let biosImportees = {};
try {
  biosImportees = JSON.parse(readFileSync(join(SAINTS_DIR, BIOS_IMPORTEES_FILE), 'utf8'))
    .biographies || {};
} catch { /* pas encore cherchées */ }

for (const file of readdirSync(SAINTS_DIR)
  .filter((f) => f.endsWith('.json')
    && ![PATRONAGE_FILE, BIO_FILE, TRAD_FILE, STATUT_FILE, BIOS_IMPORTEES_FILE].includes(f))
  .sort()) {
  const raw = JSON.parse(readFileSync(join(SAINTS_DIR, file), 'utf8'));
  for (const s of raw.saints) {
    const where = `${file}:${s.id ?? '?'}`;
    for (const field of REQUIRED) {
      if (s[field] === undefined || s[field] === null) errors.push(`${where} — champ « ${field} » manquant`);
    }
    if (ids.has(s.id)) errors.push(`${where} — identifiant en double`);
    ids.add(s.id);
    if (!seen.has(s.country)) errors.push(`${where} — pays inconnu : ${s.country}`);
    if (!/^\d{2}-\d{2}$/.test(s.feast || '')) errors.push(`${where} — fête mal formée : ${s.feast}`);
    if (Math.abs(s.lat) > 85 || Math.abs(s.lng) > 180) errors.push(`${where} — coordonnées hors limites`);
    if (s.born == null && s.died == null) errors.push(`${where} — ni naissance ni mort`);
    if (!coherent(s.born, s.died, s.bornPrec, s.diedPrec)) errors.push(`${where} — mort avant la naissance`);

    const [x, y] = project(s.lng, s.lat);
    const shift = shiftById.get(s.country) || 0;
    const record = { ...s, x: Math.round(x) + shift, y: Math.round(y) };
    const francais = nomFrancais(s);
    if (francais) record.name = { ...s.name, fr: francais };
    if (patronages[s.id]) record.patronage = patronages[s.id];
    // Une biographie écrite dans la fiche a priorité sur celle qui est
    // rapportée : la main l'emporte sur la machine, jamais l'inverse.
    const rapportee = biographies[s.id];
    if (rapportee && !s.bio) {
      record.bio = rapportee.bio;
      record.sources = [...(s.sources || []), ...rapportee.sources];
    }

    // Les biographies venues des autres langues comblent langue par langue, et
    // n'écrasent rien : une fiche qui a déjà son récit français le garde.
    const ailleurs = biosImportees[s.id];
    if (ailleurs?.bio) {
      const fusion = { ...record.bio };
      for (const [lang, texte] of Object.entries(ailleurs.bio)) {
        if (!fusion[lang]) fusion[lang] = texte;
      }
      record.bio = fusion;
      const vues = new Set((record.sources || []).map((src) => src.url));
      record.sources = [...(record.sources || []),
        ...(ailleurs.sources || []).filter((src) => !vues.has(src.url) && vues.add(src.url))];
    }

    // La traduction ne comble qu'un manque : elle n'écrase jamais un français
    // trouvé à la source, et le jour où l'article français paraît, l'import le
    // rapporte et la traduction s'efface d'elle-même.
    const traduite = traductions[s.id];
    if (traduite?.bio && !record.bio?.fr) {
      record.bio = { ...record.bio, fr: traduite.bio };
      // La langue d'origine, et non « anglais » d'office : les biographies
      // venues du polonais, de l'italien ou du russe sont désormais la
      // majorité, et la licence demande qu'on dise de quoi l'on a traduit.
      record.traduit = traduite.de || 'en';
    }

    saints.push(record);
  }
}

// ---------------------------------------------------------------------------
// Le statut : saint, bienheureux, vénérable, serviteur de Dieu
// ---------------------------------------------------------------------------

/**
 * Tout le monde n'est pas saint, et la carte le disait quand même.
 *
 * L'Église distingue quatre degrés : serviteur de Dieu dès l'ouverture de la
 * cause, vénérable quand les vertus héroïques sont reconnues, bienheureux
 * après la béatification, saint après la canonisation. Darwin Ramos, mort à
 * dix-sept ans à Manille, est serviteur de Dieu ; les pages l'appelaient
 * « saint Darwin Ramos », ce qu'aucune source ne dit et que l'Église
 * n'a pas dit non plus.
 *
 * La source sûre est la propriété P411 de Wikidata, que `import-statuts.mjs`
 * va chercher et dépose dans `data/saints/statuts.json`. Tant qu'elle manque,
 * on lit la notice — Wikidata écrit « saint catholique », « Filipino Servant
 * of God » —, et l'on ne retient que ce qui y est dit en toutes lettres. Ce
 * qui reste muet le reste : une fiche sans statut ne porte aucun titre, ce qui
 * est la seule chose vraie qu'on puisse en écrire.
 */
let statutsImportes = {};
try {
  statutsImportes = JSON.parse(readFileSync(join(SAINTS_DIR, STATUT_FILE), 'utf8')).statuts || {};
} catch { /* pas encore importés : la notice fera ce qu'elle peut */ }

/**
 * « Saint-Benoît », « ordre de Saint-François » : un nom propre, pas un statut.
 *
 * Sans cela, « moine de l'ordre de Saint-Benoît » ferait un saint de tous les
 * bénédictins du corpus.
 */
const NOM_PROPRE = /saintes?[- ](?=[A-ZÉÈÀÂÎÔÛ])|saints?[- ](?=[A-ZÉÈÀÂÎÔÛ])/g;

const DITS = [
  // Le plus haut degré d'abord : un canonisé a été béatifié avant, et sa
  // notice le dit parfois encore. C'est la canonisation qui compte.
  ['saint', /\bsaints?\b|\bsaintes?\b|canonis[ée]e?s?\b|canonized\b/i],
  ['bienheureux', /bienheureu|b[ée]atifi|beatifi|(?:^|[,;·]\s*|\band\s+)(?:[a-zé]+\s+)?blessed\b(?![\s-]*(?:in|by|are|is|was|were|with|on|at|the|sacrament|virgin))/i],
  ['venerable', /\bv[ée]n[ée]rables?\b/i],
  ['serviteur', /serviteurs? de dieu|servantes? de dieu|servants? of god/i],
];

/**
 * Ce que la biographie dit, quand la notice ne dit rien.
 *
 * La notice de Wikidata tient en cinq mots et nomme souvent le statut ; celle
 * des fiches écrites à la main est une phrase de présentation — « Capucin
 * stigmatisé de San Giovanni Rotondo » — qui n'en dit rien. La biographie,
 * elle, raconte : « déclaré saint par l'Église catholique », « béatifié en
 * 1888 ».
 *
 * On n'y cherche donc que le verbe, jamais le mot nu : un récit qui mentionne
 * « les saints de son temps » ne canonise personne.
 */
const RACONTE = [
  ['saint', /canonis[ée]|canonized|(?:d[ée]clar|reconnu|proclam|v[ée]n[ée]r)[ée]?e?s? (?:comme |)saintes?\b|is (?:a |)(?:catholic |christian |roman catholic |)saint\b|as a saint\b/i],
  ['bienheureux', /b[ée]atifi|beatified|(?:d[ée]clar|reconnu|proclam|v[ée]n[ée]r)[ée]?e?s? (?:comme |)bienheureu/i],
];

/** Ce que la fiche dit de son statut, ou rien quand elle n'en dit rien. */
function statutDeLaNotice(saint) {
  const notice = [saint.desc?.fr, saint.desc?.en].filter(Boolean).join(' · ').replace(NOM_PROPRE, '');
  // « Servant of God » passe avant « saint » : la formule entière l'emporte sur
  // le mot isolé, et l'on ne canonise personne par inadvertance.
  if (notice) {
    if (DITS[3][1].test(notice)) return 'serviteur';
    for (const [nom, motif] of DITS) if (motif.test(notice)) return nom;
  }
  const recit = [saint.bio?.fr, saint.bio?.en].filter(Boolean).join(' · ').replace(NOM_PROPRE, '');
  if (recit) {
    if (DITS[3][1].test(recit)) return 'serviteur';
    for (const [nom, motif] of RACONTE) if (motif.test(recit)) return nom;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Les doublons
// ---------------------------------------------------------------------------

/**
 * Deux fiches pour la même personne n'en font plus qu'une.
 *
 * Le corpus vient de deux endroits, et rien n'empêchait l'un de redire ce que
 * l'autre disait déjà : « Padre Pio » et « Pio de Pietrelcina » sont le même
 * capucin, l'un sous son nom d'usage, l'autre sous son nom de canonisation.
 * Sur la carte cela faisait deux croix au même endroit, et dans la lettre du
 * jour deux fois le même homme.
 *
 * On ne supprime pas : on verse. La fiche gardée reçoit ce que l'autre savait
 * de plus — une biographie, des sources, un titre, une langue de son nom —, et
 * ne perd rien de ce qu'elle avait. La table est écrite à la main, parce que
 * décider que deux noms désignent la même personne n'est pas une affaire de
 * seuil : `tools/audit-doublons.mjs` propose, un humain tranche.
 */
const DOUBLONS_FILE = join(ROOT, 'data', 'reference', 'doublons.json');
let doublons = [];
try {
  doublons = JSON.parse(readFileSync(DOUBLONS_FILE, 'utf8')).doublons || [];
} catch { /* pas de table : le corpus reste tel quel */ }

/** Ce qui manque à la fiche gardée, et que l'écartée savait. */
function verser(garde, ecarte) {
  const vide = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  for (const [clef, valeur] of Object.entries(ecarte)) {
    // L'identité, la place et le calendrier de la fiche gardée sont les siens :
    // ils ont été choisis, et une fusion n'a pas à les rediscuter.
    if (['id', 'x', 'y', 'lat', 'lng', 'city', 'country', 'feast', 'source'].includes(clef)) continue;
    if (clef === 'sources') {
      const vues = new Set((garde.sources || []).map((s) => s.url));
      garde.sources = [...(garde.sources || []),
        ...valeur.filter((s) => !vues.has(s.url) && vues.add(s.url))];
    } else if (clef === 'titles') {
      garde.titles = [...new Set([...(garde.titles || []), ...valeur])].sort();
    } else if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
      // Les champs par langue — nom, notice, biographie, patronage — se
      // complètent langue par langue : un français écrit à la main reste, un
      // anglais qui manquait arrive.
      const fusion = { ...valeur, ...garde[clef] };
      for (const [lang, texte] of Object.entries(valeur)) {
        if (vide(fusion[lang])) fusion[lang] = texte;
      }
      garde[clef] = fusion;
    } else if (vide(garde[clef])) {
      garde[clef] = valeur;
    }
  }
}

const parId = new Map(saints.map((s) => [s.id, s]));
const ecartes = new Set();
for (const { garde, ecarte } of doublons) {
  const a = parId.get(garde);
  const b = parId.get(ecarte);
  if (!a) { errors.push(`doublons.json — identifiant gardé inconnu : ${garde}`); continue; }
  if (!b) { errors.push(`doublons.json — identifiant écarté inconnu : ${ecarte}`); continue; }
  if (ecartes.has(garde)) { errors.push(`doublons.json — ${garde} est gardé ici et écarté ailleurs`); continue; }
  verser(a, b);
  ecartes.add(ecarte);
}
if (ecartes.size) {
  const avant = saints.length;
  for (let i = saints.length - 1; i >= 0; i -= 1) if (ecartes.has(saints[i].id)) saints.splice(i, 1);
  console.log(`Doublons : ${avant - saints.length} fiches fondues dans la leur`);
}

// Le statut se pose après la fusion : deux fiches du même homme ne doivent pas
// se disputer son degré, et c'est la fiche gardée qui porte la notice fondue.
const comptes = { fiche: 0, source: 0, notice: 0, inconnu: 0 };
for (const saint of saints) {
  // Un degré écrit dans la fiche l'emporte sur tout : la main passe avant la
  // machine, ici comme pour les biographies. C'est par là qu'on rend son titre
  // à un saint des premiers siècles, qu'aucune congrégation n'a canonisé parce
  // qu'il n'en existait pas — Wikidata n'a alors rien à dire de lui.
  if (saint.statut) { saint.statutDe = 'fiche'; comptes.fiche += 1; continue; }
  const importe = statutsImportes[saint.id];
  if (importe) { saint.statut = importe; saint.statutDe = 'source'; comptes.source += 1; continue; }
  const devine = statutDeLaNotice(saint);
  if (devine) { saint.statut = devine; saint.statutDe = 'notice'; comptes.notice += 1; }
  else comptes.inconnu += 1;
}
for (const id of Object.keys(statutsImportes)) {
  if (!parId.has(id) && !ecartes.has(id)) errors.push(`${STATUT_FILE} — identifiant inconnu : ${id}`);
}
console.log(`Statuts : ${comptes.source} de Wikidata, ${comptes.fiche} écrits dans la fiche,`
  + ` ${comptes.notice} lus dans la notice, ${comptes.inconnu} inconnus`);

for (const id of Object.keys(patronages)) {
  if (!ids.has(id)) errors.push(`${PATRONAGE_FILE} — identifiant inconnu : ${id}`);
}
for (const id of Object.keys(biographies)) {
  if (!ids.has(id)) errors.push(`${BIO_FILE} — identifiant inconnu : ${id}`);
}
for (const id of Object.keys(biosImportees)) {
  if (!ids.has(id)) errors.push(`${BIOS_IMPORTEES_FILE} — identifiant inconnu : ${id}`);
}
for (const [id, t] of Object.entries(traductions)) {
  if (!ids.has(id)) errors.push(`${TRAD_FILE} — identifiant inconnu : ${id}`);
  if (typeof t.bio !== 'string' || !t.bio.trim()) errors.push(`${TRAD_FILE} — ${id} : traduction vide`);
}

if (errors.length) {
  console.error('\nErreurs dans les fiches de saints :');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

saints.sort((a, b) => (a.born ?? a.died) - (b.born ?? b.died));

/**
 * Le corpus part en deux fichiers, et c'est une question de temps d'attente.
 *
 * Les trois champs de texte long — la biographie, la notice, les sources —
 * font à eux seuls les trois quarts du corpus : trois mégaoctets et demi sur
 * quatre et demi. Or aucun des trois ne sert à dessiner la carte ni à
 * chercher : ils ne paraissent qu'une fois une fiche ouverte. Les charger
 * avant le premier dessin, c'était faire attendre la carte pour du texte que
 * le lecteur ne demandait pas encore.
 *
 * « saints.json » ne porte donc plus que ce qu'il faut pour placer les croix
 * et pour chercher — le patronage y reste, la recherche l'indexe. Les textes
 * vont dans « saints-texts.json », que l'application va chercher une fois la
 * carte à l'écran et fond dans les fiches à son arrivée.
 */
const CHAMPS_LOURDS = ['bio', 'desc', 'sources'];

const leger = [];
const textes = {};
for (const saint of saints) {
  const allege = { ...saint };
  const part = {};
  for (const champ of CHAMPS_LOURDS) {
    if (allege[champ] === undefined) continue;
    part[champ] = allege[champ];
    delete allege[champ];
  }
  leger.push(allege);
  if (Object.keys(part).length) textes[saint.id] = part;
}

writeFileSync(join(OUT, 'saints.json'), JSON.stringify({ saints: leger }));
writeFileSync(join(OUT, 'saints-texts.json'), JSON.stringify(textes));

const perCountry = new Set(saints.map((s) => s.country));
const perContinent = new Map();
for (const s of saints) {
  const c = countries.find((x) => x.id === s.country).continent;
  perContinent.set(c, (perContinent.get(c) || 0) + 1);
}
console.log(`  saints.json : ${saints.length} saints, ${perCountry.size} pays`);
console.log(`    ${[...perContinent].map(([k, n]) => `${k} ${n}`).join(', ')}`);

// ---------------------------------------------------------------------------
// Réservoir de candidats
// ---------------------------------------------------------------------------

// Volontairement copié sans validation : l'assistant de l'administrateur
// vérifie lui-même chaque fiche, et le réservoir contient exprès quelques
// entrées fautives pour que ce contrôle soit visible à l'usage.
const CAND_DIR = join(ROOT, 'data', 'candidats');
const candidates = [];
for (const file of readdirSync(CAND_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(CAND_DIR, file), 'utf8'));
  for (const c of raw.saints) {
    const [x, y] = project(c.lng, c.lat);
    const shift = shiftById.get(c.country) || 0;
    candidates.push({ ...c, x: Math.round(x) + shift, y: Math.round(y) });
  }
}
writeFileSync(join(OUT, 'candidates.json'), JSON.stringify({ candidates }));
console.log(`  candidates.json : ${candidates.length} fiches candidates`);

// ---------------------------------------------------------------------------
// Le second corpus : les apparitions
// ---------------------------------------------------------------------------

/**
 * Les apparitions reconnues par l'Église, sur la même carte que les saints.
 *
 * C'est un corpus **distinct**, non une variété de saints : une apparition n'est
 * pas née et n'est pas morte, elle a eu lieu. Elle porte donc une année et non
 * deux dates, un lieu et non un lieu de naissance, et un degré de reconnaissance
 * qui n'est pas celui des causes de canonisation — Lourdes et Fátima sont
 * reconnues, Medjugorje ne l'est pas.
 *
 * Le dossier tient ce que `import-apparitions.mjs` rapporte de Wikidata, ce
 * qu'on y a écrit à la main faute de coordonnées là-bas, et la table
 * d'approbation. Un corpus vide reste un cas admis : la carte le dit alors à
 * l'écran plutôt que de laisser chercher des repères qui n'existent pas. Le
 * format est décrit dans `data/apparitions/README.md`.
 */
const APPA_DIR = join(ROOT, 'data', 'apparitions');
const APPA_REQUIS = ['id', 'name', 'country', 'city', 'lat', 'lng', 'annee'];
const APPROBATIONS = new Set(['reconnue', 'en-cours', 'non-reconnue']);
const APPROBATION_FILE = 'approbations.json';
const apparitions = [];
const appaErrors = [];
const appaIds = new Set();
for (const file of readdirSync(APPA_DIR)
  .filter((f) => f.endsWith('.json') && f !== APPROBATION_FILE)
  .sort()) {
  const raw = JSON.parse(readFileSync(join(APPA_DIR, file), 'utf8'));
  for (const a of raw.apparitions || []) {
    const where = `${file}:${a.id ?? '?'}`;
    for (const field of APPA_REQUIS) {
      if (a[field] === undefined || a[field] === null) appaErrors.push(`${where} — champ « ${field} » manquant`);
    }
    if (appaIds.has(a.id)) appaErrors.push(`${where} — identifiant en double`);
    appaIds.add(a.id);
    // Un identifiant partagé avec un saint casserait « ?saint= » et les deux
    // index de pages : une adresse ne peut désigner qu'une chose.
    if (ids.has(a.id)) appaErrors.push(`${where} — identifiant déjà porté par un saint`);
    if (!seen.has(a.country)) appaErrors.push(`${where} — pays inconnu : ${a.country}`);
    if (Math.abs(a.lat) > 85 || Math.abs(a.lng) > 180) appaErrors.push(`${where} — coordonnées hors limites`);
    if (a.feast != null && !/^\d{2}-\d{2}$/.test(a.feast)) appaErrors.push(`${where} — fête mal formée : ${a.feast}`);
    if (a.approbation != null && !APPROBATIONS.has(a.approbation)) {
      appaErrors.push(`${where} — approbation inconnue : ${a.approbation}`);
    }
    if (a.anneeFin != null && a.anneeFin < a.annee) appaErrors.push(`${where} — finit avant de commencer`);

    const [x, y] = project(a.lng, a.lat);
    const shift = shiftById.get(a.country) || 0;
    // `kind` est porté par la fiche : c'est lui qui fait dire « Lieu » et
    // « Année » là où un saint fait dire « Naissance » et « Mort ».
    apparitions.push({ ...a, kind: 'apparition', x: Math.round(x) + shift, y: Math.round(y) });
  }
}

/**
 * Deux éléments pour une apparition, et deux croix au même endroit.
 *
 * Wikidata tient souvent l'événement — « Apparitions mariales de Kibeho » — et
 * le vocable sous lequel on la prie — « Notre-Dame de Kibeho » — comme deux
 * éléments distincts. Ce sont deux articles, non deux apparitions. La table
 * dit lequel on garde et pourquoi ; l'écarté y verse ce qu'il avait de plus,
 * par la même fonction que les doublons de saints, puis disparaît.
 */
const APPA_DOUBLONS_FILE = 'doublons.json';
let appaDoublons = [];
try {
  appaDoublons = JSON.parse(readFileSync(join(APPA_DIR, APPA_DOUBLONS_FILE), 'utf8')).doublons || [];
} catch { /* pas de table : le corpus reste tel quel */ }

const appaParId = new Map(apparitions.map((a) => [a.id, a]));
const appaEcartes = new Set();
for (const { garde, ecarte } of appaDoublons) {
  const a = appaParId.get(garde);
  const b = appaParId.get(ecarte);
  if (!a) { appaErrors.push(`${APPA_DOUBLONS_FILE} — identifiant gardé inconnu : ${garde}`); continue; }
  if (!b) { appaErrors.push(`${APPA_DOUBLONS_FILE} — identifiant écarté inconnu : ${ecarte}`); continue; }
  if (appaEcartes.has(garde)) {
    appaErrors.push(`${APPA_DOUBLONS_FILE} — ${garde} est gardé ici et écarté ailleurs`);
    continue;
  }
  verser(a, b);
  appaEcartes.add(ecarte);
}
if (appaEcartes.size) {
  const avant = apparitions.length;
  for (let i = apparitions.length - 1; i >= 0; i -= 1) {
    if (appaEcartes.has(apparitions[i].id)) apparitions.splice(i, 1);
  }
  console.log(`Apparitions : ${avant - apparitions.length} fiches fondues dans la leur`);
}

/**
 * Ce que l'Église a dit, quand elle l'a dit.
 *
 * Wikidata ne porte pas l'approbation de façon fiable, et l'importateur ne pose
 * ce mot que lorsqu'un texte l'écrit en toutes lettres. Le reste se tranche à la
 * main, dans `approbations.json`, où chaque ligne porte sa raison — et la main
 * l'emporte sur la machine, jamais l'inverse.
 *
 * Les motifs qui n'ont servi à rien sont annoncés : un fichier d'autorité dont
 * la moitié des lignes ne s'applique plus est un fichier qui pourrit sans
 * qu'on le sache.
 */
let reglesApprobation = [];
try {
  reglesApprobation = JSON.parse(readFileSync(join(APPA_DIR, APPROBATION_FILE), 'utf8'))
    .approbations || [];
} catch { /* pas de table : ce que dit l'import fera foi */ }

const appaComptes = { main: 0, texte: 0, muet: 0 };
const inemployes = new Set(reglesApprobation.map((r) => r.motif));
for (const apparition of apparitions) {
  // Le motif s'éprouve contre le **nom seul**, jamais contre la localité :
  // « Notre-Dame de l'Ortigue », apparue à Fátima en 1758, n'est pas celle de
  // 1917, et la reconnaissance de l'une n'est pas celle de l'autre. Un lieu
  // porte plusieurs apparitions ; un nom n'en porte qu'une.
  // L'identifiant est joint au nom : il est tiré du nom pour une fiche
  // importée, mais une fiche écrite à la main y ajoute son lieu, ce qui permet
  // de distinguer deux vocables homonymes — il y a des dizaines de
  // « Notre-Dame du Bon Secours », une seule à Champion.
  const cible = `${fold(apparition.name?.fr || apparition.name?.en || apparition.name || '')} ${fold(apparition.id)}`;
  const regle = reglesApprobation.find((r) => {
    try { return new RegExp(r.motif, 'i').test(cible); } catch { return false; }
  });
  if (regle) {
    if (!APPROBATIONS.has(regle.valeur)) {
      appaErrors.push(`${APPROBATION_FILE} : « ${regle.motif} » vaut « ${regle.valeur} », qui n’est pas une approbation`);
    }
    apparition.approbation = regle.valeur;
    apparition.approbationDe = 'main';
    inemployes.delete(regle.motif);
    appaComptes.main += 1;
  } else if (apparition.approbation) {
    apparition.approbationDe = 'texte';
    appaComptes.texte += 1;
  } else {
    appaComptes.muet += 1;
  }
}

if (appaErrors.length) {
  console.error('\nErreurs dans les fiches d’apparitions :');
  for (const e of appaErrors) console.error(`  - ${e}`);
  process.exit(1);
}

if (apparitions.length) {
  console.log(`Approbations : ${appaComptes.main} tranchées à la main, `
    + `${appaComptes.texte} lues dans le texte, ${appaComptes.muet} sans mot`);
  if (inemployes.size) {
    console.log(`  motifs sans emploi : ${[...inemployes].join(', ')}`);
  }
}

apparitions.sort((a, b) => a.annee - b.annee);
writeFileSync(join(OUT, 'apparitions.json'), JSON.stringify({ apparitions }));
console.log(`  apparitions.json : ${apparitions.length} apparitions`);

// ---------------------------------------------------------------------------
// Fond documentaire de l'assistant expert
// ---------------------------------------------------------------------------

// Ce que le modèle de langue faisait de mémoire — dire qui était un saint, de
// quoi il est patron, où il est né et où il est mort — est ici écrit une fois
// pour toutes et livré avec l'application. L'assistant y cherche par le nom ;
// il ne devine rien, il consulte.
const REF_DIR = join(ROOT, 'data', 'reference');
const entries = [];
const aliases = {};
for (const file of readdirSync(REF_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(REF_DIR, file), 'utf8'));
  if (raw.aliases) {
    // Les graphies acceptées : « Assise » et « Roma » doivent mener à la
    // localité que la table connaît sous « Assisi » et « Rome ».
    for (const { country, name, aka } of raw.aliases) {
      const table = aliases[country] || (aliases[country] = {});
      for (const form of [name, ...(aka || [])]) table[fold(form)] = name;
    }
    continue;
  }
  // Le dossier accueille aussi des tables qui ne sont ni des fiches ni des
  // graphies — les compléments de nom des pays, par exemple. Elles ne
  // concernent pas le fond documentaire : on les laisse à qui les lit.
  if (!Array.isArray(raw.saints)) continue;
  for (const saint of raw.saints) entries.push(saint);
}

// Le réservoir de l'assistant autonome entre lui aussi dans le fond : ses
// fiches portent déjà dates, fête, qualités, patronage et notice, et rien ne
// justifie de faire ressaisir à la main ce qui est écrit deux dossiers plus
// loin. Elles n'ont pas d'histoire rédigée — c'est la seule différence, et
// l'atelier laisse le champ vide plutôt que de l'inventer.
const FEAST_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const byId = new Map(countries.map((c) => [c.id, c]));

/** Le point tombe-t-il dans le cadre du pays annoncé, à 8 % près ? */
function insideBox(country, lat, lng) {
  const [x, y] = project(lng, lat);
  const box = country.bbox;
  const shifted = country.focus[0] > WORLD_SIZE ? x + WORLD_SIZE : x;
  const w = (box[2] - box[0]) * 0.08;
  const h = (box[3] - box[1]) * 0.08;
  return shifted >= box[0] - w && shifted <= box[2] + w
    && y >= box[1] - h && y <= box[3] + h;
}
const namesInFond = new Set(entries.flatMap(
  (e) => [...Object.values(e.name), ...(e.aka || [])].map(fold),
));
let fromPool = 0;
for (const c of candidates) {
  // Les fiches volontairement fautives du réservoir servent à démontrer la
  // vérification ; elles n'ont rien à faire dans un fond de consultation.
  const country = byId.get(c.country);
  if (!country || !FEAST_RE.test(String(c.feast))) continue;
  if (!insideBox(country, c.lat, c.lng)) continue;
  if (c.born != null && c.died != null && c.died < c.born) continue;
  const forms = Object.values(c.name || {}).filter(Boolean);
  if (forms.some((n) => namesInFond.has(fold(n)))) continue;
  for (const n of forms) namesInFond.add(fold(n));
  entries.push({
    id: `ref-${c.id}`,
    name: c.name,
    aka: [],
    sex: c.sex,
    born: c.born ?? null,
    died: c.died ?? null,
    circa: Boolean(c.circa),
    feast: c.feast,
    titles: c.titles || [],
    patronage: c.patronage,
    desc: c.desc,
    birth: { city: c.city, country: c.country, lat: c.lat, lng: c.lng },
    source: 'pool',
  });
  fromPool += 1;
}

writeFileSync(join(OUT, 'reference.json'), JSON.stringify({ entries, aliases }));
const aliasCount = Object.values(aliases).reduce((n, t) => n + Object.keys(t).length, 0);
console.log(`  reference.json : ${entries.length} fiches de référence`
  + ` (dont ${fromPool} venues du réservoir), ${aliasCount} graphies de lieux`);

console.log('Terminé.');
