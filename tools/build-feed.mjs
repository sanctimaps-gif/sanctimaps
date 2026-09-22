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

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adressePublique, chargerCorpus, clefDuJour, esc, lettreDuJour, slug,
} from './lib/lettre.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const i18n = await import('../src/js/i18n.js');
i18n.setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  base: adressePublique(),
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  // Le corpus et le texte de la lettre viennent de `lib/lettre.mjs`, que le
  // courriel lit aussi : deux rédactions séparées auraient divergé au premier
  // changement, et le lecteur abonné aux deux s'en serait aperçu.
  const corpus = chargerCorpus();

  const aujourdhui = options.date ? new Date(`${options.date}T09:00:00Z`) : new Date();
  aujourdhui.setHours(9, 0, 0, 0);

  const entrees = [];
  for (let i = 0; i < options.jours; i += 1) {
    const date = new Date(aujourdhui);
    date.setDate(date.getDate() - i);
    const lettre = lettreDuJour(date, { base: options.base, corpus, i18n });
    if (!lettre) continue;
    entrees.push({
      date,
      jour: lettre.jour,
      titre: lettre.titre,
      // L'identifiant porte l'année : la même fête revient tous les ans, et un
      // lecteur de flux ne doit pas prendre celle de cette année pour un
      // doublon de l'an dernier.
      id: `${options.base}/feed/${date.getFullYear()}-${clefDuJour(date)}`,
      lien: `${options.base}/calendrier/${slug(lettre.jour)}/`,
      corps: lettre.html,
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
