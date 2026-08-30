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

const saints = [];
const ids = new Set();
const errors = [];

// Les patronages vivent dans leur propre fichier : ils s'ajoutent à des
// centaines de fiches sans qu'il faille rouvrir chacune d'elles.
const PATRONAGE_FILE = 'patronages.json';
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

for (const file of readdirSync(SAINTS_DIR)
  .filter((f) => f.endsWith('.json') && f !== PATRONAGE_FILE && f !== BIO_FILE).sort()) {
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
    if (s.born != null && s.died != null && s.died < s.born) errors.push(`${where} — mort avant la naissance`);

    const [x, y] = project(s.lng, s.lat);
    const shift = shiftById.get(s.country) || 0;
    const record = { ...s, x: Math.round(x) + shift, y: Math.round(y) };
    if (patronages[s.id]) record.patronage = patronages[s.id];
    // Une biographie écrite dans la fiche a priorité sur celle qui est
    // rapportée : la main l'emporte sur la machine, jamais l'inverse.
    const rapportee = biographies[s.id];
    if (rapportee && !s.bio) {
      record.bio = rapportee.bio;
      record.sources = [...(s.sources || []), ...rapportee.sources];
    }
    saints.push(record);
  }
}

for (const id of Object.keys(patronages)) {
  if (!ids.has(id)) errors.push(`${PATRONAGE_FILE} — identifiant inconnu : ${id}`);
}
for (const id of Object.keys(biographies)) {
  if (!ids.has(id)) errors.push(`${BIO_FILE} — identifiant inconnu : ${id}`);
}

if (errors.length) {
  console.error('\nErreurs dans les fiches de saints :');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

saints.sort((a, b) => (a.born ?? a.died) - (b.born ?? b.died));
writeFileSync(join(OUT, 'saints.json'), JSON.stringify({ saints }));

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
