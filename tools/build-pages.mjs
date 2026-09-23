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
 *   saints/<nom>/              la fiche : dates, lieu, fête, biographie, sources
 *   saints/saint-<prenom>/     tous ceux qui portent ce prénom
 *   pays/<pays>/               les saints nés dans ce pays
 *   calendrier/<jour>/         les saints fêtés ce jour-là
 *
 * ## Des adresses sans extension
 *
 * Chaque page est un `index.html` dans un dossier à son nom, et non un fichier
 * `<nom>.html` : l'adresse s'écrit alors `sanctimaps.fr/saints/maurice-d-agaune`,
 * sans `.html` à la fin. C'est ce qu'on dicte, ce qu'on recopie dans un message
 * et ce qu'un moteur de recherche montre — et c'est la seule forme qui marche
 * telle quelle sur n'importe quel hébergement statique, là où l'omission de
 * l'extension dépend ailleurs de la configuration du serveur.
 *
 * Les anciennes adresses en `.html` ne disparaissent pas pour autant : chacune
 * laisse une page de renvoi qui mène à la nouvelle. Un lien partagé il y a six
 * mois continue de tomber sur la bonne fiche.
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

import { lireCorpus } from './lib/corpus.mjs';

// L'internationalisation de l'application sert ici telle quelle : les pages
// doivent dire les dates dans les mêmes mots que la carte — « IIe siècle » et
// non « vers 200 ». Elle attend un document ; on lui en donne l'ombre.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const { degreLabel, formatFeast, formatYear, languePhrase, pickText, setLanguage, titleLabel } = await import('../src/js/i18n.js');
const { centuryOf } = await import('../src/js/data.js');
setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'generated');

const DEFAULTS = {
  // Le domaine du site, lu dans le fichier CNAME que GitHub Pages y pose
  // lui-même : le jour où il change, les cinq mille adresses canoniques et le
  // plan du site suivent sans qu'on ait à y penser. Sans CNAME, on retombe sur
  // l'adresse github.io.
  base: (() => {
    try {
      const nom = readFileSync(join(ROOT, 'CNAME'), 'utf8').trim();
      if (nom) return `https://${nom}`;
    } catch { /* pas de domaine propre : l'adresse par défaut fera l'affaire */ }
    return 'https://sanctimaps-gif.github.io/sanctimaps';
  })(),
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
  // La racine du site, retrouvée en remontant de l'adresse canonique autant de
  // dossiers que les liens relatifs en remontent. C'est de là que pend
  // l'image de partage, qui doit être absolue.
  const segments = canonical.replace(/\/+$/, '').split('/');
  const racine = up ? segments.slice(0, -up).join('/') : segments.join('/');
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
<link rel="icon" href="${r}favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" type="image/png" sizes="16x16" href="${r}icons/icon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="${r}icons/icon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="${r}icons/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="${r}icons/apple-touch-icon.png">
<link rel="manifest" href="${r}site.webmanifest">
<meta name="theme-color" content="#f8eede">
<meta property="og:image" content="${esc(racine)}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/atom+xml" title="SanctiMaps — le saint du jour" href="${r}feed.xml">
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
      <a href="${r}saints/">Tous les saints</a>
      <a href="${r}pays/">Par pays</a>
      <a href="${r}lieux/">Par lieu</a>
      <a href="${r}epoques/">Par siècle</a>
      <a href="${r}calendrier/">Calendrier</a>
      <a href="${r}lettre/">La lettre</a>
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
 * Le nom précédé de son degré — et rien devant, quand on ne le sait pas.
 *
 * L'Église distingue quatre degrés, et la page les disait tous « saint ». Le
 * 23 septembre, Darwin Ramos arrivait ainsi en « saint Darwin Ramos » : il est
 * serviteur de Dieu, sa cause est ouverte depuis 2019, et aucune source ne dit
 * autre chose. Une fiche dont le corpus ignore le degré ne porte donc aucun
 * titre : le nom nu est la seule chose vraie qu'on puisse en écrire.
 *
 * Cent vingt fiches portent déjà le titre dans leur nom même — « Sainte
 * Sophie », « Saint Amadour » : le préfixer sans regarder donnerait « Sainte
 * Sainte Sophie », sur la page comme dans le titre de l'onglet.
 */
function called(saint) {
  const name = saint.name.fr || saint.name.en;
  const degre = degreLabel(saint.statut, saint.sex);
  if (!degre) return name;
  if (/^(saints?|saintes?|bienheureux|bienheureuse|v[ée]n[ée]rable|ste?s?\.?)\s/i.test(name)) return name;
  return `${degre} ${name}`;
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
    sameCountry, sameDay, geo, compte, siecleSlug, prenomDe,
  } = ctx;
  const lieu = placeHref(saint);
  const name = saint.name.fr || saint.name.en;
  const url = `${base}/saints/${slugs.get(saint.id)}/`;
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
  // Le prénom, quand d'autres le portent : c'est la question qu'on se pose en
  // arrivant ici depuis « saint Maurice », et la page qui y répond.
  const homonymes = prenomDe(saint);

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
${desc ? `<p class="bio">${esc(desc)}</p>\n` : ''}${bio ? `<h2>Biographie</h2>\n<p class="bio">${esc(bio)}</p>\n` : ''}${bio && saint.traduit ? `<p class="note">Biographie traduite ${esc(languePhrase(saint.traduit))}, d’après l’article de Wikipédia cité en source.</p>\n` : ''}
<h2>Repères</h2>
<dl class="facts">
${fact('Reconnaissance', esc(degreLabel(saint.statut, saint.sex)))}${fact('Fête', `<a href="../../calendrier/${esc(slug(dayLabel(saint.feast)))}/">${esc(feast)}</a>`)}${fact('Naissance', saint.born != null ? esc(formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec })) : '')}${fact('Mort', saint.died != null ? esc(formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec })) : '')}${fact(place, `${lieu ? `<a href="${esc(lieu)}">${esc(saint.city)}</a>` : esc(saint.city)}`
    + ` — <a href="../../pays/${esc(paysSlugs.get(saint.country))}/">${esc(pays)}</a>`)}${fact('Époque', epoque ? `<a href="../../epoques/${esc(siecleSlug(centuryOf(siecle)))}/">${esc(epoque)}</a>` : '')}${fact('Qualités', (saint.titles || []).map((k) => esc(titleLabel(k, saint.sex))).join(', '))}${fact('Saint patron de', esc(patronage))}${fact('Lieu associé', associe
    ? (associeHref ? `<a href="../../lieux/${esc(lieuxSlugs.get(associeHref))}/">${esc(associe)}</a>` : esc(associe))
      + ' <span class="note">(le nom désigne ce lieu ; la carte porte celui de la naissance)</span>' : '')}</dl>
${flou ? `<p class="note">${esc(saint.city)} est une contrée, non une ville : c’est tout ce que la source dit du lieu, et le point de la carte n’en donne que le centre.</p>\n` : ''}
${locator(saint, geo.get(saint.country))}

<p class="situe">${esc(situe)}</p>

<a class="go" href="../../index.html?saint=${encodeURIComponent(saint.id)}">Voir ${saint.sex === 'f' ? 'cette sainte' : 'ce saint'} sur la carte</a>
${homonymes ? `<p class="note">${esc(`${nombre(homonymes.list.length - 1)} autre${homonymes.list.length > 2 ? 's' : ''} saint${homonymes.feminin ? 'e' : ''}${homonymes.list.length > 2 ? 's' : ''} de la carte porte${homonymes.list.length > 2 ? 'nt' : ''} le prénom ${homonymes.nom}`)} : <a href="../${esc(homonymes.slug)}/">${esc(homonymes.titre.charAt(0).toLowerCase() + homonymes.titre.slice(1))}</a>.</p>\n` : ''}

${voisins.length ? `<h2>Autres saints ${deSuffix(saint.country)}</h2>\n<ul class="cards">\n${voisins.map((v) => card(`../${slugs.get(v.id)}/`, v.name.fr, `${v.city} · ${formatFeast(v.feast)}`)).join('')}</ul>\n<p><a href="../../pays/${esc(paysSlugs.get(saint.country))}/">Tous les saints ${esc(deSuffix(saint.country))}</a></p>\n` : ''}
${jour.length ? `<h2>Fêtés le ${esc(feast)}</h2>\n<ul class="cards">\n${jour.map((v) => card(`../${slugs.get(v.id)}/`, v.name.fr, `${v.city} · ${countryName(v.country)}`)).join('')}</ul>\n` : ''}
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
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Saints</a> › ${esc(name)}`,
    trail: [['SanctiMaps', `${base}/`], ['Saints', `${base}/saints/`], [name, url]],
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
  const url = `${base}/pays/${paysSlugs.get(iso)}/`;
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
    ? `du <a href="../../epoques/${esc(siecleSlug(siecles[0]))}/">${esc(centuryLabel(siecles[0]))}</a>`
      + ` au <a href="../../epoques/${esc(siecleSlug(siecles[siecles.length - 1]))}/">${esc(centuryLabel(siecles[siecles.length - 1]))}</a>` : '')}${fact('Jours de fête pourvus', esc(`${nombre(jours)} jours de l’année`))}${fact('Avec une biographie', esc(nombre(avecBio)))}${fact('Avec un patronage', patrons ? esc(nombre(patrons)) : '')}</dl>

${villes.length ? `<h2>Les villes les mieux pourvues</h2>\n<ul class="cards">\n${villes.slice(0, 8)
    .map(([key, saints]) => card(`../../lieux/${lieuxSlugs.get(key)}/`,
      placeName(key.split('|')[1]), `${saints.length} saints`)).join('')}</ul>\n` : ''}
<a class="go" href="../../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.map((s) => card(`../../saints/${slugs.get(s.id)}/`, s.name.fr, `${s.city} · ${formatFeast(s.feast)} · ${lifeLine(s) || '?'}`)).join('')}</ul>
${villes.length > 8 ? `<h2>Tous les lieux ${esc(de)}</h2>\n<ul class="cards">\n${villes
    .map(([key, saints]) => card(`../../lieux/${lieuxSlugs.get(key)}/`,
      placeName(key.split('|')[1]), `${saints.length} saints`)).join('')}</ul>\n` : ''}`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints recensés | SanctiMaps`,
    description: `Les ${list.length} saints ${de} recensés par SanctiMaps : leur ville de naissance, leurs dates et leur jour de fête.`,
    canonical: url,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Pays</a> › ${esc(nom)}`,
    trail: [['SanctiMaps', `${base}/`], ['Pays', `${base}/pays/`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}/`]),
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
  const url = `${base}/calendrier/${slug(label)}/`;
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
${list.map((s) => card(`../../saints/${slugs.get(s.id)}/`, called(s), `${s.city} · ${countryName(s.country)}`)).join('')}</ul>

<h2>D’où viennent-ils</h2>
<ul class="cards">
${rangs.map(([iso, k]) => card(`../../pays/${paysSlugs.get(iso)}/`, `Saints ${deSuffix(iso)}`,
    `${k} fêté${k > 1 ? 's' : ''} ce jour · ${countryName(iso)}`)).join('')}</ul>

<p class="note">La veille et le lendemain : <a href="../${esc(slug(dayLabel(veille)))}/">${esc(dayLabel(veille))}</a>
 · <a href="../${esc(slug(dayLabel(demain)))}/">${esc(dayLabel(demain))}</a></p>
<a class="go" href="../../index.html">Ouvrir la carte</a>`;

  return page({
    title: `Saint du ${label} — les saints fêtés ce jour | SanctiMaps`,
    description: summary(`Les saints fêtés le ${label} : ${list.slice(0, 8).map((s) => s.name.fr).join(', ')}.`),
    canonical: url,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Calendrier</a> › ${esc(label)}`,
    trail: [['SanctiMaps', `${base}/`], ['Calendrier', `${base}/calendrier/`],
      [`Saints fêtés le ${label}`, url]],
    items: list.map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}/`]),
    body,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Saints fêtés le ${label}`,
      url,
    },
  });
}

// ---------------------------------------------------------------------------
// Les prénoms
// ---------------------------------------------------------------------------

/**
 * Ce qui, dans un nom, sépare le prénom du reste.
 *
 * « Maurice d'Agaune », « Thérèse de Lisieux », « Léon le Grand » : le nom d'un
 * saint est presque toujours un prénom suivi d'un lieu, d'un surnom ou d'une
 * maison. Tout ce qui suit l'un de ces mots-outils ne fait plus partie du
 * prénom.
 */
const COUPE_PRENOM = /\s(?:d'|l'|de |du |des |di |da |dal |del |della |dos |das |von |van |of |the |le |la |les |en |dit |dite |au |aux |sur |y )/i;

/** Le titre déjà présent dans le nom : « Sainte Sophie » se lit « Sophie ». */
const TITRE_EN_TETE = /^(?:saints?|saintes?|ste?s?\.?)\s+/i;

/**
 * Les prénoms sous lesquels on peut chercher un saint — un, ou deux.
 *
 * C'est par le prénom qu'on cherche un saint quand on ne connaît pas son lieu :
 * on tape « saint Maurice », pas « Maurice d'Agaune ». Le premier mot du nom
 * suffit donc, et il rassemble les trois Maurice de la carte — d'Agaune,
 * Duault et Tornay — sur la même page.
 *
 * Quand deux mots précèdent le lieu, le second fait un prénom de plus :
 * « Maurice Tornay » et « Marie Madeleine » se cherchent aussi entiers, et l'on
 * ne sait pas d'avance si ce second mot est un nom de famille ou la suite du
 * prénom. Les deux adresses existent ; c'est le lecteur qui choisit.
 */
function prenomsDe(saint) {
  const nom = String(saint.name.fr || '')
    .replace(TITRE_EN_TETE, '')
    .split(/[,(]/)[0]
    .replace(/\s+[IVXLC]+$/, '')            // « Louis IX » -> « Louis »
    .trim();
  const tete = nom.split(COUPE_PRENOM)[0].trim();
  const mots = tete.split(/\s+/).filter(Boolean);
  const sortie = [];
  for (const forme of [mots[0], mots.length > 1 ? `${mots[0]} ${mots[1]}` : null]) {
    if (!forme || forme.length < 3) continue;
    if (TITRE_EN_TETE.test(`${forme} `)) continue;
    sortie.push(forme);
  }
  return sortie;
}

/**
 * La page d'un prénom : tous ceux qui le portent.
 *
 * Elle n'existe que pour les prénoms portés par plusieurs saints — c'est là
 * qu'elle sert, en levant l'ambiguïté que la recherche laisse. Pour un prénom
 * unique, l'adresse existe quand même, mais elle renvoie droit à la fiche.
 */
function prenomPage(entree, ctx) {
  const { base, slugs, countryName, siecleSlug } = ctx;
  const { nom, list, titre, feminin } = entree;
  const url = `${base}/saints/${entree.slug}/`;
  const siecles = [...new Set(list.map((s) => centuryOf(s.born ?? s.died)).filter((n) => n != null))]
    .sort((a, b) => a - b);
  const pays = [...new Set(list.map((s) => countryName(s.country)))];

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`${nombre(list.length)} saint${feminin ? 'e' : ''}s de la carte portent le prénom ${nom}`
    + `${pays.length > 1 ? `, ${feminin ? 'venues' : 'venus'} de ${nombre(pays.length)} pays` : `, ${feminin ? 'toutes venues' : 'tous venus'} ${du(pays[0])}`}`
    + `${siecles.length > 1 ? `, du ${centuryLabel(siecles[0])} au ${centuryLabel(siecles[siecles.length - 1])}` : ''}. `
    + `Chacun${feminin ? 'e' : ''} avec ses dates, son lieu et son jour de fête.`)}</p>
<ul class="cards">
${list.map((s) => card(`../${slugs.get(s.id)}/`, s.name.fr,
    `${[s.city, countryName(s.country), formatFeast(s.feast)].filter(Boolean).join(' · ')}`)).join('')}</ul>
${siecles.length ? `<p class="note">Époques représentées : ${siecles
    .map((n) => `<a href="../../epoques/${esc(siecleSlug(n))}/">${esc(centuryLabel(n))}</a>`)
    .join(', ')}.</p>\n` : ''}
<p><a href="../">Tous les saints de la carte</a></p>`;

  return page({
    title: `${titre} — ${nombre(list.length)} saint${feminin ? 'e' : ''}s | SanctiMaps`,
    description: summary(`Les ${list.length} saint${feminin ? 'e' : ''}s prénommé${feminin ? 'e' : ''}s ${nom} `
      + `recensé${feminin ? 'e' : ''}s par SanctiMaps : ${list.slice(0, 8).map((s) => s.name.fr).join(', ')}.`),
    canonical: url,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Saints</a> › ${esc(nom)}`,
    trail: [['SanctiMaps', `${base}/`], ['Saints', `${base}/saints/`], [titre, url]],
    items: list.map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}/`]),
    body,
  });
}

/**
 * Une page de renvoi : l'adresse répond encore, et mène à la bonne.
 *
 * Les pages ont changé d'adresse — `saints/x.html` est devenu `saints/x/` —, et
 * un lien mis en signet ou cité ailleurs ne doit pas tomber dans le vide pour
 * autant. Le renvoi est immédiat, le lien canonique désigne la nouvelle
 * adresse, et `noindex` évite qu'un moteur garde les deux.
 *
 * C'est aussi ce qui fait répondre `saints/saint-maurice` quand un seul saint
 * porte ce prénom : l'adresse existe, elle mène à sa fiche.
 */
function renvoi({ titre, vers, canonical }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)} | SanctiMaps</title>
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=${esc(vers)}">
</head>
<body>
<p>Cette page a changé d’adresse : <a href="${esc(vers)}">${esc(titre)}</a>.</p>
</body>
</html>
`;
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
${list.map((s) => card(`../${slugs.get(s.id)}/`, s.name.fr,
    `${s.city} · ${formatFeast(s.feast)}`)).join('')}</ul>
<p><a href="../">Retour à l’index alphabétique</a></p>`;

  return page({
    title: `Les saints en ${letter} — ${list.length} fiches | SanctiMaps`,
    description: summary(`Les saints dont le nom commence par ${letter} : `
      + `${list.slice(0, 10).map((s) => s.name.fr).join(', ')}.`),
    canonical: `${base}/saints/lettre-${letter.toLowerCase()}/`,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Saints</a> › ${esc(letter)}`,
    body,
  });
}

function saintsIndex(saints, groups, ctx) {
  const { base, prenoms } = ctx;
  // Les prénoms les plus portés : c'est l'autre façon de chercher un saint —
  // « saint Maurice » plutôt que « Maurice d'Agaune » —, et c'est par là que
  // les pages de prénom sont atteintes.
  const tete = [...prenoms.entries()]
    .filter(([, p]) => p.list.length > 1)
    .sort((a, b) => b[1].list.length - a[1].list.length)
    .slice(0, 60);
  const body = `<h1>Tous les saints de la carte</h1>
<p class="lede">${esc(`${saints.length} saints recensés, rangés par initiale. Chaque nom mène à sa fiche : dates, lieu de naissance, jour de fête et biographie.`)}</p>
<ul class="cards">
${[...groups.entries()].map(([l, list]) => card(`lettre-${l.toLowerCase()}/`,
    `Les saints en ${l}`, `${list.length} fiche${list.length > 1 ? 's' : ''}`)).join('')}</ul>

<h2>Les prénoms les plus portés</h2>
<p class="lede">Plusieurs saints portent le même prénom, et on les cherche
souvent ainsi. Chaque prénom mène à la liste de ceux qui le portent.</p>
<ul class="cards">
${tete.map(([, p]) => card(`${p.slug}/`, p.titre,
    `${p.list.length} saints`)).join('')}</ul>`;

  return page({
    title: `Tous les saints — ${nombre(saints.length)} fiches | SanctiMaps`,
    description: `La liste alphabétique des ${saints.length} saints recensés par SanctiMaps, chacun avec sa fiche : dates, lieu de naissance, fête et biographie.`,
    canonical: `${base}/saints/`,
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
  const url = `${base}/lieux/${lieuxSlugs.get(key)}/`;
  const siecles = [...new Set(list.map((s) => centuryOf(s.born ?? s.died)).filter((n) => n != null))]
    .sort((a, b) => a - b);

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`Découvrez les ${nombre(list.length)} saints associés à ${nom} `
    + `(${countryName(iso)}) recensés par SanctiMaps`
    + `${siecles.length > 1 ? `, du ${centuryLabel(siecles[0])} au ${centuryLabel(siecles[siecles.length - 1])}` : ''}. `
    + `Pour chacun : ses dates, son jour de fête et sa fiche détaillée.`)}</p>
${siecles.length ? `<p class="note">Époques représentées : ${siecles
    .map((n) => `<a href="../../epoques/${esc(siecleSlug(n))}/">${esc(centuryLabel(n))}</a>`)
    .join(', ')}.</p>\n` : ''}
<a class="go" href="../../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.map((s) => card(`../../saints/${slugs.get(s.id)}/`, s.name.fr,
    `${formatFeast(s.feast)} · ${lifeLine(s) || '?'}`)).join('')}</ul>
<p><a href="../../pays/${esc(paysSlugs.get(iso))}/">Tous les saints ${esc(deSuffix(iso))}</a></p>`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints | SanctiMaps`,
    description: summary(`Les ${list.length} saints nés ${du(city)} (${countryName(iso)}) : `
      + `${list.slice(0, 8).map((s) => s.name.fr).join(', ')}.`),
    canonical: url,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Lieux</a> › ${esc(nom)}`,
    trail: [['SanctiMaps', `${base}/`], ['Lieux', `${base}/lieux/`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}/`]),
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
${rows.map(([key, list]) => card(`${lieuxSlugs.get(key)}/`,
    `Les saints ${du(key.split('|')[1])}`,
    `${countryName(key.split('|')[0])} · ${list.length} saints`)).join('')}</ul>`;

  return page({
    title: `Les saints par lieu — ${rows.length} villes | SanctiMaps`,
    description: `Les lieux de naissance des saints recensés par SanctiMaps : ${rows.length} villes et régions qui en comptent au moins deux.`,
    canonical: `${base}/lieux/`,
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
  const url = `${base}/epoques/${siecleSlug(n)}/`;
  const pays = new Map();
  for (const s of list) pays.set(s.country, (pays.get(s.country) || 0) + 1);
  const tete = [...pays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const body = `<h1>${esc(titre)}</h1>
<p class="lede">${esc(`${list.length} saints de la carte sont nés au ${centuryLabel(n)}`
    + `${tete.length ? `, surtout ${tete.map(([iso, k]) => `${countryName(iso)} (${k})`).join(', ')}` : ''}.`)}</p>
<a class="go" href="../../index.html">Ouvrir la carte</a>
<ul class="cards">
${list.slice(0, 400).map((s) => card(`../../saints/${slugs.get(s.id)}/`, s.name.fr,
    `${s.city} · ${countryName(s.country)} · ${formatFeast(s.feast)}`)).join('')}</ul>
${list.length > 400 ? `<p class="note">Les 400 plus anciens sont listés ici ; les ${list.length - 400} autres se trouvent par les pages de pays.</p>\n` : ''}`;

  return page({
    title: `${titre} — ${nombre(list.length)} saints | SanctiMaps`,
    description: summary(`Les ${list.length} saints du ${centuryLabel(n)} recensés par SanctiMaps, `
      + `avec leur lieu de naissance et leur jour de fête.`),
    canonical: url,
    up: 2,
    crumbs: `<a href="../../index.html">Carte</a> › <a href="../">Époques</a> › ${esc(centuryLabel(n))}`,
    trail: [['SanctiMaps', `${base}/`], ['Époques', `${base}/epoques/`], [titre, url]],
    items: list.slice(0, 100).map((s) => [s.name.fr, `${base}/saints/${slugs.get(s.id)}/`]),
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
${rows.map(([n, list]) => card(`${siecleSlug(n)}/`, centuryLabel(n),
    `${list.length} saint${list.length > 1 ? 's' : ''}`)).join('')}</ul>`;

  return page({
    title: 'Les saints par siècle — de l’Antiquité à nos jours | SanctiMaps',
    description: 'Les saints recensés par SanctiMaps rangés par siècle, du premier siècle à aujourd’hui.',
    canonical: `${base}/epoques/`,
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
${rows.map(([iso, list]) => card(`${paysSlugs.get(iso)}/`, `Saints ${deSuffix(iso)}`,
    `${countryName(iso)} · ${list.length} fiche${list.length > 1 ? 's' : ''}`)).join('')}</ul>`;

  return page({
    title: `Les saints par pays — ${rows.length} pays | SanctiMaps`,
    description: `Les saints recensés par SanctiMaps, classés par pays de naissance : ${rows.length} pays, de l’Italie au Pakistan.`,
    canonical: `${base}/pays/`,
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
      .map((k) => `  <li><a href="${esc(slug(dayLabel(k)))}/">${esc(k.split('-')[1])}</a></li>\n`).join('')}</ul>\n`;
  }).join('')}`;

  return page({
    title: 'Calendrier des saints — le saint de chaque jour | SanctiMaps',
    description: 'Le saint du jour, jour par jour : les fêtes du calendrier des saints de l’Église catholique.',
    canonical: `${base}/calendrier/`,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › Calendrier',
    body,
  });
}

/**
 * Les réglages de la newsletter par courriel (data/newsletter.json).
 *
 * `abonnement` est l'adresse du script Google qui reçoit les inscriptions
 * (voir newsletter/LISEZMOI.md). Tant qu'elle est vide, la page garde son
 * ancien texte : le site ne recueille aucune adresse.
 */
function lireReglagesNewsletter() {
  try {
    const reglages = JSON.parse(readFileSync(join(ROOT, 'data', 'newsletter.json'), 'utf8'));
    const adresse = String(reglages.abonnement || '').trim();
    return { abonnement: /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(adresse) ? adresse : '' };
  } catch {
    return { abonnement: '' };
  }
}

function sectionCourriel({ abonnement }) {
  if (!abonnement) {
    return `<h2>Par courriel</h2>
<p>SanctiMaps ne tient pas de fichier d’adresses, et n’en tiendra pas : le site
est fait de fichiers posés sur un hébergement, sans serveur pour recueillir
quoi que ce soit. Recueillir des adresses demanderait une machine à tenir, des
clés, et la garde de données personnelles qui ne nous regardent pas.</p>
<p>Pour recevoir la lettre dans votre boîte, passez donc par un relais de votre
choix — il en existe de gratuits, qui transforment un flux en courriel
quotidien. Donnez-lui l’adresse ci-dessus. Votre abonnement reste alors chez
vous, et le site n’apprend ni qui lit, ni combien.</p>`;
  }
  const champ = 'display:block;width:100%;max-width:420px;padding:.55em .7em;margin:.3em 0 .9em;'
    + 'border:1px solid currentColor;border-radius:6px;font:inherit;background:transparent;color:inherit';
  return `<h2>Par courriel</h2>
<p>Recevez chaque matin la newsletter de SanctiMaps dans votre boîte.
Un e-mail vous demandera de confirmer votre inscription.</p>
<form class="abonnement" method="post" action="${esc(abonnement)}">
  <label>Adresse e-mail<input type="email" name="email" required maxlength="254" autocomplete="email" style="${champ}"></label>
  <label>Prénom (facultatif)<input type="text" name="prenom" maxlength="80" autocomplete="given-name" style="${champ}"></label>
  <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="display:none">
  <input type="hidden" name="source" value="sanctimaps.fr/lettre">
  <p class="note">J’accepte de recevoir chaque jour par e-mail la newsletter de SanctiMaps.
  Je peux me désinscrire à tout moment via le lien présent dans chaque e-mail.</p>
  <p><button type="submit" class="go" style="cursor:pointer;font:inherit">Je m’inscris</button></p>
</form>
<p class="note">Vos données (adresse, prénom facultatif, dates d’inscription et de
confirmation) servent uniquement à l’envoi de la newsletter. Elles sont conservées
dans un tableur Google privé et ne sont jamais cédées. Chaque e-mail contient un lien
pour se désinscrire et, si vous le souhaitez, supprimer toutes vos données.</p>`;
}

/**
 * La page d'abonnement à la lettre quotidienne.
 *
 * Elle dit ce qu'un site sans serveur peut et ne peut pas : il publie un flux,
 * il ne tient pas de fichier d'adresses. Le lecteur choisit alors son moyen —
 * un lecteur de flux, un relais vers sa boîte, le calendrier de son téléphone,
 * ou l'application posée sur son écran d'accueil.
 */
function feedPage(ctx) {
  const { base, byDay } = ctx;
  const url = `${base}/lettre/`;
  const courriel = sectionCourriel(lireReglagesNewsletter());
  const body = `<h1>Recevoir le saint du jour</h1>
<p class="lede">Chaque matin, les saints fêtés ce jour-là, avec leur lieu de naissance,
leurs dates et leur biographie — ${esc(nombre(byDay))} jours de l’année pourvus.</p>

<h2>Par flux, dans votre lecteur</h2>
<p>L’adresse à donner à votre lecteur de nouvelles :</p>
<p><a class="go" href="../feed.xml">${esc(`${base}/feed.xml`)}</a></p>
<p class="note">C’est un flux Atom, régénéré chaque matin. Il porte les quatorze
derniers jours : vous abonner aujourd’hui vous rend aussi la quinzaine écoulée.</p>

${courriel}

<h2>Sur le téléphone</h2>
<p>Deux autres chemins, dans <a href="../index.html">les réglages de la carte</a> :
le <strong>calendrier du téléphone</strong>, qui garde les fêtes de l’année et
sonne à l’heure que vous fixez, hors ligne et sans compte ; et le
<strong>réveil en arrière-plan</strong>, une fois l’application posée sur
l’écran d’accueil, où le navigateur annonce lui-même le saint du jour.</p>

<h2>Ce que la lettre contient</h2>
<p>Pour chaque saint fêté : son nom, ses dates, sa ville et son pays de
naissance, sa notice, et sa biographie quand nous l’avons — rapportée de
Wikipédia, avec l’adresse de l’article. Tout est lisible dans le lecteur,
sans avoir à venir sur le site.</p>`;

  return page({
    title: 'Recevoir le saint du jour — la lettre quotidienne | SanctiMaps',
    description: 'Chaque matin, les saints fêtés ce jour-là avec leur biographie : '
      + 'par flux Atom, par courriel via un relais, ou par le calendrier du téléphone.',
    canonical: url,
    up: 1,
    crumbs: '<a href="../index.html">Carte</a> › La lettre',
    trail: [['SanctiMaps', `${base}/`], ['La lettre', url]],
    body,
  });
}

// ---------------------------------------------------------------------------
// Marche
// ---------------------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = lireCorpus();
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

  // -------------------------------------------------------------------------
  // Les prénoms
  // -------------------------------------------------------------------------
  //
  // On cherche « saint Maurice », et la carte ne connaît que « Maurice
  // d'Agaune » : l'adresse qu'on tape ne menait alors nulle part. Chaque prénom
  // reçoit donc la sienne — `saints/saint-maurice` —, qui liste ceux qui le
  // portent quand ils sont plusieurs, et mène droit à la fiche quand il est
  // seul.
  //
  // Le genre décide du préfixe : « sainte-therese » pour un prénom que seules
  // des femmes portent, « saint-maurice » sinon. L'autre forme existe quand
  // même, en renvoi — personne ne devrait avoir à deviner laquelle écrire.
  const parPrenom = new Map();
  for (const saint of sorted) {
    for (const nom of prenomsDe(saint)) {
      const clef = slug(nom);
      if (!parPrenom.has(clef)) parPrenom.set(clef, { nom, list: [] });
      parPrenom.get(clef).list.push(saint);
    }
  }

  // Une adresse de prénom ne prend jamais la place d'une fiche : « Sainte
  // Sophie » porte le titre dans son nom même, et sa fiche s'appelle déjà
  // `saints/sainte-sophie`. La fiche garde son adresse ; le prénom passe son
  // tour.
  const prisesParFiches = new Set(slugs.values());
  const prenoms = new Map();
  let volees = 0;
  for (const [clef, entree] of parPrenom) {
    const feminin = entree.list.every((s) => s.sex === 'f');
    const juste = `${feminin ? 'sainte' : 'saint'}-${clef}`;
    const autre = `${feminin ? 'saint' : 'sainte'}-${clef}`;
    // « Sainte Blandine » porte le titre dans son nom : sa fiche occupe déjà
    // `saints/sainte-blandine`, et elle la garde — c'est bien elle qu'on
    // cherche en écrivant cela. La liste des Blandine se range alors sous
    // l'autre graphie, plutôt que de n'exister nulle part.
    const adresse = prisesParFiches.has(juste) ? autre : juste;
    if (prisesParFiches.has(adresse)) { volees += 1; continue; }
    prenoms.set(clef, {
      ...entree,
      feminin,
      slug: adresse,
      // L'autre graphie, quand elle est libre : « saint-therese » doit répondre
      // comme « sainte-therese », et l'on ne sait pas laquelle sera écrite.
      alias: adresse === juste && !prisesParFiches.has(autre) ? autre : null,
      titre: `Les saint${feminin ? 'e' : ''}s prénommé${feminin ? 'e' : ''}s ${entree.nom}`,
    });
  }
  // La page de prénom qu'une fiche mentionne : la mieux pourvue de celles où
  // elle figure. « Maurice Tornay » renvoie ainsi aux trois Maurice, et non à
  // la page qui ne porterait que lui.
  const prenomParSaint = new Map();
  for (const entree of prenoms.values()) {
    if (entree.list.length < 2) continue;
    for (const s of entree.list) {
      const deja = prenomParSaint.get(s.id);
      if (!deja || deja.list.length < entree.list.length) prenomParSaint.set(s.id, entree);
    }
  }

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
    prenoms,
    prenomDe: (saint) => prenomParSaint.get(saint.id) || null,
    // La page du lieu, quand il en a une : un saint né dans un village qu'il
    // est seul à porter n'a pas de page de lieu, et son nom reste du texte.
    placeHref: (saint) => (lieuxSlugs.has(`${saint.country}|${saint.city}`)
      ? `../../lieux/${lieuxSlugs.get(`${saint.country}|${saint.city}`)}/` : null),
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

  // Chaque page est l'`index.html` d'un dossier à son nom : l'adresse s'écrit
  // alors sans extension. Les anciennes, en `.html`, restent en renvoi — elles
  // sont dans `renvois`, à part, pour que le plan du site les ignore.
  const files = [];
  const renvois = [];
  /** Une page, et le renvoi que son ancienne adresse laisse derrière elle. */
  const publier = (dossier, nom, corps, titre) => {
    files.push([`${dossier}/${nom}/index.html`, corps]);
    renvois.push([`${dossier}/${nom}.html`, renvoi({
      titre,
      vers: `${nom}/`,
      canonical: `${options.base}/${dossier}/${nom}/`,
    })]);
  };

  for (const saint of sorted) {
    publier('saints', slugs.get(saint.id), saintPage(saint, ctx), called(saint));
  }
  const groups = letterGroups(sorted);
  for (const [letter, list] of groups) {
    publier('saints', `lettre-${letter.toLowerCase()}`, letterPage(letter, list, ctx),
      `Les saints en ${letter}`);
  }
  files.push(['saints/index.html', saintsIndex(sorted, groups, ctx)]);

  // Les prénoms : une page pour ceux que plusieurs saints portent, un renvoi
  // vers la fiche pour les autres. Dans les deux cas l'adresse répond, ce qui
  // est tout ce qu'on lui demande.
  for (const entree of prenoms.values()) {
    if (entree.list.length > 1) {
      files.push([`saints/${entree.slug}/index.html`, prenomPage(entree, ctx)]);
      if (entree.alias) {
        renvois.push([`saints/${entree.alias}/index.html`, renvoi({
          titre: entree.titre,
          vers: `../${entree.slug}/`,
          canonical: `${options.base}/saints/${entree.slug}/`,
        })]);
      }
    } else {
      // Un seul porteur : l'adresse mène à sa fiche, et l'autre graphie n'est
      // pas écrite — deux mille huit cents renvois de plus pour un prénom que
      // presque personne ne cherche au mauvais genre.
      const seul = entree.list[0];
      const cible = slugs.get(seul.id);
      renvois.push([`saints/${entree.slug}/index.html`, renvoi({
        titre: called(seul),
        vers: `../${cible}/`,
        canonical: `${options.base}/saints/${cible}/`,
      })]);
    }
  }

  for (const [iso, list] of byCountry) {
    publier('pays', paysSlugs.get(iso), countryPage(iso, list, ctx),
      `Saints ${deSuffix(iso)}`);
  }
  files.push(['pays/index.html', countriesIndex(byCountry, ctx)]);
  for (const [key, list] of byPlace) {
    publier('lieux', lieuxSlugs.get(key), placePage(key, list, ctx),
      `Les saints ${du(key.split('|')[1])}`);
  }
  files.push(['lieux/index.html', placesIndex(byPlace, ctx)]);
  for (const [n, list] of byCentury) {
    publier('epoques', siecleSlug(n), centuryPage(n, list, ctx),
      `Les saints du ${centuryLabel(n)}`);
  }
  files.push(['epoques/index.html', centuriesIndex(byCentury, ctx)]);
  for (const [key, list] of byDay) {
    publier('calendrier', slug(dayLabel(key)), dayPage(key, list, ctx),
      `Saints fêtés le ${dayLabel(key)}`);
  }
  files.push(['calendrier/index.html', calendarIndex(byDay, ctx)]);
  files.push(['lettre/index.html', feedPage({ base: options.base, byDay: byDay.size })]);
  renvois.push(['lettre.html', renvoi({
    titre: 'Recevoir le saint du jour',
    vers: 'lettre/',
    canonical: `${options.base}/lettre/`,
  })]);

  // Le calendrier en abrégé, pour le service worker.
  //
  // Réveillé une fois par jour en arrière-plan, il doit savoir qui l'on fête
  // sans télécharger les cinq mégaoctets du corpus : on ne lui donne donc que
  // le nom, la ville, le pays et l'adresse de la fiche. Deux cents kilooctets
  // au lieu de cinq mille, et il n'a besoin de rien d'autre pour écrire une
  // notification.
  const calendrier = {};
  for (const [key, list] of [...byDay.entries()].sort()) {
    calendrier[key] = {
      // L'adresse de la page du jour : « 17-septembre », non « 09-17 ». La
      // notification se clique, et doit tomber sur une page qui existe.
      u: slug(dayLabel(key)),
      s: list.map((saint) => ({
        n: saint.name.fr,
        v: saint.city,
        p: countryName(saint.country),
        s: slugs.get(saint.id),
      })),
    };
  }
  files.push([join('data', 'generated', 'calendar.json'), JSON.stringify(calendrier)]);

  // Le plan du site : la liste complète, pour qui préfère la lire d'un coup
  // plutôt que de suivre les liens de proche en proche.
  //
  // Les adresses sont celles des dossiers, sans `index.html` à la fin : c'est
  // la forme qu'on partage et celle que les pages déclarent canonique, et le
  // plan ne doit pas en proposer une seconde pour la même page. Les renvois n'y
  // figurent pas — ils portent `noindex` et n'ont rien à faire indexer.
  const urls = ['', ...files.map(([path]) => path)
    .filter((p) => p.endsWith('index.html'))
    .map((p) => p.slice(0, -'index.html'.length))];
  files.push(['sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(`${options.base}/${u}`)}</loc></url>`).join('\n')}
</urlset>
`]);
  files.push(['robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${options.base}/sitemap.xml\n`]);

  const tout = [...files, ...renvois];
  const octets = tout.reduce((n, [, body]) => n + Buffer.byteLength(body), 0);
  console.log(`Pages : ${sorted.length} saints, ${prenoms.size} prénoms, ${byCountry.size} pays,`
    + ` ${byPlace.size} lieux, ${byDay.size} jours, ${byCentury.size} siècles`);
  console.log(`  ${files.length} pages et ${renvois.length} renvois,`
    + ` ${(octets / 1024 / 1024).toFixed(1)} Mo`);
  if (volees) {
    console.log(`  ${volees} prénoms sans page : les deux graphies sont déjà des fiches`);
  }
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
  for (const dir of ['saints', 'pays', 'calendrier', 'lieux', 'epoques', 'lettre']) {
    rmSync(join(ROOT, dir), { recursive: true, force: true });
    mkdirSync(join(ROOT, dir), { recursive: true });
  }
  // Chaque page vit dans son propre dossier : il faut le créer avant d'écrire.
  // On retient ceux déjà faits — cinq mille appels au système pour cinq mille
  // pages, c'est le genre de détail qui double le temps d'un import.
  const faits = new Set();
  for (const [path, body] of tout) {
    const dir = dirname(join(ROOT, path));
    if (!faits.has(dir)) { mkdirSync(dir, { recursive: true }); faits.add(dir); }
    writeFileSync(join(ROOT, path), body);
  }
  console.log(`\nÉcrit à la racine du site : saints/, pays/, lieux/, calendrier/, epoques/,`
    + ` lettre/, sitemap.xml, robots.txt`);
}

main();
