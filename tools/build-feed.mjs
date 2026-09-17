/**
 * La lettre quotidienne : les saints du jour, avec leur biographie.
 *
 *   node tools/build-feed.mjs                 # aujourd'hui
 *   node tools/build-feed.mjs --jours 14      # la quinzaine écoulée
 *   node tools/build-feed.mjs --date 2026-12-25
 *
 * ## Pourquoi un flux, et non des courriels
 *
 * Une vraie lettre par courriel suppose deux choses qu'un site de fichiers
 * statiques n'a pas : un endroit où recueillir les adresses — donc un serveur
 * qui accepte un formulaire —, et un expéditeur qui parte chaque matin — donc
 * un compte chez un routeur, une clé, et la responsabilité d'un fichier
 * d'adresses. Ce sont des choix d'infrastructure, avec leur coût et leurs
 * obligations ; ils ne se prennent pas au détour d'un outil.
 *
 * Un flux Atom, lui, ne demande rien. Le fichier est posé à côté des autres,
 * chacun s'y abonne dans son lecteur, et le site n'apprend ni qui lit ni
 * combien. Qui préfère le courriel passe par un relais de son choix — il en
 * existe de gratuits — et l'abonnement reste alors son affaire, non la nôtre.
 *
 * ## Ce que porte une entrée
 *
 * Une entrée par jour, la plus récente en tête, et dans chacune : tous les
 * saints fêtés ce jour-là, leur ville, leur pays, leurs dates, et la biographie
 * quand on l'a. C'est-à-dire la lettre elle-même, lisible dans le lecteur sans
 * avoir à cliquer — pas une amorce qui renverrait au site.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const { formatFeast, formatYear, pickText, setLanguage } = await import('../src/js/i18n.js');
setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'generated');

const DEFAULTS = {
  base: (() => {
    try {
      const nom = readFileSync(join(ROOT, 'CNAME'), 'utf8').trim();
      if (nom) return `https://${nom}`;
    } catch { /* pas de domaine propre */ }
    return 'https://sanctimaps-gif.github.io/sanctimaps';
  })(),
  // Quatorze jours : un lecteur qui s'abonne aujourd'hui, ou qui revient après
  // une semaine de vacances, retrouve ce qu'il a manqué. Au-delà, le flux
  // grossit sans servir.
  jours: 14,
  date: null,
  out: join(ROOT, 'feed.xml'),
};

const HELP = `Écrit la lettre quotidienne au format Atom.

  --jours N     nombre de jours dans le flux (défaut 14)
  --date AAAA-MM-JJ  faire comme si l'on était ce jour-là
  --base URL    adresse publique du site
  --out FICHIER autre destination que feed.xml
`;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--jours') options.jours = Math.max(1, Number(argv[i += 1]) || 1);
    else if (arg === '--date') options.date = String(argv[i += 1]);
    else if (arg === '--base') options.base = String(argv[i += 1]).replace(/\/+$/, '');
    else if (arg === '--out') options.out = argv[i += 1];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

const esc = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const slug = (text) => String(text ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’']/g, '-')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const clef = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Les dates d'un saint, dites d'un trait. */
function vie(saint) {
  const ne = saint.born != null
    ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : null;
  const mort = saint.died != null
    ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : null;
  if (ne && mort) return `${ne} – ${mort}`;
  return ne || mort || '';
}

/**
 * Le corps d'une entrée : un jour de fête, tous ses saints.
 *
 * C'est du HTML, parce qu'un lecteur de flux sait l'afficher et qu'une liste
 * de quinze saints en texte brut serait illisible. Il reste simple — des
 * titres, des paragraphes, des liens — pour passer partout, y compris dans un
 * courriel produit par un relais.
 */
function corpsDuJour(list, { base, slugs, countryName, jour }) {
  const parts = [`<p>${esc(`${list.length} saint${list.length > 1 ? 's' : ''} au calendrier du ${jour}.`)}</p>`];

  for (const saint of list) {
    const bio = pickText(saint.bio, 'fr');
    const notice = pickText(saint.desc, 'fr');
    const dates = vie(saint);
    const url = `${base}/saints/${slugs.get(saint.id)}.html`;
    parts.push(`<h3><a href="${esc(url)}">${esc(saint.name.fr)}</a></h3>`);
    parts.push(`<p><em>${esc([dates, saint.city, countryName(saint.country)].filter(Boolean).join(' · '))}</em></p>`);
    if (notice) parts.push(`<p>${esc(notice)}</p>`);
    if (bio) parts.push(`<p>${esc(bio)}</p>`);
  }

  parts.push(`<p><a href="${esc(`${base}/calendrier/${slug(jour)}.html`)}">Voir la page du ${esc(jour)}</a>`
    + ` · <a href="${esc(`${base}/`)}">La carte</a></p>`);
  return parts.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const saints = JSON.parse(readFileSync(join(GEN, 'saints.json'), 'utf8')).saints
    .filter((s) => (s.status ?? 'published') === 'published');
  const names = JSON.parse(readFileSync(join(GEN, 'country-names.json'), 'utf8'));
  const countryName = (iso) => names[iso]?.fr || iso;

  // Les adresses des fiches sont celles des pages : le flux doit renvoyer aux
  // mêmes, et non en inventer. On refait donc le même calcul, dans le même
  // ordre — alphabétique — que `build-pages.mjs`.
  const tries = [...saints].sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'));
  const vus = new Map();
  const slugs = new Map();
  for (const saint of tries) {
    const base = slug(saint.name.fr) || 'saint';
    const n = (vus.get(base) || 0) + 1;
    vus.set(base, n);
    slugs.set(saint.id, n === 1 ? base : `${base}-${n}`);
  }

  const parJour = new Map();
  for (const saint of saints) {
    if (!parJour.has(saint.feast)) parJour.set(saint.feast, []);
    parJour.get(saint.feast).push(saint);
  }
  for (const list of parJour.values()) list.sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'));

  const aujourdhui = options.date ? new Date(`${options.date}T09:00:00Z`) : new Date();
  aujourdhui.setHours(9, 0, 0, 0);

  const entrees = [];
  for (let i = 0; i < options.jours; i += 1) {
    const date = new Date(aujourdhui);
    date.setDate(date.getDate() - i);
    const list = parJour.get(clef(date)) || [];
    if (!list.length) continue;
    const jour = formatFeast(clef(date));
    entrees.push({
      date,
      jour,
      titre: `Saints du ${jour} — ${list.map((s) => s.name.fr).slice(0, 3).join(', ')}`
        + (list.length > 3 ? `, et ${list.length - 3} autres` : ''),
      // L'identifiant porte l'année : la même fête revient tous les ans, et un
      // lecteur de flux ne doit pas prendre celle de cette année pour un
      // doublon de l'an dernier.
      id: `${options.base}/feed/${date.getFullYear()}-${clef(date)}`,
      lien: `${options.base}/calendrier/${slug(jour)}.html`,
      corps: corpsDuJour(list, { base: options.base, slugs, countryName, jour }),
    });
  }

  const maj = entrees[0]?.date.toISOString() || new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">
  <title>SanctiMaps — le saint du jour</title>
  <subtitle>Chaque jour, les saints fêtés, avec leur lieu de naissance et leur biographie.</subtitle>
  <link rel="self" href="${esc(`${options.base}/feed.xml`)}"/>
  <link rel="alternate" type="text/html" href="${esc(`${options.base}/`)}"/>
  <id>${esc(`${options.base}/feed.xml`)}</id>
  <icon>${esc(`${options.base}/icons/icon-192.png`)}</icon>
  <logo>${esc(`${options.base}/icons/icon-512.png`)}</logo>
  <updated>${maj}</updated>
  <author><name>SanctiMaps</name><uri>${esc(`${options.base}/`)}</uri></author>
  <rights>Données de Wikidata (CC0) et de Wikipédia (CC BY-SA).</rights>
${entrees.map((e) => `  <entry>
    <title>${esc(e.titre)}</title>
    <id>${esc(e.id)}</id>
    <link rel="alternate" type="text/html" href="${esc(e.lien)}"/>
    <updated>${e.date.toISOString()}</updated>
    <published>${e.date.toISOString()}</published>
    <content type="html">${esc(e.corps)}</content>
  </entry>`).join('\n')}
</feed>
`;

  writeFileSync(options.out, xml);
  const total = entrees.reduce((n, e) => n + (e.corps.match(/<h3>/g) || []).length, 0);
  console.log(`Lettre quotidienne : ${entrees.length} jours, ${total} saints, ${(xml.length / 1024).toFixed(0)} ko`);
  console.log(`  la plus récente : ${entrees[0]?.titre || '(aucune)'}`);
  console.log(`Écrit dans ${options.out}`);
}

main();
