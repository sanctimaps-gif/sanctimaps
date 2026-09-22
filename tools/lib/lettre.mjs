/**
 * La lettre d'un jour : ce que le flux publie et ce que le courriel envoie.
 *
 * Le texte est écrit ici, une fois. Deux rédactions séparées auraient divergé
 * au premier changement — l'une dirait « et 12 autres », l'autre « et 12 de
 * plus » —, et le lecteur abonné aux deux s'en apercevrait.
 *
 * Ce module ne sait ni écrire un fichier ni parler au réseau : il rend du
 * texte. `build-feed.mjs` en fait de l'Atom, `send-letter.mjs` en fait un
 * courriel.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCorpus } from './corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GEN = join(ROOT, 'data', 'generated');

/** L'adresse publique du site, lue du CNAME que GitHub Pages y pose. */
export function adressePublique() {
  try {
    const nom = readFileSync(join(ROOT, 'CNAME'), 'utf8').trim();
    if (nom) return `https://${nom}`;
  } catch { /* pas de domaine propre */ }
  return 'https://sanctimaps-gif.github.io/sanctimaps';
}

export const esc = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const slug = (text) => String(text ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’']/g, '-')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const clefDuJour = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Le corpus, rangé comme la lettre en a besoin.
 *
 * Les adresses des fiches sont celles des pages : on refait donc le même
 * calcul de slug, dans le même ordre — alphabétique — que `build-pages.mjs`.
 * Une lettre qui renverrait à des adresses inventées ne vaudrait rien.
 */
export function chargerCorpus() {
  const saints = lireCorpus()
    .filter((s) => (s.status ?? 'published') === 'published');
  const noms = JSON.parse(readFileSync(join(GEN, 'country-names.json'), 'utf8'));
  const countryName = (iso) => noms[iso]?.fr || iso;

  const vus = new Map();
  const slugs = new Map();
  for (const saint of [...saints].sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'))) {
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

  return { saints, parJour, slugs, countryName };
}

/** Les dates d'un saint, dites d'un trait. */
function vie(saint, { formatYear }) {
  const ne = saint.born != null
    ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : null;
  const mort = saint.died != null
    ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : null;
  if (ne && mort) return `${ne} – ${mort}`;
  return ne || mort || '';
}

/**
 * La lettre d'un jour, en HTML et en texte brut.
 *
 * Les deux, et non l'un ou l'autre : un courriel qui n'apporte que du HTML
 * part plus volontiers dans les indésirables, et certains lecteurs n'affichent
 * que le texte. Le flux, lui, ne prend que le HTML.
 *
 * Le HTML reste élémentaire — des titres, des paragraphes, des liens, aucune
 * feuille de style, aucun tableau de mise en page. C'est ce qui traverse à la
 * fois un lecteur de flux, un webmail et un client de bureau de vingt ans.
 */
export function lettreDuJour(date, { base, corpus, i18n }) {
  const { parJour, slugs, countryName } = corpus;
  const { formatFeast, formatYear, pickText } = i18n;
  const jour = formatFeast(clefDuJour(date));
  const list = parJour.get(clefDuJour(date)) || [];
  if (!list.length) return null;

  const noms = list.map((s) => s.name.fr);
  const titre = `Saints du ${jour} — ${noms.slice(0, 3).join(', ')}`
    + (list.length > 3 ? `, et ${list.length - 3} autres` : '');

  const html = [`<p>${esc(`${list.length} saint${list.length > 1 ? 's' : ''} au calendrier du ${jour}.`)}</p>`];
  const texte = [`${list.length} saint${list.length > 1 ? 's' : ''} au calendrier du ${jour}.`, ''];

  for (const saint of list) {
    const bio = pickText(saint.bio, 'fr');
    const notice = pickText(saint.desc, 'fr');
    const dates = vie(saint, { formatYear });
    const url = `${base}/saints/${slugs.get(saint.id)}.html`;
    const reperes = [dates, saint.city, countryName(saint.country)].filter(Boolean).join(' · ');

    html.push(`<h3><a href="${esc(url)}">${esc(saint.name.fr)}</a></h3>`);
    html.push(`<p><em>${esc(reperes)}</em></p>`);
    if (notice) html.push(`<p>${esc(notice)}</p>`);
    if (bio) html.push(`<p>${esc(bio)}</p>`);

    texte.push(saint.name.fr, reperes);
    if (notice) texte.push(notice);
    if (bio) texte.push(bio);
    texte.push(url, '');
  }

  const pageDuJour = `${base}/calendrier/${slug(jour)}.html`;
  html.push(`<p><a href="${esc(pageDuJour)}">Voir la page du ${esc(jour)}</a>`
    + ` · <a href="${esc(`${base}/`)}">La carte</a></p>`);
  texte.push(`Voir la page du ${jour} : ${pageDuJour}`, `La carte : ${base}/`);

  return { jour, titre, nombre: list.length, html: html.join('\n'), texte: texte.join('\n') };
}
