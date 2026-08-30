/**
 * Importe en masse les saints de l'Église catholique depuis Wikidata.
 *
 *   node tools/import-saints.mjs                    # tout ce qui est plaçable
 *   node tools/import-saints.mjs --limit 200        # un échantillon, pour voir
 *   node tools/import-saints.mjs --dry-run          # compte sans rien écrire
 *   node tools/import-saints.mjs --status saint     # les canonisés seulement
 *
 * ## Pourquoi Wikidata, quand on nous donne trois listes
 *
 * Une carte a besoin de **coordonnées**. Les listes de noms — celle de
 * Wikipédia, celle de Nominis, celle de Vie chrétienne — n'en portent pas :
 * elles donnent un nom, parfois un siècle, jamais un point. Wikidata, si, et
 * c'est la même connaissance sous une forme que la machine peut lire : lieu de
 * naissance, coordonnées de ce lieu, pays, jour de fête, patronage, qualités.
 *
 * S'y ajoute une raison de droit. Wikidata est en CC0 et Wikipédia en CC BY-SA
 * — l'une et l'autre réutilisables, la seconde à condition de citer, ce que
 * chaque fiche importée fait. Les notices de Nominis (Conférence des évêques
 * de France) et de Vie chrétienne sont, elles, protégées : leurs textes ne
 * peuvent pas être versés ici. Leurs *listes de noms* restent utiles comme
 * pense-bête — voyez `--names`, qui n'importe que les noms d'un fichier.
 *
 * ## Ce qui entre, et ce qui n'entre pas
 *
 * N'entre que ce qui est plaçable et vérifiable : un statut de canonisation,
 * un lieu de naissance pourvu de coordonnées, un pays que la carte connaît,
 * une date de fête bien formée, au moins une année. Le reste est compté et
 * annoncé, non deviné. C'est pourquoi le total importé sera toujours inférieur
 * au nombre de saints que l'Église reconnaît : la différence, ce sont les
 * fiches dont on ignore où poser la croix.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fold } from '../src/js/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Wikimedia demande qu'un outil se nomme et laisse une adresse de contact. */
const AGENT = 'SanctiMaps/1.0 (https://github.com/sanctimaps-gif/sanctimaps) import-saints.mjs';

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  out: join(ROOT, 'data', 'saints', 'wikidata.json'),
  limit: 0,
  status: '',
  names: '',
  pause: 400,
  chunk: 1000,
  dryRun: false,
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/** Qualités reconnues, par le libellé anglais de la fonction ou du métier. */
const TITLE_BY_LABEL = [
  [/\bpope\b/, 'pope'], [/\bcardinal\b/, 'cardinal'], [/\b(arch)?bishop\b/, 'bishop'],
  [/\babbess\b/, 'abbess'], [/\babbot\b/, 'abbot'], [/\bdeacon\b/, 'deacon'],
  [/\bpriest\b|\bpresbyter\b/, 'priest'], [/\bnun\b/, 'nun'],
  [/\bmonk\b|\bfriar\b/, 'monk'], [/\bhermit\b|\banchorite\b/, 'hermit'],
  [/\bmartyr\b/, 'martyr'], [/\bmissionary\b/, 'missionary'], [/\bmystic\b/, 'mystic'],
  [/\bpreacher\b/, 'preacher'], [/\bfounder\b/, 'founder'],
  [/\btheologian\b|\bdoctor of the church\b/, 'doctor'], [/\bapostle\b/, 'apostle'],
  [/\bevangelist\b/, 'evangelist'], [/\bprophet\b/, 'prophet'],
  [/\bqueen\b|\bempress\b/, 'queen'], [/\bking\b|\bemperor\b/, 'king'],
  [/\bprince\b|\bduke\b/, 'prince'], [/\bsoldier\b|\bknight\b/, 'soldier'],
  [/\bvirgin\b/, 'virgin'], [/\bwidow\b/, 'widow'], [/\bpilgrim\b/, 'pilgrim'],
  [/\breligious\b/, 'religious'],
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i += 1];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--out') options.out = next();
    else if (arg === '--endpoint') options.endpoint = next();
    else if (arg === '--status') options.status = String(next()).toLowerCase();
    else if (arg === '--names') options.names = next();
    else if (arg === '--pause') options.pause = Number(next());
    else if (arg === '--chunk') options.chunk = Number(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Interroge le service SPARQL.
 *
 * Le point d'entrée public rend un 429 quand on le presse : on attend et l'on
 * recommence, trois fois, plutôt que de perdre une heure de collecte.
 */
async function sparql(endpoint, query, { pause }) {
  const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': AGENT },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status !== 429 && res.status !== 503) {
      throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`);
    }
    await sleep(pause * (attempt + 2) * 5);
  }
  throw new Error('service surchargé après trois tentatives');
}

/**
 * Interroge par tranches.
 *
 * Le point d'entrée public coupe une requête au bout d'une minute, et la
 * collecte entière dépasse largement ce délai. On la découpe donc, ce qui a
 * l'avantage de montrer l'avancement : une collecte muette de dix minutes
 * ressemble trop à une panne.
 */
async function collect(endpoint, query, options, label) {
  const rows = [];
  for (let offset = 0; ; offset += options.chunk) {
    const page = await sparql(
      endpoint, `${query}\nORDER BY ?s LIMIT ${options.chunk} OFFSET ${offset}`, options,
    );
    rows.push(...page);
    process.stdout.write(`\r  ${label} : ${rows.length} lignes`);
    if (page.length < options.chunk) break;
    await sleep(options.pause);
  }
  process.stdout.write('\n');
  return rows;
}

/**
 * Les faits, un saint par ligne.
 *
 * `P411` est le statut de canonisation : la propriété ne s'applique qu'aux
 * saints, bienheureux et vénérables, ce qui dispense de nommer des
 * identifiants qu'on recopierait de mémoire — et de travers. Le statut est
 * rendu en clair, l'appelant filtre s'il veut.
 */
const CORE = `
SELECT ?s ?statusEn ?nameFr ?nameEn ?nameLa ?descFr ?descEn
       ?born ?died ?sex ?feastEn ?placeFr ?placeEn ?coord ?iso WHERE {
  ?s wdt:P411 ?status .
  ?s wdt:P19 ?place .
  ?place wdt:P625 ?coord .
  ?place wdt:P17 ?country .
  ?country wdt:P298 ?iso .
  ?s wdt:P841 ?feast .
  OPTIONAL { ?s wdt:P569 ?born }
  OPTIONAL { ?s wdt:P570 ?died }
  OPTIONAL { ?s wdt:P21 ?sex }
  OPTIONAL { ?status rdfs:label ?statusEn . FILTER(LANG(?statusEn) = "en") }
  OPTIONAL { ?feast rdfs:label ?feastEn . FILTER(LANG(?feastEn) = "en") }
  OPTIONAL { ?s rdfs:label ?nameFr . FILTER(LANG(?nameFr) = "fr") }
  OPTIONAL { ?s rdfs:label ?nameEn . FILTER(LANG(?nameEn) = "en") }
  OPTIONAL { ?s rdfs:label ?nameLa . FILTER(LANG(?nameLa) = "la") }
  OPTIONAL { ?s schema:description ?descFr . FILTER(LANG(?descFr) = "fr") }
  OPTIONAL { ?s schema:description ?descEn . FILTER(LANG(?descEn) = "en") }
  OPTIONAL { ?place rdfs:label ?placeFr . FILTER(LANG(?placeFr) = "fr") }
  OPTIONAL { ?place rdfs:label ?placeEn . FILTER(LANG(?placeEn) = "en") }
}`;

/** Les patronages, plusieurs lignes par saint. */
const PATRONAGE = `
SELECT ?s ?labelFr ?labelEn WHERE {
  ?s wdt:P411 ?status .
  ?s wdt:P19 ?place . ?place wdt:P625 ?coord .
  ?s wdt:P2925 ?domain .
  OPTIONAL { ?domain rdfs:label ?labelFr . FILTER(LANG(?labelFr) = "fr") }
  OPTIONAL { ?domain rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
}`;

/** Les fonctions et métiers, plusieurs lignes par saint. */
const OCCUPATION = `
SELECT ?s ?labelEn WHERE {
  ?s wdt:P411 ?status .
  ?s wdt:P19 ?place . ?place wdt:P625 ?coord .
  { ?s wdt:P106 ?job } UNION { ?s wdt:P39 ?job }
  ?job rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en")
}`;

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const idOf = (uri) => String(uri || '').replace(/^.*\/entity\//, '');

/** « Point(3.0035 43.1841) » -> [longitude, latitude]. */
function pointOf(wkt) {
  const match = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(String(wkt || ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/** Année d'un instant, signe compris ; `null` si la date est trop vague. */
function yearOf(value) {
  const match = /^([+-]?)(\d{4,})-/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[2]);
  if (!year) return null;
  return match[1] === '-' ? -year : year;
}

/** « 6 March » ou « March 6 » -> « 03-06 ». */
function feastOf(text) {
  const lower = String(text || '').toLowerCase();
  const month = MONTHS.findIndex((name) => lower.includes(name));
  const day = /(\d{1,2})/.exec(lower);
  if (month < 0 || !day) return '';
  const n = Number(day[1]);
  if (n < 1 || n > 31) return '';
  return `${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

/** Identifiant lisible tiré du nom, suffixé de l'identifiant Wikidata. */
function slug(name, qid) {
  const base = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `wd-${base || 'saint'}-${qid.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Corpus déjà en place
// ---------------------------------------------------------------------------

/**
 * Les noms déjà présents, pour ne pas doubler ce qui a été écrit à la main.
 *
 * Une fiche rédigée vaut mieux qu'une fiche importée : à nom égal, c'est
 * l'importée qui cède.
 */
function existingNames(outFile) {
  const dir = join(ROOT, 'data', 'saints');
  const names = new Set();
  const ids = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    if (join(dir, file) === outFile) continue;
    if (file === 'patronages.json') continue;
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const s of raw.saints || []) {
      ids.add(s.id);
      for (const value of Object.values(s.name || {})) if (value) names.add(fold(value));
    }
  }
  return { names, ids };
}

/** Les pays que la carte connaît. */
function knownCountries() {
  const world = JSON.parse(readFileSync(join(ROOT, 'data', 'generated', 'world.json'), 'utf8'));
  return new Map(world.countries.map((c) => [c.id, c]));
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
// Marche
// ---------------------------------------------------------------------------

const HELP = `Importe les saints depuis Wikidata.

  --limit N        n'écrire que les N premières fiches
  --status MOT     ne garder que ce statut de canonisation (saint, blessed…)
  --names FICHIER  n'importer que les noms listés dans ce fichier, un par ligne
  --out FICHIER    fichier de sortie (défaut : data/saints/wikidata.json)
  --endpoint URL   point d'entrée SPARQL
  --pause MS       attente entre deux requêtes (défaut : 400)
  --chunk N        taille des tranches (défaut : 1000)
  --dry-run        compter sans écrire
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const world = JSON.parse(readFileSync(join(ROOT, 'data', 'generated', 'world.json'), 'utf8'));
  const countries = knownCountries();
  const { names: taken, ids: takenIds } = existingNames(options.out);

  const wanted = options.names
    ? new Set(readFileSync(options.names, 'utf8').split('\n')
      .map((line) => fold(line.trim())).filter(Boolean))
    : null;

  console.log(`Interrogation de ${options.endpoint}…`);
  const rows = await collect(options.endpoint, CORE, options, 'faits');
  await sleep(options.pause);
  const patronRows = await collect(options.endpoint, PATRONAGE, options, 'patronages');
  await sleep(options.pause);
  const jobRows = await collect(options.endpoint, OCCUPATION, options, 'qualités');

  const patronage = new Map();
  for (const row of patronRows) {
    const id = idOf(row.s?.value);
    const entry = patronage.get(id) || { fr: [], en: [] };
    if (row.labelFr?.value) entry.fr.push(row.labelFr.value);
    if (row.labelEn?.value) entry.en.push(row.labelEn.value);
    patronage.set(id, entry);
  }

  const titles = new Map();
  for (const row of jobRows) {
    const id = idOf(row.s?.value);
    const text = String(row.labelEn?.value || '').toLowerCase();
    const list = titles.get(id) || [];
    for (const [pattern, key] of TITLE_BY_LABEL) {
      if (pattern.test(text) && !list.includes(key)) list.push(key);
    }
    titles.set(id, list);
  }

  const saints = [];
  const seen = new Set();
  const dropped = {
    doublon: 0, statut: 0, horsListe: 0, pays: 0, cadre: 0, fete: 0, dates: 0, nom: 0,
  };

  for (const row of rows) {
    const qid = idOf(row.s?.value);
    if (!qid || seen.has(qid)) continue;

    const status = String(row.statusEn?.value || '').toLowerCase();
    if (options.status && !status.includes(options.status)) { dropped.statut += 1; continue; }

    const fr = row.nameFr?.value || '';
    const en = row.nameEn?.value || '';
    const name = fr || en;
    if (!name) { dropped.nom += 1; continue; }
    if (wanted && !wanted.has(fold(fr)) && !wanted.has(fold(en))) {
      dropped.horsListe += 1;
      continue;
    }
    if (taken.has(fold(fr)) || taken.has(fold(en))) { dropped.doublon += 1; continue; }

    const iso = row.iso?.value;
    const country = countries.get(iso);
    if (!country) { dropped.pays += 1; continue; }

    const point = pointOf(row.coord?.value);
    if (!point) { dropped.cadre += 1; continue; }
    const [lng, lat] = point;
    if (Math.abs(lat) > 85 || Math.abs(lng) > 180) { dropped.cadre += 1; continue; }
    if (!insideBox(country, lng, lat, world.worldSize)) { dropped.cadre += 1; continue; }

    const feast = feastOf(row.feastEn?.value);
    if (!feast) { dropped.fete += 1; continue; }

    const born = yearOf(row.born?.value);
    const died = yearOf(row.died?.value);
    if (born == null && died == null) { dropped.dates += 1; continue; }
    if (born != null && died != null && died < born) { dropped.dates += 1; continue; }

    const id = slug(name, qid);
    if (takenIds.has(id)) { dropped.doublon += 1; continue; }

    const fiche = {
      id,
      name: {
        fr: fr || en,
        en: en || fr,
        ...(row.nameLa?.value ? { la: row.nameLa.value } : {}),
      },
      sex: idOf(row.sex?.value) === 'Q6581072' ? 'f' : 'm',
      born,
      died,
      circa: true,
      city: row.placeFr?.value || row.placeEn?.value || '',
      country: iso,
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      feast,
      titles: titles.get(qid) || [],
      source: 'wikidata',
      sources: [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${qid}` }],
    };

    const desc = row.descFr?.value || row.descEn?.value;
    if (desc) {
      fiche.desc = {};
      if (row.descFr?.value) fiche.desc.fr = row.descFr.value;
      if (row.descEn?.value) fiche.desc.en = row.descEn.value;
    }
    const patron = patronage.get(qid);
    if (patron?.fr.length || patron?.en.length) {
      fiche.patronage = {};
      if (patron.fr.length) fiche.patronage.fr = [...new Set(patron.fr)].join(', ');
      if (patron.en.length) fiche.patronage.en = [...new Set(patron.en)].join(', ');
    }

    seen.add(qid);
    saints.push(fiche);
    if (options.limit && saints.length >= options.limit) break;
  }

  saints.sort((a, b) => (a.born ?? a.died) - (b.born ?? b.died));

  console.log(`\n${saints.length} fiches retenues.`);
  console.log('Écartées :');
  for (const [reason, n] of Object.entries(dropped)) if (n) console.log(`  ${reason.padEnd(10)} ${n}`);

  if (options.dryRun) {
    console.log('\n--dry-run : rien n’a été écrit.');
    return;
  }

  const body = [
    '{',
    '"source": "Wikidata — import automatique",',
    '"note": "Fiches importées de Wikidata (CC0) par tools/import-saints.mjs.'
    + ' Chaque fiche garde l\'adresse de son élément d\'origine.'
    + ' Les années sont marquées approximatives : Wikidata donne souvent'
    + ' un siècle là où le corpus écrit à la main donne une date.'
    + ' Ne pas modifier à la main — le fichier est réécrit à chaque import.",',
    '"saints": [',
    saints.map((s) => JSON.stringify(s)).join(',\n'),
    ']',
    '}',
    '',
  ].join('\n');
  writeFileSync(options.out, body);
  console.log(`\nÉcrit dans ${options.out}`);
  console.log('Enchaînez avec :  npm run build:data && npm run check');
}

main().catch((error) => {
  console.error(`\nÉchec de l'import : ${error.message}`);
  process.exit(1);
});
