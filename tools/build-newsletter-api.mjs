/**
 * Les saints de chaque jour, en JSON, pour l'application de newsletter.
 *
 *   node tools/build-newsletter-api.mjs
 *   node tools/build-newsletter-api.mjs --base https://exemple.org/sanctimaps
 *
 * ## Pourquoi des fichiers, et non une API
 *
 * Le site n'a pas de serveur : il est fait de fichiers posés sur un
 * hébergement. L'application de newsletter, elle, en a un, et vient chercher
 * chaque matin ce qu'elle doit envoyer. Plutôt que d'ouvrir un serveur ici
 * pour lui répondre, on lui prépare la réponse d'avance : un fichier par jour
 * de l'année, régénéré avec les pages.
 *
 *   api/newsletter/09-23.json     les saints du 23 septembre
 *   api/newsletter/index.json     ce qui est publié, et quand
 *
 * Un jour de l'année, et non une date : les fêtes reviennent chaque année au
 * même jour. L'application demande le fichier du jour et vérifie qu'il est
 * bien celui qu'elle attendait (champ `day`).
 *
 * Ces fichiers ne disent rien de plus que les pages publiques : aucune clé
 * n'est donc nécessaire pour les lire. Ils ne touchent pas aux données : ils
 * les lisent seulement.
 *
 * ## L'ordre des saints
 *
 * Certains jours en comptent plus de cent. La newsletter n'en présente que
 * quelques-uns en détail, et renvoie pour les autres à la page du jour. Les
 * saints sont donc rangés du plus au moins « présentable » : d'abord les
 * fiches écrites à la main (les grandes figures), celles qui ont un patronage,
 * une biographie et plusieurs sources ; en dernier, celles qui n'ont presque
 * rien à raconter.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adressePublique, chargerCorpus, slug } from './lib/lettre.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const i18n = await import('../src/js/i18n.js');
i18n.setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'api', 'newsletter');
const VERSION = 1;

function parseArgs(argv) {
  const options = { base: adressePublique() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') options.base = String(argv[i += 1]).replace(/\/+$/, '');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/** Plus le score est haut, plus la fiche a de quoi remplir une lettre. */
function score(saint) {
  const bio = i18n.pickText(saint.bio, 'fr') || '';
  const desc = i18n.pickText(saint.desc, 'fr') || '';
  let points = 0;
  if (!saint.source) points += 100;            // fiche écrite à la main
  if (saint.patronage) points += 30;
  if (bio) points += 20 + Math.min(bio.length, 600) / 60;
  if (desc) points += 5;
  points += 5 * (saint.sources?.length || 0);
  if ((saint.titles || []).some((t) => ['apostle', 'evangelist', 'pope', 'prophet'].includes(t))) points += 15;
  // Une fiche sans aucun texte ne peut pas ouvrir une lettre, si grande soit la figure.
  if (!bio && !desc) points -= 150;
  return points;
}

function vie(saint) {
  const { formatYear } = i18n;
  const ne = saint.born != null ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : null;
  const mort = saint.died != null ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : null;
  if (ne && mort) return `${ne} – ${mort}`;
  return ne || mort || null;
}

function jours() {
  const out = [];
  const d = new Date(Date.UTC(2024, 0, 1)); // année bissextile : les 366 jours
  while (d.getUTCFullYear() === 2024) {
    out.push(`${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Écrit api/newsletter/<MM-JJ>.json pour les 366 jours.\n\n  --base URL    adresse publique du site');
    return;
  }
  const { base } = options;
  const corpus = chargerCorpus();
  const { parJour, slugs, countryName } = corpus;

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  let total = 0;
  let vides = 0;
  for (const day of jours()) {
    // Le 29 février n'a pas toujours ses propres saints : on reprend alors le 28.
    const cle = parJour.has(day) || day !== '02-29' ? day : '02-28';
    const list = [...(parJour.get(cle) || [])]
      .map((s) => ({ s, p: score(s) }))
      .sort((a, b) => b.p - a.p || a.s.name.fr.localeCompare(b.s.name.fr, 'fr'))
      .map(({ s }) => s);
    // `formatFeast` compte sur une année ordinaire, où le 29 février n'existe pas.
    const label = day === '02-29' ? '29 février' : i18n.formatFeast(day);
    const pageDuJour = i18n.formatFeast(cle === '02-29' ? '02-28' : cle);

    const saints = list.map((saint) => ({
      id: saint.id,
      name: saint.name.fr,
      description: i18n.pickText(saint.desc, 'fr') || null,
      biography: i18n.pickText(saint.bio, 'fr') || null,
      image: null,
      url: `${base}/saints/${slugs.get(saint.id)}/`,
      life: vie(saint),
      place: [saint.city, countryName(saint.country)].filter(Boolean).join(', ') || null,
      patronage: i18n.pickText(saint.patronage, 'fr') || null,
    }));

    writeFileSync(join(OUT, `${day}.json`), `${JSON.stringify({
      version: VERSION,
      day,
      label,
      day_url: `${base}/calendrier/${slug(pageDuJour)}/`,
      total: saints.length,
      saints,
    })}\n`);
    total += saints.length;
    if (!saints.length) vides += 1;
  }

  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({
    version: VERSION,
    days: 366,
    url_template: `${base}/api/newsletter/{MM-DD}.json`,
  }, null, 2)}\n`);

  const fichiers = readdirSync(OUT).length;
  console.log(`${fichiers} fichiers écrits dans api/newsletter/ (${total} saints, ${vides} jour(s) sans saint).`);
  if (vides) process.exitCode = 1;
}

main();
