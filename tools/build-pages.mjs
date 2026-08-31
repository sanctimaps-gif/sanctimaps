/**
 * Génère les pages lisibles sans JavaScript, une par saint.
 *
 *   node tools/build-pages.mjs
 *   node tools/build-pages.mjs --base https://exemple.org/sanctimaps
 *   node tools/build-pages.mjs --dry-run
 *
 * ## Pourquoi des pages, quand on a déjà une carte
 *
 * La carte est une application : elle se peuple en JavaScript, à partir de
 * fichiers de données, et tout ce qu'elle montre n'existe qu'une fois le code
 * exécuté. Un moteur de recherche n'a alors qu'une page à indexer — l'accueil
 * — pour quatre mille six cents saints. Chercher « saint Odilon de Cluny » ne
 * mène nulle part ici, faute d'une page qui porte ce nom.
 *
 * Ces pages-là sont donc du HTML servi tel quel : un titre, un texte, des
 * liens. Elles ne remplacent pas la carte, elles lui donnent une porte
 * d'entrée par saint, par pays et par jour de fête — et chacune renvoie à la
 * carte, ouverte sur la fiche qu'on vient de lire.
 *
 * ## Trois familles, et le maillage qui les tient
 *
 *   saints/<nom>.html          la fiche : dates, lieu, fête, biographie, sources
 *   pays/<pays>.html           les saints nés dans ce pays
 *   calendrier/<jour>.html     les saints fêtés ce jour-là
 *
 * Une page isolée n'est jamais trouvée : chaque fiche renvoie à son pays, à
 * son jour de fête et à quelques saints voisins ; chaque index renvoie aux
 * fiches. Un lecteur — ou un robot — entré n'importe où peut parcourir le
 * corpus entier de proche en proche, et `sitemap.xml` en donne la liste
 * complète pour ceux qui préfèrent la lire d'un coup.
 *
 * ## Ce que ces pages ne font pas
 *
 * Elles ne réécrivent rien : tout ce qu'elles disent vient de
 * `data/generated/saints.json`, dans les mêmes mots que la fiche de la carte,
 * avec les mêmes sources et la même règle de langue — le français, ou rien.
 * Elles sont donc régénérées à chaque import, et ne se corrigent pas à la
 * main.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// L'internationalisation de l'application sert ici telle quelle : les pages
// doivent dire les dates dans les mêmes mots que la carte — « IIe siècle » et
// non « vers 200 ». Elle attend un document ; on lui en donne l'ombre.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const { formatFeast, formatYear, pickText, setLanguage, titleLabel } = await import('../src/js/i18n.js');
const { centuryOf } = await import('../src/js/data.js');
setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'generated');

const DEFAULTS = {
  base: 'https://sanctimaps-gif.github.io/sanctimaps',
  dryRun: false,
};

const HELP = `Génère les pages indexables du site.

  --base URL   adresse publique du site (pour les liens canoniques et le plan)
  --dry-run    compter les pages sans rien écrire
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--base') options.base = String(argv[i += 1]).replace(/\/+$/, '');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Écriture sûre
// ---------------------------------------------------------------------------

/** Rien de ce qui vient des données n'entre dans une page sans passer par là. */
function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Adresse lisible tirée d'un nom.
 *
 * Les accents tombent, les apostrophes et la ponctuation deviennent des
 * traits : « Thérèse de Lisieux » donne `therese-de-lisieux`. Une adresse se
 * tape, se recopie dans un message et se lit dans un résultat de recherche —
 * elle vaut mieux lisible que fidèle.
 */
function slug(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'saint';
}

/**
 * Des adresses distinctes, même quand deux saints portent le même nom.
 *
 * Le corpus compte plusieurs Jean et plusieurs Marie. Le premier garde le nom
 * nu, les suivants prennent un rang — jamais l'identifiant Wikidata, qui ne
 * dit rien à personne.
 */
function uniqueSlugs(items, nameOf) {
  const used = new Map();
  const out = new Map();
  for (const item of items) {
    const base = slug(nameOf(item));
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    out.set(item.id, n === 1 ? base : `${base}-${n}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------

/**
 * « 1094 » -> « 1 094 ».
 *
 * L'espace est fine et insécable : c'est l'usage français, et elle empêche un
 * nombre de se casser en fin de ligne.
 */
const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * « 09-04 » -> « 4 septembre », pour les adresses et les titres.
 *
 * C'est la date de la carte, mot pour mot — « 1er novembre » et non
 * « 1 novembre » : une page qui nommerait le jour autrement que le lien qui y
 * mène ferait douter de l'une ou de l'autre.
 */
const dayLabel = (key) => formatFeast(key);

/**
 * L'enveloppe commune à toutes les pages.
 *
 * `up` dit de combien de dossiers il faut remonter pour retrouver la racine :
 * les liens entre pages sont relatifs, de sorte que le site fonctionne aussi
 * bien à la racine d'un domaine que dans un sous-dossier, et se relit tel quel
 * depuis un disque. Seules l'adresse canonique et le plan du site sont
 * absolues, parce qu'elles doivent l'être.
 */
function page({ title, description, canonical, up, crumbs, body, jsonld, trail, items }) {
  const r = '../'.repeat(up);
  // Le fil d'Ariane est écrit deux fois : en clair pour le lecteur, en
  // JSON-LD pour le moteur, qui en tire la place de la page dans le site.
  const blocs = [
    jsonld,
    trail?.length ? {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map(([nom, href], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: nom,
        ...(href ? { item: href } : {}),
      })),
    } : null,
    // Une page de liste dit ce qu'elle liste : le moteur sait alors qu'il a
    // affaire à un index et non à un article qui répéterait des noms.
    items?.length ? {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.slice(0, 100).map(([nom, href], i) => ({
        '@type': 'ListItem', position: i + 1, name: nom, url: href,
      })),
    } : null,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="SanctiMaps">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>✝</text></svg>">
<link rel="stylesheet" href="${r}src/css/page.css">
<script>
// Le thème choisi sur la carte vaut aussi ici, et se pose avant le premier
// rendu : une page claire qui vire au sombre après coup se voit.
try {
  var saved = localStorage.getItem('sanctimaps.theme.v1');
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
} catch (e) { /* sans stockage, on suit le navigateur */ }
</script>
${blocs.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>\n`).join('')}</head>
<body>
<header class="top">
  <div class="top__in">
    <a class="top__brand" href="${r}index.html">SanctiMaps</a>
    <nav class="top__nav">
      <a href="${r}index.html">La carte</a>
      <a href="${r}saints/index.html">Tous les saints</a>
      <a href="${r}pays/index.html">Par pays</a>
      <a href="${r}lieux/index.html">Par lieu</a>
      <a href="${r}epoques/index.html">Par siècle</a>
      <a href="${r}calendrier/index.html">Calendrier</a>
    </nav>
  </div>
</header>
<div class="wrap">
${crumbs ? `<nav class="crumbs">${crumbs}</nav>\n` : ''}${body}
<footer class="foot">
  <p>SanctiMaps — carte mondiale des saints de l’Église catholique.
  Données de <a href="https://www.wikidata.org/" rel="noreferrer">Wikidata</a> (CC0)
  et de <a href="https://fr.wikipedia.org/" rel="noreferrer">Wikipédia</a> (CC BY-SA).</p>
</footer>
</div>
</body>
</html>
`;
}

/** Une ligne de repère : rien ne s'affiche si l'on ne sait rien. */
const fact = (key, value) => (value
  ? `  <div><dt>${esc(key)}</dt><dd>${value}</dd></div>\n` : '');

/** Une vignette de liste, pour les index et les listes de voisins. */
const card = (href, name, meta) => `  <li><a href="${esc(href)}"><b>${esc(name)}</b>`
  + `${meta ? `<span>${esc(meta)}</span>` : ''}</a></li>\n`;

// ---------------------------------------------------------------------------
// Les pages
// ---------------------------------------------------------------------------

/**
 * « Saint » ou « Sainte » devant le nom — sauf quand il y est déjà.
 *
 * Cent vingt fiches portent le titre dans leur nom même : « Sainte Sophie »,
 * « Saint Amadour ». Le préfixer sans regarder donnerait « Sainte Sainte
 * Sophie », et sur la page comme dans le titre de l'onglet.
 */
function called(saint) {
  const name = saint.name.fr || saint.name.en;
  if (/^(saints?|sainte?s?|ste?s?\.?)\s/i.test(name)) return name;
  return `${saint.sex === 'f' ? 'Sainte' : 'Saint'} ${name}`;
}

/** L'accord au féminin, pour « fêtée », « née », « morte ». */
const e = (saint) => (saint.sex === 'f' ? 'e' : '');

/**
 * Une description de moins de trois cents signes, coupée entre deux mots.
 *
 * C'est ce qu'un moteur de recherche montre sous le titre : une phrase coupée
 * au milieu d'un mot y est lue par tout le monde.
 */
function summary(text, max = 300) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Les dates d'un saint, dites d'une phrase. */
function lifeLine(saint) {
  const born = saint.born != null
    ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : null;
  const died = saint.died != null
    ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : null;
  if (born && died) return `${born} – ${died}`;
  if (born) return `né${saint.sex === 'f' ? 'e' : ''} ${born}`;
  if (died) return `mort${saint.sex === 'f' ? 'e' : ''} ${died}`;
  return '';
}


// ---------------------------------------------------------------------------
// Ce que nos propres données savent dire
// ---------------------------------------------------------------------------

/**
 * Une carte de situation, dessinée dans la page.
 *
 * Le contour basse définition du pays tient en huit cents signes, et la fiche
 * porte déjà le point du saint dans le même repère : la carte se dessine donc
 * sans rien charger, sans service tiers et sans une ligne de JavaScript. Elle
 * ne remplace pas la carte interactive — elle dit d'un coup d'œil où l'on est,
 * ce qu'une liste de coordonnées ne dit à personne.
 */
function locator(saint, country) {
  if (!country?.d || !country.bbox) return '';
  const [x0, y0, x1, y1] = country.bbox;
  // Un point hors du cadre du pays viendrait d'un territoire recopié de
  // l'autre côté de l'antiméridien : mieux vaut pas de carte qu'une fausse.
  if (saint.x < x0 || saint.x > x1 || saint.y < y0 || saint.y > y1) return '';
  const w = x1 - x0;
  const h = y1 - y0;
  const m = Math.max(w, h) * 0.06;
  const r = Math.max(w, h) / 45;
  return `<svg class="locator" viewBox="${Math.round(x0 - m)} ${Math.round(y0 - m)} `
    + `${Math.round(w + 2 * m)} ${Math.round(h + 2 * m)}" role="img" `
    + `aria-label="${esc(`Situation de ${saint.city} dans le pays`)}">
  <path d="${country.d}" fill-rule="evenodd"/>
  <circle cx="${saint.x}" cy="${saint.y}" r="${Math.round(r)}"/>
</svg>`;
}

/**
 * Le lieu que le nom du saint désigne, quand ce n'est pas celui de sa naissance.
 *
 * Un saint porte presque toujours le nom du lieu où on le vénère : Nazaire
 * **de Milan** est né à Rome, Pancrace **de Taormine** à Antioche. La carte
 * porte le lieu de naissance, et la fiche paraissait alors se contredire.
 * Nommer les deux lève le doute au lieu de le laisser.
 */
function namedPlace(saint) {
  const m = /(?:\sde\s|\sd[’']|\sof\s|\sda\s|\sdi\s|\sdel\s)(.+)$/i.exec(saint.name.fr || '');
  if (!m) return null;
  const lieu = m[1].trim();
  const plat = (t) => String(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  // « de Jésus », « de la Croix » : un nom de religion, pas un lieu.
  if (/^(jesus|christ|marie|dieu|la croix|l[’']enfant|saint|sainte)/.test(plat(lieu))) return null;
  if (!saint.city) return null;
  if (plat(lieu).includes(plat(saint.city)) || plat(saint.city).includes(plat(lieu))) return null;
  return lieu;
}

/** Les pays et régions qu'on rencontre à la place d'une ville. */
const GROSSIER = new Set(['afrique du nord', 'asie mineure', 'gaule', 'thrace', 'galilee',
  'judee', 'samarie', 'cappadoce', 'phrygie', 'bithynie', 'lycie', 'pannonie', 'dalmatie',
  'numidie', 'mauretanie', 'iberie', 'perse', 'mesopotamie', 'sicile', 'sardaigne', 'corse',
  'toscane', 'ombrie', 'calabre', 'pouilles', 'campanie', 'lombardie', 'venetie', 'piemont',
  'ligurie', 'latium', 'ecosse', 'angleterre', 'pays de galles', 'cornouailles', 'ulster',
  'flandre', 'bretagne', 'normandie', 'provence', 'aquitaine', 'bourgogne', 'picardie',
  'champagne', 'lorraine', 'alsace', 'auvergne', 'languedoc', 'savoie', 'dauphine', 'poitou',
  'anjou', 'berry', 'limousin', 'gascogne', 'catalogne', 'castille', 'andalousie', 'galice',
  'aragon', 'navarre', 'baviere', 'saxe', 'souabe', 'franconie', 'westphalie', 'rhenanie',
  'hebei', 'henan', 'shandong', 'shanxi', 'sichuan', 'jiangsu', 'zhejiang', 'moravie',
  'boheme', 'silesie', 'mazovie', 'transylvanie', 'moldavie']);

/** « IIIe siècle » à partir d'une année, du côté chrétien comme de l'autre. */
function centuryLabel(n) {
  const rang = Math.abs(n);
  const romain = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
    'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][rang] || String(rang);
  return `${romain}${rang === 1 ? 'er' : 'e'} siècle${n < 0 ? ' av. J.-C.' : ''}`;
}

function saintPage(saint, ctx) {
  const {
    base, slugs, paysSlugs, lieuxSlugs, countryName, deSuffix, placeHref,
    sameCountry, sameDay, geo, compte, siecleSlug,
  } = ctx;
  const lieu = placeHref(saint);
  const name = saint.name.fr || saint.name.en;
  const url = `${base}/saints/${slugs.get(saint.id)}.html`;
  const feast = formatFeast(saint.feast);
  const pays = countryName(saint.country);
  const life = lifeLine(saint);
  const bio = pickText(saint.bio, 'fr');
  const desc = pickText(saint.desc, 'fr');
  const patronage = pickText(saint.patronage, 'fr');
  const place = saint.placeKind === 'died' ? 'Lieu de mort' : 'Lieu de naissance';

  // La phrase d'entrée se compose des faits, jamais d'une tournure inventée :
  // elle doit rester vraie pour les quatre mille six cents fiches.
  const lede = [called(saint), life ? `(${life})` : '',
    `— fêté${e(saint)} le ${feast}`,
    saint.city ? `, ${saint.placeKind === 'died' ? 'mort' : 'né'}${e(saint)} à ${saint.city} (${pays})` : '',
  ].filter(Boolean).join(' ').replace(' ,', ',');

  const voisins = sameCountry(saint);
  const jour = sameDay(saint);

  // Le lieu que le nom désigne, quand ce n'est pas celui de la naissance : sans
  // lui, « Nazaire de Milan, né à Rome » a l'air d'une faute.
  const associe = namedPlace(saint);
  const associeHref = associe && [...lieuxSlugs.keys()]
    .find((k) => k.split('|')[1].toLowerCase() === associe.toLowerCase());
  const siecle = saint.born ?? saint.died;
  const epoque = siecle != null ? centuryLabel(centuryOf(siecle)) : '';

  // Un lieu qui est une contrée entière : le dire, plutôt que de laisser croire
  // à une précision que la source n'a pas.
  const flou = GROSSIER.has(String(saint.city).normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').toLowerCase());

  // Ce paragraphe-ci n'est pas rapporté : il est tiré de ce que le corpus sait
  // lui-même, et ne se trouve donc nulle part ailleurs. Il situe la fiche
  // parmi les autres — combien de saints au même endroit, au même jour, au
  // même siècle — et ouvre autant de chemins.
  const situe = [
    `${called(saint)} figure parmi les ${nombre(compte.pays(saint.country))} saints ${deSuffix(saint.country)} recensés par SanctiMaps`,
    saint.city && compte.lieu(saint) > 1
      ? `, et parmi les ${nombre(compte.lieu(saint))} nés à ${saint.city}` : '',
    '. ',
    compte.jour(saint.feast) > 1
      ? `Sa fête, le ${feast}, est partagée par ${nombre(compte.jour(saint.feast) - 1)} autres saints de la carte. `
      : `Il n’est fêté que ce ${feast} sur la carte. `,
    epoque ? `Il appartient au ${epoque}, comme ${nombre(compte.siecle(centuryOf(siecle)) - 1)} autres fiches.` : '',
  ].join('').replace('Il appartient', saint.sex === 'f' ? 'Elle appartient' : 'Il appartient')
    .replace('Il n’est fêté', saint.sex === 'f' ? 'Elle n’est fêtée' : 'Il n’est fêté');

  const body = `<h1>${esc(name)}</h1>
<p class="lede">${esc(lede)}.</p>
${desc ? `<p class="bio">${esc(desc)}</p>\n` : ''}${bio ? `<h2>Biographie</h2>\n<p class="bio">${esc(bio)}</p>\n` : ''}
<h2>Repères</h2>
<dl class="facts">
${fact('Fête', `<a href="../calendrier/${esc(slug(dayLabel(saint.feast)))}.html">${esc(feast)}</a>`)}${fact('Naissance', saint.born != null ? esc(formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec })) : '')}${fact('Mort', saint.died != null ? esc(formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec })) : '')}${fact(place, `${lieu ? `<a href="${esc(lieu)}">${esc(saint.city)}</a>` : esc(saint.city)}`
    + ` — <a href="../pays/${esc(paysSlugs.get(saint.country))}.html">${esc(pays)}</a>`)}${fact('Époque', epoque ? `<a href="../epoques/${esc(siecleSlug(centuryOf(siecle)))}.html">${esc(epoque)}</a>` : '')}${fact('Qualités', (saint.titles || []).map((k) => esc(titleLabel(k, saint.sex))).join(', '))}${fact('Saint patron de', esc(patronage))}${fact('Lieu associé', associe
    ? (associeHref ? `<a href="../lieux/${esc(lieuxSlugs.get(associeHref))}.html">${esc(associe)}</a>` : esc(associe))
      + ' <span class="note">(le nom désigne ce lieu ; la carte porte celui de la naissance)</span>' : '')}</dl>
${flou ? `<p class="note">${esc(saint.city)} est une contrée, non une ville : c’est tout ce que la source dit du lieu, et le point de la carte n’en donne que le centre.</p>\n` : ''}
${locator(saint, geo.get(saint.country))}

<p class="situe">${esc(situe)}</p>

<a class="go" href="../index.html?saint=${encodeURIComponent(saint.id)}">Voir ${saint.sex === 'f' ? 'cette sainte' : 'ce saint'} sur la carte</a>

${voisins.length ? `<h2>Autres saints ${deSuffix(saint.country)}</h2>\n<ul class="cards">\n${voisins.map((v) => card(`${slugs.get(v.id)}.html`, v.name.fr, `${v.city} · ${formatFeast(v.feast)}`)).join('')}</ul>\n<p><a href="../pays/${esc(paysSlugs.get(saint.country))}.html">Tous les saints ${esc(deSuffix(saint.country))}</a></p>\n` : ''}
${jour.length ? `<h2>Fêtés le ${esc(feast)}</h2>\n<ul class="cards">\n${jour.map((v) => card(`${slugs.get(v.id)}.html`, v.name.fr, `${v.city} · ${countryName(v.country)}`)).join('')}</ul>\n` : ''}
${saint.sources?.length ? `<p class="sources">Sources : ${saint.sources.map((s) => `<a href="${esc(s.url)}" rel="noreferrer">${esc(s.label)}</a>`).join(' · ')}</p>\n` : ''}`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    description: summary(desc || lede),
    ...(bio ? { disambiguatingDescription: bio } : {}),
    ...(saint.born != null ? { birthDate: String(saint.born) } : {}),
    ...(saint.died != null ? { deathDate: String(saint.died) } : {}),
    ...(saint.city ? {
      [saint.placeKind === 'died' ? 'deathPlace' : 'birthPlace']: {
        '@type': 'Place',
        name: saint.city,
        address: { '@type': 'PostalAddress', addressCountry: saint.country },
        geo: { '@type': 'GeoCoordinates', latitude: saint.lat, longitude: saint.lng },
      },
    } : {}),
    url,
    ...(saint.sources?.length ? { sameAs: saint.sources.map((s) => s.url) } : {}),
  };

  return page({
    title: `${called(saint)} — fête le ${feast} | SanctiMaps`,
    description: summary(bio || desc || lede),
    canonical: url,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Saints</a> › ${esc(name)}`,
    trail: [['SanctiMaps', `${base}/`], ['Saints', `${base}/saints/index.html`], [name, url]],
    body,
    jsonld,
  });
}

function countryPage(iso, list, ctx) {
  const { base, slugs, paysSlugs, lieuxSlugs, countryName, deSuffix, placesOf, siecleSlug } = ctx;
  const villes = placesOf(iso);
  const nom = countryName(iso);
  const de = deSuffix(iso);
  const titre = `Saints ${de}`;
  const url = `${base}/pays/${paysSlugs.get(iso)}.html`;
  // Les chiffres d'un pays, tirés de ses seules fiches : ils disent en trois
  // lignes ce qu'une liste de mille noms ne montre pas.
  const siecles = [...new Set(list.map((s) => centuryOf(s.born ?? s.died)).filter((n) => n != null))]
    .sort((a, b) => a - b);
  const avecBio = list.filter((s) => s.bio?.fr).length;
  const patrons = list.filter((s) => s.patronage).length;
  const jours = new Set(list.map((s) => s.feast)).size;

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`Découvrez les ${nombre(list.length)} saints ${de} recensés par SanctiMaps, `
    + `du plus ancien au plus récent. Pour chacun : son lieu de naissance, ses dates, `
    + `son jour de fête et sa fiche détaillée.`)}</p>

<dl class="facts">
${fact('Saints recensés', esc(nombre(list.length)))}${fact('Époques', siecles.length
    ? `du <a href="../epoques/${esc(siecleSlug(siecles[0]))}.html">${esc(centuryLabel(siecles[0]))}</a>`
      + ` au <a href="../epoques/${esc(siecleSlug(siecles[siecles.length - 1]))}.html">${esc(centuryLabel(siecles[siecles.length - 1]))}</a>` : '')}${fact('Jours de fête pourvus', esc(`${nombre(jours)} jours de l’année`))}${fact('Avec une biographie', esc(nombre(avecBio)))}${fact('Avec un patronage', patrons ? esc(nombre(patrons)) : '')}</dl>

${villes.length ? `<h2>Les villes les mieux pourvues</h2>\n<ul class="cards">\n${villes.slice(0, 8)
    .map(([key, saints]) => card(`../lieux/${lieuxSlugs.get(key)}.html`,
      placeName(key.split('|')[1]), `${saints.length} saints`)).join('')}</ul>\n` : ''}
<a class="go" href="../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.map((s) => card(`../saints/${slugs.get(s.id)}.html`, s.name.fr, `${s.city} · ${formatFeast(s.feast)} · ${lifeLine(s) || '?'}`)).join('')}</ul>
${villes.length > 8 ? `<h2>Tous les lieux ${esc(de)}</h2>\n<ul class="cards">\n${villes
    .map(([key, saints]) => card(`../lieux/${lieuxSlugs.get(key)}.html`,
      placeName(key.split('|')[1]), `${saints.length} saints`)).join('')}</ul>\n` : ''}`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints recensés | SanctiMaps`,
    description: `Les ${list.length} saints ${de} recensés par SanctiMaps : leur ville de naissance, leurs dates et leur jour de fête.`,
    canonical: url,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Pays</a> › ${esc(nom)}`,
    trail: [['SanctiMaps', `${base}/`], ['Pays', `${base}/pays/index.html`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}.html`]),
    body,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: titre,
      url,
    },
  });
}

function dayPage(key, list, ctx) {
  const { base, slugs, paysSlugs, countryName, deSuffix, voisinsDuJour } = ctx;
  const label = dayLabel(key);
  const [veille, demain] = voisinsDuJour(key);
  const url = `${base}/calendrier/${slug(label)}.html`;
  // Les pays d'où viennent les saints du jour : un jour de fête est aussi une
  // géographie, et c'est par là qu'on passe d'une date à une carte.
  const pays = new Map();
  for (const s of list) pays.set(s.country, (pays.get(s.country) || 0) + 1);
  const rangs = [...pays.entries()].sort((a, b) => b[1] - a[1]);

  const body = `<h1>Saints fêtés le ${esc(label)}</h1>
<p class="lede">${esc(`${nombre(list.length)} saint${list.length > 1 ? 's' : ''} au calendrier du ${label}`
    + `${rangs.length > 1 ? `, venus de ${nombre(rangs.length)} pays` : ''}. `
    + `Chacun avec son lieu de naissance et sa fiche.`)}</p>
<ul class="cards">
${list.map((s) => card(`../saints/${slugs.get(s.id)}.html`, s.name.fr, `${s.city} · ${countryName(s.country)}`)).join('')}</ul>

<h2>D’où viennent-ils</h2>
<ul class="cards">
${rangs.map(([iso, k]) => card(`../pays/${paysSlugs.get(iso)}.html`, `Saints ${deSuffix(iso)}`,
    `${k} fêté${k > 1 ? 's' : ''} ce jour · ${countryName(iso)}`)).join('')}</ul>

<p class="note">La veille et le lendemain : <a href="${esc(slug(dayLabel(veille)))}.html">${esc(dayLabel(veille))}</a>
 · <a href="${esc(slug(dayLabel(demain)))}.html">${esc(dayLabel(demain))}</a></p>
<a class="go" href="../index.html">Ouvrir la carte</a>`;

  return page({
    title: `Saint du ${label} — les saints fêtés ce jour | SanctiMaps`,
    description: summary(`Les saints fêtés le ${label} : ${list.slice(0, 8).map((s) => s.name.fr).join(', ')}.`),
    canonical: url,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Calendrier</a> › ${esc(label)}`,
    trail: [['SanctiMaps', `${base}/`], ['Calendrier', `${base}/calendrier/index.html`],
      [`Saints fêtés le ${label}`, url]],
    items: list.map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}.html`]),
    body,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Saints fêtés le ${label}`,
      url,
    },
  });
}

/**
 * L'index alphabétique, une page par lettre.
 *
 * Quatre mille six cents noms sur une seule page en font trois cent mille
 * signes : un moteur de recherche n'en suit pas tous les liens, et un lecteur
 * ne s'y retrouve pas. On coupe donc par initiale — vingt-six pages de deux
 * cents noms —, et la page d'accueil des saints ne porte que les lettres et
 * leur compte.
 */
function letterGroups(saints) {
  const groups = new Map();
  for (const s of saints) {
    const letter = (slug(s.name.fr).charAt(0) || '#').toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(s);
  }
  return new Map([...groups.entries()].sort());
}

function letterPage(letter, list, ctx) {
  const { base, slugs } = ctx;
  const body = `<h1>Les saints en ${esc(letter)}</h1>
<p class="lede">${esc(`${list.length} saint${list.length > 1 ? 's' : ''} dont le nom commence par ${letter}.`)}</p>
<ul class="cards">
${list.map((s) => card(`${slugs.get(s.id)}.html`, s.name.fr,
    `${s.city} · ${formatFeast(s.feast)}`)).join('')}</ul>
<p><a href="index.html">Retour à l’index alphabétique</a></p>`;

  return page({
    title: `Les saints en ${letter} — ${list.length} fiches | SanctiMaps`,
    description: summary(`Les saints dont le nom commence par ${letter} : `
      + `${list.slice(0, 10).map((s) => s.name.fr).join(', ')}.`),
    canonical: `${base}/saints/lettre-${letter.toLowerCase()}.html`,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Saints</a> › ${esc(letter)}`,
    body,
  });
}

function saintsIndex(saints, groups, ctx) {
  const { base } = ctx;
  const body = `<h1>Tous les saints de la carte</h1>
<p class="lede">${esc(`${saints.length} saints recensés, rangés par initiale. Chaque nom mène à sa fiche : dates, lieu de naissance, jour de fête et biographie.`)}</p>
<ul class="cards">
${[...groups.entries()].map(([l, list]) => card(`lettre-${l.toLowerCase()}.html`,
    `Les saints en ${l}`, `${list.length} fiche${list.length > 1 ? 's' : ''}`)).join('')}</ul>`;

  return page({
    title: `Tous les saints — ${nombre(saints.length)} fiches | SanctiMaps`,
    description: `La liste alphabétique des ${saints.length} saints recensés par SanctiMaps, chacun avec sa fiche : dates, lieu de naissance, fête et biographie.`,
    canonical: `${base}/saints/index.html`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Saints',
    body,
  });
}

/**
 * « de Rome », « d'Alexandrie » : l'élision se fait devant une voyelle.
 *
 * Le corpus porte des noms de lieux venus de Wikidata, et l'on ne peut pas
 * leur demander leur genre. « De » suivi du nom marche pour tous — ville,
 * région, province — pourvu qu'on élide devant une voyelle, ce qui est la
 * seule règle qui ne souffre pas d'exception ici.
 */
function du(place) {
  const nom = place.charAt(0).toUpperCase() + place.slice(1);
  return /^[aâàäeéèêëiîïoôöuùûüyAÂÀÄEÉÈÊËIÎÏOÔÖUÙÛÜY]/.test(nom) ? `d’${nom}` : `de ${nom}`;
}

/** Le nom du lieu tel qu'on l'écrit en tête de page. */
const placeName = (city) => city.charAt(0).toUpperCase() + city.slice(1);

/**
 * Les saints d'un lieu.
 *
 * Un lieu ne fait une page que s'il porte au moins deux saints : à un seul, la
 * page ne dirait rien que sa fiche ne dise déjà, et cinq cents pages jumelles
 * dilueraient le reste plus qu'elles ne l'aideraient.
 */
function placePage(key, list, ctx) {
  const { base, slugs, lieuxSlugs, paysSlugs, countryName, deSuffix, siecleSlug } = ctx;
  const [iso, city] = key.split('|');
  const nom = placeName(city);
  const titre = `Les saints ${du(city)}`;
  const url = `${base}/lieux/${lieuxSlugs.get(key)}.html`;
  const siecles = [...new Set(list.map((s) => centuryOf(s.born ?? s.died)).filter((n) => n != null))]
    .sort((a, b) => a - b);

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`Découvrez les ${nombre(list.length)} saints associés à ${nom} `
    + `(${countryName(iso)}) recensés par SanctiMaps`
    + `${siecles.length > 1 ? `, du ${centuryLabel(siecles[0])} au ${centuryLabel(siecles[siecles.length - 1])}` : ''}. `
    + `Pour chacun : ses dates, son jour de fête et sa fiche détaillée.`)}</p>
${siecles.length ? `<p class="note">Époques représentées : ${siecles
    .map((n) => `<a href="../epoques/${esc(siecleSlug(n))}.html">${esc(centuryLabel(n))}</a>`)
    .join(', ')}.</p>\n` : ''}
<a class="go" href="../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.map((s) => card(`../saints/${slugs.get(s.id)}.html`, s.name.fr,
    `${formatFeast(s.feast)} · ${lifeLine(s) || '?'}`)).join('')}</ul>
<p><a href="../pays/${esc(paysSlugs.get(iso))}.html">Tous les saints ${esc(deSuffix(iso))}</a></p>`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints | SanctiMaps`,
    description: summary(`Les ${list.length} saints nés ${du(city)} (${countryName(iso)}) : `
      + `${list.slice(0, 8).map((s) => s.name.fr).join(', ')}.`),
    canonical: url,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Lieux</a> › ${esc(nom)}`,
    trail: [['SanctiMaps', `${base}/`], ['Lieux', `${base}/lieux/index.html`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}.html`]),
    body,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: nom,
      address: { '@type': 'PostalAddress', addressLocality: nom, addressCountry: iso },
      geo: { '@type': 'GeoCoordinates', latitude: list[0].lat, longitude: list[0].lng },
      url,
    },
  });
}

function placesIndex(byPlace, ctx) {
  const { base, lieuxSlugs, countryName } = ctx;
  const rows = [...byPlace.entries()].sort((a, b) => b[1].length - a[1].length);
  const body = `<h1>Les saints, lieu par lieu</h1>
<p class="lede">${esc(`${rows.length} villes et régions comptent au moins deux saints nés là. Rome en compte ${rows[0][1].length} à elle seule.`)}</p>
<ul class="cards">
${rows.map(([key, list]) => card(`${lieuxSlugs.get(key)}.html`,
    `Les saints ${du(key.split('|')[1])}`,
    `${countryName(key.split('|')[0])} · ${list.length} saints`)).join('')}</ul>`;

  return page({
    title: `Les saints par lieu — ${rows.length} villes | SanctiMaps`,
    description: `Les lieux de naissance des saints recensés par SanctiMaps : ${rows.length} villes et régions qui en comptent au moins deux.`,
    canonical: `${base}/lieux/index.html`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Lieux',
    body,
  });
}

/**
 * Les saints d'un siècle.
 *
 * « Saints du IVe siècle » est une question qu'on pose vraiment, et le corpus
 * y répond mieux que la plupart : il porte la date de chaque fiche. Vingt et
 * une pages suffisent à couvrir ce que la carte connaît.
 */
function centuryPage(n, list, ctx) {
  const { base, slugs, countryName, siecleSlug } = ctx;
  const titre = `Les saints du ${centuryLabel(n)}`;
  const url = `${base}/epoques/${siecleSlug(n)}.html`;
  const pays = new Map();
  for (const s of list) pays.set(s.country, (pays.get(s.country) || 0) + 1);
  const tete = [...pays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`${list.length} saints de la carte sont nés au ${centuryLabel(n)}`
    + `${tete.length ? `, surtout ${tete.map(([iso, k]) => `${countryName(iso)} (${k})`).join(', ')}` : ''}.`)}</p>
<a class="go" href="../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.slice(0, 400).map((s) => card(`../saints/${slugs.get(s.id)}.html`, s.name.fr,
    `${s.city} · ${countryName(s.country)} · ${formatFeast(s.feast)}`)).join('')}</ul>
${list.length > 400 ? `<p class="note">Les 400 plus anciens sont listés ici ; les ${list.length - 400} autres se trouvent par les pages de pays.</p>\n` : ''}`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints | SanctiMaps`,
    description: summary(`Les ${list.length} saints du ${centuryLabel(n)} recensés par SanctiMaps, `
      + `avec leur lieu de naissance et leur jour de fête.`),
    canonical: url,
    up: 1,
    crumbs: `<a href="../index.html">Carte</a> › <a href="index.html">Époques</a> › ${esc(centuryLabel(n))}`,
    trail: [['SanctiMaps', `${base}/`], ['Époques', `${base}/epoques/index.html`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}.html`]),
    body,
  });
}

function centuriesIndex(byCentury, ctx) {
  const { base, siecleSlug } = ctx;
  const rows = [...byCentury.entries()].sort((a, b) => a[0] - b[0]);
  const body = `<h1>Les saints, siècle par siècle</h1>
<p class="lede">${esc(`Du ${centuryLabel(rows[0][0])} au ${centuryLabel(rows[rows.length - 1][0])}, `
    + `les saints de la carte rangés par époque.`)}</p>
<ul class="cards">
${rows.map(([n, list]) => card(`${siecleSlug(n)}.html`, centuryLabel(n),
    `${list.length} saint${list.length > 1 ? 's' : ''}`)).join('')}</ul>`;

  return page({
    title: 'Les saints par siècle — de l’Antiquité à nos jours | SanctiMaps',
    description: 'Les saints recensés par SanctiMaps rangés par siècle, du premier siècle à aujourd’hui.',
    canonical: `${base}/epoques/index.html`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Époques',
    body,
  });
}

function countriesIndex(byCountry, ctx) {
  const { base, paysSlugs, countryName, deSuffix } = ctx;
  const rows = [...byCountry.entries()]
    .sort((a, b) => b[1].length - a[1].length);
  const body = `<h1>Les saints, pays par pays</h1>
<p class="lede">${esc(`${rows.length} pays comptent au moins un saint recensé. Le classement suit le nombre de fiches, de l’Italie au Pakistan.`)}</p>
<ul class="cards">
${rows.map(([iso, list]) => card(`${paysSlugs.get(iso)}.html`, `Saints ${deSuffix(iso)}`,
    `${countryName(iso)} · ${list.length} fiche${list.length > 1 ? 's' : ''}`)).join('')}</ul>`;

  return page({
    title: `Les saints par pays — ${rows.length} pays | SanctiMaps`,
    description: `Les saints recensés par SanctiMaps, classés par pays de naissance : ${rows.length} pays, de l’Italie au Pakistan.`,
    canonical: `${base}/pays/index.html`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Pays',
    body,
  });
}

function calendarIndex(byDay, ctx) {
  const { base } = ctx;
  const body = `<h1>Le calendrier des saints</h1>
<p class="lede">${esc(`Les ${byDay.size} jours de l’année qui portent au moins une fête. Chaque jour mène aux saints qu’on y fête.`)}</p>
${MOIS.map((mois, i) => {
    const days = [...byDay.keys()].filter((k) => Number(k.split('-')[0]) === i + 1).sort();
    if (!days.length) return '';
    return `<h2>${esc(mois.charAt(0).toUpperCase() + mois.slice(1))}</h2>\n<ul class="letters">\n${days
      .map((k) => `  <li><a href="${esc(slug(dayLabel(k)))}.html">${esc(k.split('-')[1])}</a></li>\n`).join('')}</ul>\n`;
  }).join('')}`;

  return page({
    title: 'Calendrier des saints — le saint de chaque jour | SanctiMaps',
    description: 'Le saint du jour, jour par jour : les fêtes du calendrier des saints de l’Église catholique.',
    canonical: `${base}/calendrier/index.html`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Calendrier',
    body,
  });
}

// ---------------------------------------------------------------------------
// Marche
// ---------------------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = JSON.parse(readFileSync(join(GEN, 'saints.json'), 'utf8')).saints;
  const names = JSON.parse(readFileSync(join(GEN, 'country-names.json'), 'utf8'));
  const de = JSON.parse(readFileSync(join(ROOT, 'data', 'reference', 'pays-de.json'), 'utf8')).de;
  const world = JSON.parse(readFileSync(join(GEN, 'world.json'), 'utf8'));

  const countryName = (iso) => names[iso]?.fr || iso;
  const manquants = new Set();
  const deSuffix = (iso) => {
    if (de[iso]) return de[iso];
    manquants.add(iso);
    return `— ${countryName(iso)}`;
  };

  // Les fiches en attente ou refusées ne sont pas publiées : les indexer
  // reviendrait à donner pour établi ce que la modération n'a pas retenu.
  const published = saints.filter((s) => (s.status ?? 'published') === 'published');
  const sorted = [...published].sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'));
  const slugs = uniqueSlugs(sorted, (s) => s.name.fr);

  const byCountry = new Map();
  const byDay = new Map();
  for (const s of published) {
    if (!byCountry.has(s.country)) byCountry.set(s.country, []);
    byCountry.get(s.country).push(s);
    if (!byDay.has(s.feast)) byDay.set(s.feast, []);
    byDay.get(s.feast).push(s);
  }
  for (const list of byCountry.values()) list.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0));
  for (const list of byDay.values()) list.sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'));

  // Les lieux : un regroupement par ville, dans son pays — deux « Irlande »
  // sous deux pays différents ne sont pas le même lieu.
  const byPlace = new Map();
  for (const s of published) {
    if (!s.city) continue;
    const key = `${s.country}|${s.city}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(s);
  }
  for (const [key, list] of byPlace) {
    if (list.length < 2) byPlace.delete(key);
    else list.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0));
  }

  const lieuxSlugs = new Map();
  const usedLieux = new Set();
  for (const key of [...byPlace.keys()].sort()) {
    const [iso, city] = key.split('|');
    let base = slug(city);
    while (usedLieux.has(base)) base = `${base}-${iso.toLowerCase()}`;
    usedLieux.add(base);
    lieuxSlugs.set(key, base);
  }

  const paysSlugs = new Map();
  const usedPays = new Set();
  for (const iso of [...byCountry.keys()].sort()) {
    let s = slug(countryName(iso));
    while (usedPays.has(s)) s = `${s}-${iso.toLowerCase()}`;
    usedPays.add(s);
    paysSlugs.set(iso, s);
  }

  // Les siècles, pour les pages d'époque et pour situer chaque fiche.
  const byCentury = new Map();
  for (const s of published) {
    const n = centuryOf(s.born ?? s.died);
    if (n == null) continue;
    if (!byCentury.has(n)) byCentury.set(n, []);
    byCentury.get(n).push(s);
  }
  for (const list of byCentury.values()) list.sort((a, b) => (a.born ?? a.died) - (b.born ?? b.died));
  // « Ier siècle » s'écrit avec son ordinal jusque dans l'adresse : c'est ce
  // qu'un lecteur tape, et ce qu'un moteur de recherche voit.
  const siecleSlug = (n) => `${Math.abs(n)}${Math.abs(n) === 1 ? 'er' : 'e'}-siecle`
    + `${n < 0 ? '-av-jc' : ''}`;

  const ctx = {
    base: options.base,
    slugs,
    paysSlugs,
    siecleSlug,
    // Le contour basse définition des pays, pour la carte de situation
    // dessinée dans chaque fiche.
    geo: new Map(world.countries.map((c) => [c.id, c])),
    // Ce que le corpus sait de lui-même : les comptes qui situent une fiche
    // parmi les autres, et qui font le texte propre à chaque page.
    compte: {
      pays: (iso) => (byCountry.get(iso) || []).length,
      lieu: (saint) => (byPlace.get(`${saint.country}|${saint.city}`) || []).length,
      jour: (feast) => (byDay.get(feast) || []).length,
      siecle: (n) => (byCentury.get(n) || []).length,
    },
    countryName,
    deSuffix,
    lieuxSlugs,
    // La page du lieu, quand il en a une : un saint né dans un village qu'il
    // est seul à porter n'a pas de page de lieu, et son nom reste du texte.
    placeHref: (saint) => (lieuxSlugs.has(`${saint.country}|${saint.city}`)
      ? `../lieux/${lieuxSlugs.get(`${saint.country}|${saint.city}`)}.html` : null),
    /**
     * La veille et le lendemain d'un jour de fête, pourvus l'un et l'autre.
     *
     * Le calendrier se feuillette : une page de jour qui ne mènerait qu'à
     * l'index obligerait à y remonter trois cent soixante-cinq fois. On saute
     * les jours vides — il n'y en a qu'un, le 29 février.
     */
    voisinsDuJour: (key) => {
      const jours = [...byDay.keys()].sort();
      const i = jours.indexOf(key);
      return [jours[(i - 1 + jours.length) % jours.length], jours[(i + 1) % jours.length]];
    },
    // Les lieux d'un pays, du mieux pourvu au moins pourvu : c'est par eux
    // qu'une page de pays mène ailleurs qu'à ses seules fiches.
    placesOf: (iso) => [...byPlace.entries()]
      .filter(([key]) => key.startsWith(`${iso}|`))
      .sort((a, b) => b[1].length - a[1].length),
    // Les voisins : quelques saints du même pays et du même jour, pour que
    // chaque fiche ouvre sur d'autres plutôt que de finir en cul-de-sac.
    sameCountry: (saint) => (byCountry.get(saint.country) || [])
      .filter((s) => s.id !== saint.id).slice(0, 12),
    sameDay: (saint) => (byDay.get(saint.feast) || [])
      .filter((s) => s.id !== saint.id).slice(0, 12),
  };

  const files = [];
  for (const saint of sorted) {
    files.push([`saints/${slugs.get(saint.id)}.html`, saintPage(saint, ctx)]);
  }
  const groups = letterGroups(sorted);
  for (const [letter, list] of groups) {
    files.push([`saints/lettre-${letter.toLowerCase()}.html`, letterPage(letter, list, ctx)]);
  }
  files.push(['saints/index.html', saintsIndex(sorted, groups, ctx)]);
  for (const [iso, list] of byCountry) {
    files.push([`pays/${paysSlugs.get(iso)}.html`, countryPage(iso, list, ctx)]);
  }
  files.push(['pays/index.html', countriesIndex(byCountry, ctx)]);
  for (const [key, list] of byPlace) {
    files.push([`lieux/${lieuxSlugs.get(key)}.html`, placePage(key, list, ctx)]);
  }
  files.push(['lieux/index.html', placesIndex(byPlace, ctx)]);
  for (const [n, list] of byCentury) {
    files.push([`epoques/${siecleSlug(n)}.html`, centuryPage(n, list, ctx)]);
  }
  files.push(['epoques/index.html', centuriesIndex(byCentury, ctx)]);
  for (const [key, list] of byDay) {
    files.push([`calendrier/${slug(dayLabel(key))}.html`, dayPage(key, list, ctx)]);
  }
  files.push(['calendrier/index.html', calendarIndex(byDay, ctx)]);

  // Le plan du site : la liste complète, pour qui préfère la lire d'un coup
  // plutôt que de suivre les liens de proche en proche.
  const urls = ['', 'saints/index.html', 'pays/index.html', 'calendrier/index.html',
    ...files.map(([path]) => path).filter((p) => !p.endsWith('index.html'))];
  files.push(['sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(`${options.base}/${u}`)}</loc></url>`).join('\n')}
</urlset>
`]);
  files.push(['robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${options.base}/sitemap.xml\n`]);

  const octets = files.reduce((n, [, body]) => n + Buffer.byteLength(body), 0);
  console.log(`Pages : ${sorted.length} saints, ${byCountry.size} pays, ${byPlace.size} lieux,`
    + ` ${byDay.size} jours, ${byCentury.size} siècles`);
  console.log(`  ${files.length} fichiers, ${(octets / 1024 / 1024).toFixed(1)} Mo`);
  if (manquants.size) {
    console.log(`  sans complément français : ${[...manquants].join(', ')} — voyez data/reference/pays-de.json`);
  }

  if (options.dryRun) {
    console.log('\n--dry-run : rien n’a été écrit.');
    return;
  }

  // Les dossiers sont refaits à neuf : un saint renommé laisserait sinon son
  // ancienne page derrière lui, et le plan du site pointerait sur deux
  // adresses pour un même homme.
  for (const dir of ['saints', 'pays', 'calendrier', 'lieux', 'epoques']) {
    rmSync(join(ROOT, dir), { recursive: true, force: true });
    mkdirSync(join(ROOT, dir), { recursive: true });
  }
  for (const [path, body] of files) writeFileSync(join(ROOT, path), body);
  console.log(`\nÉcrit à la racine du site : saints/, pays/, lieux/, calendrier/, sitemap.xml, robots.txt`);
}

main();
