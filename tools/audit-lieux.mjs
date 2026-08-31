/**
 * Passe le corpus au crible géographique, et dit ce qu'il vaut.
 *
 *   node tools/audit-lieux.mjs
 *   node tools/audit-lieux.mjs --detail       # la liste, et non le seul compte
 *
 * ## Pourquoi un audit plutôt qu'un contrôle
 *
 * `check-data.mjs` refuse ce qui est faux : un pays inconnu, un point hors du
 * cadre, une fête mal formée. Il ne dit rien de ce qui est *vrai mais grossier*
 * — « né en Irlande » pour un homme dont on ignore le village, un nom resté en
 * anglais faute de forme française. Cela ne casse rien, ne se voit pas à
 * l'usage, et pèse pourtant sur la valeur de chaque page.
 *
 * Cet outil compte ces cas-là et les nomme. Il ne corrige rien : la moitié de
 * ce qu'il signale n'est pas corrigible sans une source meilleure, et l'autre
 * moitié demande une décision qui n'appartient pas à un programme.
 *
 * ## Ce qu'il ne faut pas prendre pour une erreur
 *
 * Un saint porte presque toujours le nom du lieu où on le vénère, non celui où
 * il est né : Nazaire **de Milan** est né à Rome, Pancrace **de Taormine** à
 * Antioche, Ovídio **de Braga** en Sicile. La carte, elle, porte le lieu de
 * naissance. La divergence entre les deux est la règle, non l'exception —
 * mille trois cent vingt-huit fiches sur mille huit cent soixante-deux —, et
 * l'audit la compte sans la compter comme une faute.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(ROOT, 'data', 'generated');

const fold = (t) => String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Régions et provinces qu'on rencontre à la place d'une ville.
 *
 * Wikidata donne parfois pour lieu de naissance une province romaine ou une
 * nation entière — c'est tout ce que la tradition sait. Écrite telle quelle,
 * la fiche annonce « né en Cappadoce » et pose pourtant une croix précise sur
 * la carte : la liste sert à distinguer ce qui est un lieu de ce qui est une
 * contrée.
 */
const REGIONS = new Set([
  'afrique du nord', 'asie mineure', 'gaule', 'thrace', 'galilee', 'judee',
  'samarie', 'cappadoce', 'phrygie', 'bithynie', 'lycie', 'pannonie',
  'dalmatie', 'numidie', 'mauretanie', 'iberie', 'perse', 'mesopotamie',
  'sicile', 'sardaigne', 'corse', 'toscane', 'ombrie', 'calabre', 'pouilles',
  'campanie', 'lombardie', 'venetie', 'piemont', 'ligurie', 'latium',
  'ecosse', 'angleterre', 'pays de galles', 'cornouailles', 'ulster',
  'flandre', 'bretagne', 'normandie', 'provence', 'aquitaine', 'bourgogne',
  'picardie', 'champagne', 'lorraine', 'alsace', 'auvergne', 'languedoc',
  'savoie', 'dauphine', 'poitou', 'anjou', 'berry', 'limousin', 'gascogne',
  'catalogne', 'castille', 'andalousie', 'galice', 'aragon', 'navarre',
  'baviere', 'saxe', 'souabe', 'franconie', 'westphalie', 'rhenanie',
  'hebei', 'henan', 'shandong', 'shanxi', 'sichuan', 'jiangsu', 'zhejiang',
  'moravie', 'boheme', 'silesie', 'mazovie', 'transylvanie', 'moldavie',
]);

/** Tournures qui trahissent un nom resté dans une autre langue. */
const ETRANGER = [
  [/\bof\b|\bthe\b/i, 'anglaise'],
  [/\by\b|\bdel\b|\bde los\b|\bde las\b/, 'espagnole'],
  [/\bda\b|\bdo\b|\bdos\b/, 'portugaise'],
  [/\bvon\b|\bzu\b/, 'allemande'],
  [/\bdi\b|\bdegli\b|\bdella\b/, 'italienne'],
];

/** Le lieu que le nom du saint désigne : « Nazaire de Milan » -> « Milan ». */
function placeInName(name) {
  const m = /(?:\sde\s|\sd[’']|\sof\s|\sda\s|\sdi\s|\sdel\s)(.+)$/i.exec(String(name || ''));
  if (!m) return null;
  const rest = m[1].trim();
  // « de Jésus », « du Saint-Sacrement » : un nom de religion, pas un lieu.
  if (/^(jesus|christ|marie|dieu|la croix|saint|sainte|l[’']enfant)/i.test(fold(rest))) return null;
  return rest;
}

const detail = process.argv.includes('--detail');
const saints = JSON.parse(readFileSync(join(GEN, 'saints.json'), 'utf8')).saints;
const names = JSON.parse(readFileSync(join(GEN, 'country-names.json'), 'utf8'));
const paysFr = new Set(Object.values(names).map((n) => fold(n.fr)));

const cas = {
  sansVille: [],
  villePays: [],
  villeRegion: [],
  nomEtranger: [],
  nomDivergent: [],
  sansBio: [],
  sansNotice: [],
};

for (const s of saints) {
  const ville = fold(s.city);
  if (!ville) cas.sansVille.push(s);
  else if (paysFr.has(ville)) cas.villePays.push([s, s.city]);
  else if (REGIONS.has(ville)) cas.villeRegion.push([s, s.city]);

  for (const [motif, langue] of ETRANGER) {
    if (motif.test(s.name.fr)) { cas.nomEtranger.push([s, langue]); break; }
  }

  const lieu = placeInName(s.name.fr);
  if (lieu && ville && !fold(lieu).includes(ville) && !ville.includes(fold(lieu))) {
    cas.nomDivergent.push([s, lieu]);
  }

  if (!s.bio?.fr) cas.sansBio.push(s);
  if (!s.desc?.fr) cas.sansNotice.push(s);
}

const pc = (n) => `${((100 * n) / saints.length).toFixed(1)} %`;
const ligne = (titre, liste) => {
  console.log(`  ${String(liste.length).padStart(4)}  ${pc(liste.length).padStart(6)}  ${titre}`);
};

console.log(`Audit géographique — ${saints.length} fiches publiées\n`);
console.log('CE QUI DEMANDE UNE MEILLEURE SOURCE');
ligne('sans lieu de naissance du tout', cas.sansVille);
ligne('un pays entier tient lieu de ville', cas.villePays);
ligne('une région ou une province tient lieu de ville', cas.villeRegion);
console.log('\nCE QUI DEMANDE UNE FORME FRANÇAISE');
ligne('nom resté dans une autre langue', cas.nomEtranger);
ligne('sans notice en français', cas.sansNotice);
ligne('sans biographie en français', cas.sansBio);
console.log('\nCE QUI N’EST PAS UNE FAUTE');
ligne('le nom désigne un autre lieu que la naissance', cas.nomDivergent);
console.log('        (un saint porte le nom du lieu où on le vénère,');
console.log('         la carte porte celui où il est né : les deux diffèrent');
console.log('         presque toujours, et les deux sont exacts)');

if (detail) {
  for (const [titre, liste] of [
    ['SANS VILLE', cas.sansVille.map((s) => [s, ''])],
    ['UN PAYS POUR VILLE', cas.villePays],
    ['UNE RÉGION POUR VILLE', cas.villeRegion],
    ['NOM ÉTRANGER', cas.nomEtranger],
  ]) {
    console.log(`\n--- ${titre} ---`);
    for (const [s, quoi] of liste.slice(0, 60)) {
      console.log(`  ${s.name.fr.padEnd(38)} ${String(quoi).padEnd(20)} ${s.country}  ${s.id}`);
    }
    if (liste.length > 60) console.log(`  … et ${liste.length - 60} autres`);
  }
}
