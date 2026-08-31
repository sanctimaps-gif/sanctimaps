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
import { coherent } from './lib/dates.mjs';
import { extracts, shorten, sleep, sparql } from './lib/wikimedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  endpoint: 'https://query.wikidata.org/sparql',
  out: join(ROOT, 'data', 'saints', 'wikidata.json'),
  limit: 0,
  status: '',
  names: '',
  pause: 300,
  chunk: 200,
  countries: [],
  wikipedia: 'https://{lang}.wikipedia.org',
  bios: true,
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
    else if (arg === '--countries') options.countries = String(next()).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    else if (arg === '--wikipedia') options.wikipedia = next();
    else if (arg === '--no-bios') options.bios = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

/**
 * Les faits, pour un pays.
 *
 * La première version demandait tout d'un coup, en paginant : le service
 * public l'a coupée à soixante secondes. La pagination n'y pouvait rien, car
 * `ORDER BY` oblige le moteur à trier l'ensemble des solutions avant de rendre
 * la première tranche — la découpe multipliait le travail au lieu de le
 * réduire.
 *
 * On part donc du code ISO du pays, qui est une chaîne littérale et donc le
 * point d'entrée le plus sélectif qui soit : de là, le moteur ne visite que
 * les lieux de ce pays et les personnes qui y sont nées. Deux cent trente
 * petites requêtes valent mieux qu'une qui n'aboutit pas.
 *
 * `P411` est le statut de canonisation : la propriété ne s'applique qu'aux
 * saints, bienheureux et vénérables, ce qui dispense de nommer des
 * identifiants qu'on recopierait de mémoire — et de travers.
 */
const byCountry = (iso) => `
SELECT ?s ?statusEn ?nameFr ?nameEn ?nameLa ?descFr ?descEn
       ?born ?bornPrec ?died ?diedPrec ?sex ?feastEn ?placeFr ?placeEn ?coord WHERE {
  ?country wdt:P298 "${iso}" .
  ?place wdt:P17 ?country ; wdt:P625 ?coord .
  ?s wdt:P19 ?place ; wdt:P411 ?status ; wdt:P841 ?feast .
  # La précision se lit sur le nœud de déclaration, jamais sur la valeur
  # simple : « +0200 » ne dit pas s'il faut lire « 200 » ou « IIe siècle ».
  # On la rattache à la valeur retenue, pour ne pas prendre celle d'une
  # déclaration concurrente.
  OPTIONAL { ?s wdt:P569 ?born .
             OPTIONAL { ?s p:P569/psv:P569 [ wikibase:timeValue ?born ;
                                             wikibase:timePrecision ?bornPrec ] } }
  OPTIONAL { ?s wdt:P570 ?died .
             OPTIONAL { ?s p:P570/psv:P570 [ wikibase:timeValue ?died ;
                                             wikibase:timePrecision ?diedPrec ] } }
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

/** Le complément se demande par lots d'identifiants déjà connus. */
const values = (ids) => `VALUES ?s { ${ids.map((q) => `wd:${q}`).join(' ')} }`;

const patronageFor = (ids) => `
SELECT ?s ?labelFr ?labelEn WHERE {
  ${values(ids)}
  ?s wdt:P2925 ?domain .
  OPTIONAL { ?domain rdfs:label ?labelFr . FILTER(LANG(?labelFr) = "fr") }
  OPTIONAL { ?domain rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
}`;

const occupationFor = (ids) => `
SELECT ?s ?labelEn WHERE {
  ${values(ids)}
  { ?s wdt:P106 ?job } UNION { ?s wdt:P39 ?job }
  ?job rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en")
}`;

/** Les titres d'article, d'où l'on tirera la biographie. */
const articlesFor = (ids) => `
SELECT ?s ?wikiFr ?wikiEn WHERE {
  ${values(ids)}
  OPTIONAL { ?artFr schema:about ?s ; schema:isPartOf <https://fr.wikipedia.org/> ;
             schema:name ?wikiFr }
  OPTIONAL { ?artEn schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> ;
             schema:name ?wikiEn }
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
/**
 * La précision d'une date, telle que Wikidata la compte.
 *
 * 6 le millénaire, 7 le siècle, 8 la décennie, 9 l'année, 11 le jour. Rien
 * au-delà de 11 ne concerne un saint, et rien en deçà de 6 n'est lisible : on
 * garde le nombre tel quel et l'affichage décide quoi en dire.
 */
function precisionOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 14 ? n : null;
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
  --chunk N        taille des lots d'identifiants (défaut : 200)
  --countries A,B  n'interroger que ces pays, par code à trois lettres
  --no-bios        ne pas aller chercher les biographies sur Wikipédia
  --wikipedia URL  adresse de Wikipédia, « {lang} » valant la langue
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

  // Un pays à la fois : chaque requête reste courte, et l'on voit avancer.
  const isoList = options.countries.length
    ? options.countries.filter((iso) => countries.has(iso))
    : [...countries.keys()];
  const rows = [];
  const failures = [];
  let done = 0;
  for (const iso of isoList) {
    let page;
    try {
      page = await sparql(options.endpoint, byCountry(iso), options);
    } catch (error) {
      // Un pays qui résiste ne doit pas emporter toute la collecte.
      console.warn(`  ${iso} : ${error.message}`);
      failures.push(iso);
      done += 1;
      await sleep(options.pause);
      continue;
    }
    // Le pays est connu par la boucle, non par la réponse.
    rows.push(...page.map((row) => ({ ...row, iso: { type: 'literal', value: iso } })));
    done += 1;
    if (page.length) {
      console.log(`  ${iso} : ${page.length} — ${rows.length} au total`
        + ` (${done}/${isoList.length} pays)`);
    } else if (done % 25 === 0) {
      console.log(`  … ${done}/${isoList.length} pays, ${rows.length} lignes`);
    }
    await sleep(options.pause);
  }
  console.log(`${rows.length} lignes de faits, sur ${isoList.length} pays.`);
  if (failures.length) {
    console.warn(`${failures.length} pays n'ont pas répondu : ${failures.join(', ')}`);
  }

  // Le complément, par lots d'identifiants : le moteur part d'un ensemble déjà
  // réduit, ce qui rend ces requêtes courtes elles aussi.
  const allIds = [...new Set(rows.map((row) => idOf(row.s?.value)).filter(Boolean))];
  const patronRows = [];
  const jobRows = [];
  const articleRows = [];
  for (let i = 0; i < allIds.length; i += options.chunk) {
    const batch = allIds.slice(i, i + options.chunk);
    patronRows.push(...await sparql(options.endpoint, patronageFor(batch), options));
    await sleep(options.pause);
    jobRows.push(...await sparql(options.endpoint, occupationFor(batch), options));
    await sleep(options.pause);
    if (options.bios) {
      articleRows.push(...await sparql(options.endpoint, articlesFor(batch), options));
      await sleep(options.pause);
    }
    console.log(`  compléments : ${Math.min(i + options.chunk, allIds.length)}/${allIds.length}`);
  }

  // Les biographies : un titre d'article par saint et par langue, puis les
  // introductions, que Wikipédia rend déjà en texte simple.
  const articles = new Map();
  for (const row of articleRows) {
    const id = idOf(row.s?.value);
    const entry = articles.get(id) || {};
    if (row.wikiFr?.value) entry.fr = row.wikiFr.value;
    if (row.wikiEn?.value) entry.en = row.wikiEn.value;
    articles.set(id, entry);
  }
  const bios = { fr: new Map(), en: new Map() };
  if (options.bios) {
    for (const lang of ['fr', 'en']) {
      const titles = [...new Set([...articles.values()].map((a) => a[lang]).filter(Boolean))];
      if (titles.length) bios[lang] = await extracts(lang, titles, options);
    }
  }

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

    // Quand Wikidata n'a pas de libellé français, le titre de l'article
    // français en tient lieu : « Romulus de Fiesole » vaut mieux que
    // « Romulus of Fiesole » sur une carte lue en français. La parenthèse de
    // désambiguïsation ne fait pas partie du nom — « Daniel (prophète) » se
    // lit « Daniel ».
    const frArticle = String(articles.get(qid)?.fr || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const fr = row.nameFr?.value || frArticle;
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
    const bornPrec = precisionOf(row.bornPrec?.value);
    const diedPrec = precisionOf(row.diedPrec?.value);
    if (born == null && died == null) { dropped.dates += 1; continue; }
    if (!coherent(born, died, bornPrec, diedPrec)) { dropped.dates += 1; continue; }

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
      // La précision ne voyage que lorsqu'elle est plus grossière qu'une
      // année : ailleurs, elle n'apprendrait rien et pèserait sur le fichier.
      ...(bornPrec != null && bornPrec < 9 ? { bornPrec } : {}),
      ...(diedPrec != null && diedPrec < 9 ? { diedPrec } : {}),
      // « Vers » ne se dit que d'une année : un siècle n'est pas une date
      // approchée, c'est une autre échelle, et l'affichage la nomme.
      circa: (bornPrec ?? 9) >= 9,
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

    // La biographie vient de l'introduction de l'article, réduite à trois
    // phrases. Le texte est sous licence CC BY-SA : l'adresse de l'article
    // rejoint donc les sources de la fiche, ce n'est pas facultatif.
    const article = articles.get(qid) || {};
    const bio = {};
    for (const lang of ['fr', 'en']) {
      const title = article[lang];
      const text = title ? bios[lang].get(title) : null;
      const petite = shorten(text);
      if (petite) {
        bio[lang] = petite;
        fiche.sources.push({
          label: `Wikipédia (${lang})`,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        });
      }
    }
    if (bio.fr || bio.en) fiche.bio = bio;

    seen.add(qid);
    saints.push(fiche);
    if (options.limit && saints.length >= options.limit) break;
  }

  saints.sort((a, b) => (a.born ?? a.died) - (b.born ?? b.died));

  const avecBio = saints.filter((s) => s.bio).length;
  console.log(`\n${saints.length} fiches retenues, dont ${avecBio} avec une biographie.`);
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
