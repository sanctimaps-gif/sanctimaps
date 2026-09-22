/**
 * Envoie la lettre du jour par courriel.
 *
 *   node tools/send-letter.mjs --essai          # composer sans rien envoyer
 *   node tools/send-letter.mjs --date 2026-12-25 --essai
 *   node tools/send-letter.mjs                  # envoyer pour de bon
 *
 * ## Ce que cet outil fait, et ce qu'il ne fait pas
 *
 * Il compose la lettre du jour — les mêmes mots que le flux, écrits au même
 * endroit — et la remet à un routeur de courriel. C'est tout.
 *
 * Il ne tient **pas** de liste d'abonnés. Les adresses viennent de `MAIL_TO`,
 * c'est-à-dire d'un secret du dépôt, écrit à la main. Cela convient pour soi
 * et pour quelques personnes qui l'ont demandé ; cela ne convient pas à une
 * lettre publique, et il faut dire pourquoi plutôt que de le laisser
 * découvrir :
 *
 * - **Recueillir des adresses** demande un formulaire, donc un endroit qui
 *   reçoit — ce qu'un site de fichiers statiques n'a pas.
 * - **Le désabonnement** doit être immédiat et sans condition. Un lien qui
 *   marche suppose quelque chose qui l'écoute.
 * - **Le consentement** se prouve : qui s'est abonné, quand, et comment. Le
 *   RGPD ne s'accommode pas d'un fichier tenu de mémoire.
 *
 * Ces trois choses sont le métier des services de lettres d'information. Le
 * jour où la lettre s'ouvre au public, c'est à l'un d'eux qu'il faut confier
 * la liste — pas à ce fichier. En attendant, chaque envoi porte tout de même
 * de quoi se désabonner : une réponse suffit, et elle arrive à quelqu'un.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adressePublique, chargerCorpus, esc, lettreDuJour,
} from './lib/lettre.mjs';
import { envoieATous, nomsRouteurs, routeurConfigure } from './lib/mailers.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.document ??= { documentElement: {} };

const i18n = await import('../src/js/i18n.js');
i18n.setLanguage('fr');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Envoie la lettre du jour par courriel.

  --essai            composer et montrer, sans rien envoyer
  --date AAAA-MM-JJ  faire comme si l'on était ce jour-là
  --a ADRESSE        forcer le destinataire (sinon MAIL_TO)

Réglages par l'environnement :
  MAIL_PROVIDER      ${nomsRouteurs.join(' | ')}   (déduit si absent)
  MAIL_API_KEY       la clé du routeur
  MAIL_API_SECRET    le second jeton, pour Mailjet seul
  MAIL_FROM          « SanctiMaps <lettre@sanctimaps.fr> »
  MAIL_TO            une ou plusieurs adresses, séparées par des virgules
`;

function parseArgs(argv) {
  const options = { essai: false, date: null, a: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--essai' || arg === '--dry-run') options.essai = true;
    else if (arg === '--date') options.date = String(argv[i += 1]);
    else if (arg === '--a' || arg === '--to') options.a = String(argv[i += 1]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/**
 * La page de courriel : l'en-tête, la lettre, le pied.
 *
 * Pas de feuille de style, pas de tableau de mise en page, pas d'image : ce
 * qui traverse à la fois un webmail, un client de bureau et un téléphone. La
 * lettre se lit, elle ne se regarde pas.
 */
function page({ lettre, base, desabonnement }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(lettre.titre)}</title></head>
<body>
<p style="color:#6b6155;font-size:13px">SanctiMaps — la lettre du jour</p>
<h2>${esc(`Saints du ${lettre.jour}`)}</h2>
${lettre.html}
<hr>
<p style="color:#6b6155;font-size:12px">
Cette lettre est envoyée depuis <a href="${esc(base)}/">${esc(base.replace(/^https?:\/\//, ''))}</a>.
Les textes viennent de Wikidata (CC0) et de Wikipédia (CC BY-SA).<br>
${esc(desabonnement)}
</p>
</body></html>`;
}

function texteBrut({ lettre, base, desabonnement }) {
  return [
    `SanctiMaps — la lettre du jour`,
    `Saints du ${lettre.jour}`,
    '',
    lettre.texte,
    '',
    '—',
    `Envoyée depuis ${base}/`,
    'Textes : Wikidata (CC0) et Wikipédia (CC BY-SA).',
    desabonnement,
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }

  const base = adressePublique();
  const corpus = chargerCorpus();

  const date = options.date ? new Date(`${options.date}T09:00:00Z`) : new Date();
  date.setHours(9, 0, 0, 0);

  const lettre = lettreDuJour(date, { base, corpus, i18n });
  if (!lettre) {
    console.log(`Aucun saint au calendrier du jour : rien à envoyer.`);
    return;
  }

  const desabonnement = 'Pour ne plus la recevoir, répondez simplement à ce message.';
  const message = {
    sujet: lettre.titre,
    html: page({ lettre, base, desabonnement }),
    texte: texteBrut({ lettre, base, desabonnement }),
  };

  console.log(`Lettre du ${lettre.jour} : ${lettre.nombre} saints, `
    + `${(message.html.length / 1024).toFixed(0)} ko`);
  console.log(`  sujet : ${message.sujet}`);

  const config = routeurConfigure();
  if (!config) {
    console.log('\nAucun routeur configuré : « MAIL_API_KEY » est vide.');
    console.log('La lettre est composée, elle n’est pas envoyée. Voir --help.');
    if (options.essai) console.log(`\n${message.texte}`);
    return;
  }
  if (config.manque.length) {
    console.error(`\nRouteur ${config.routeur.label} : il manque ${config.manque.join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  const destinataires = options.a ? [options.a] : config.destinataires;
  if (!destinataires.length) {
    console.error('\nAucun destinataire : « MAIL_TO » est vide.');
    process.exitCode = 1;
    return;
  }
  if (!config.de.email) {
    console.error('\nAucun expéditeur : « MAIL_FROM » est vide.');
    process.exitCode = 1;
    return;
  }

  console.log(`  routeur : ${config.routeur.label}`);
  console.log(`  de : ${config.de.nom ? `${config.de.nom} <${config.de.email}>` : config.de.email}`);
  console.log(`  à : ${destinataires.length} destinataire${destinataires.length > 1 ? 's' : ''}`);

  if (options.essai) {
    console.log('\n--essai : rien n’a été envoyé. Voici le texte brut.\n');
    console.log(message.texte);
    return;
  }

  const resultats = await envoieATous({ ...config, destinataires }, message);
  const partis = resultats.filter((r) => r.ok).length;
  console.log(`\nEnvoyée à ${partis} destinataire${partis > 1 ? 's' : ''} sur ${resultats.length}.`);
  for (const r of resultats.filter((x) => !x.ok)) console.error(`  échec ${r.a} : ${r.erreur}`);
  if (partis !== resultats.length) process.exitCode = 1;
}

await main();
