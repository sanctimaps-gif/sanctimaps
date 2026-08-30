/**
 * Assistant expert — sans modèle, sans réseau, sans fournisseur.
 *
 * Ce que faisait le modèle de langue tenait en trois choses très différentes :
 * **savoir** qu'un saint existe et ce qu'il fut, **raconter** sa vie, et
 * **placer** son lieu sur la carte. Les deux premières demandent une mémoire ;
 * la troisième, une table.
 *
 * Or une mémoire écrite une fois pour toutes est une table comme une autre.
 * L'application emporte donc deux fonds : cent quarante-huit fiches rédigées à
 * l'avance — dates, fête, qualités, patronage, histoire, lieu de naissance et
 * lieu de mort — et cent treize mille localités avec leurs coordonnées. Le nom
 * du saint ouvre la première ; le nom du lieu ouvre la seconde.
 *
 * Rien n'est deviné, donc rien n'est inventé : ce que le fond ne contient pas,
 * l'assistant le dit au lieu de le combler. C'est toute la différence entre un
 * index et un modèle, et sur des faits datés l'index gagne.
 */

import { fold } from './data.js';

/** Nombre de propositions rendues pour une recherche. */
const MAX_MATCHES = 8;

/** Classe une liste de candidats : nom exact, puis début de nom, puis inclusion. */
function rank(forms, needle) {
  let best = -1;
  for (const form of forms) {
    const name = fold(form);
    if (!name) continue;
    if (name === needle) return 3;
    if (name.startsWith(needle)) best = Math.max(best, 2);
    else if (name.includes(needle)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Cherche un saint dans le fond documentaire.
 *
 * Les graphies alternatives comptent autant que le nom principal : « Kunjachan »
 * ramène Augustin Thevarparampil, et « Madre Lupita » ramène María Guadalupe
 * García Zavala, parce que c'est ainsi qu'on les nomme.
 */
export function findSaints(entries, query) {
  const needle = fold(String(query || '').trim());
  if (needle.length < 2) return [];

  const scored = [];
  for (const entry of entries) {
    const forms = [...Object.values(entry.name || {}), ...(entry.aka || [])];
    const score = rank(forms, needle);
    if (score < 0) continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_MATCHES).map((s) => s.entry);
}

/**
 * Cherche le même nom dans le corpus déjà en place.
 *
 * Utile avant tout travail : savoir tout de suite qu'un saint est déjà sur la
 * carte évite de composer une fiche que la vérification rejettera en doublon.
 */
export function findKnown(atlas, query) {
  const needle = fold(String(query || '').trim());
  if (needle.length < 2) return [];
  const out = [];
  for (const saint of atlas.everySaint) {
    const forms = typeof saint.name === 'string' ? [saint.name] : Object.values(saint.name || {});
    if (rank(forms, needle) >= 0) out.push(saint);
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

/**
 * Cherche une localité dans un pays.
 *
 * Un nom exact l'emporte sur un début de nom, qui l'emporte sur une simple
 * inclusion ; à égalité, la population tranche. « Saint-Pierre » ramène ainsi
 * d'abord la commune qui porte exactement ce nom, non les douze
 * « Saint-Pierre-de-quelque-chose ».
 *
 * `aliases` fait le pont entre les langues : la table ne connaît qu'un nom par
 * lieu, tantôt local (Assisi), tantôt anglais (Rome), et l'on veut pouvoir
 * chercher dans la langue où l'on pense.
 */
export function findPlaces(places, query, aliases) {
  const asked = fold(String(query || '').trim());
  if (!asked) return [];
  const needle = fold(aliases?.[asked] || asked);

  const scored = [];
  for (const place of places) {
    const score = rank([place.n], needle);
    if (score < 0) continue;
    scored.push({ place, score });
  }

  scored.sort((a, b) => b.score - a.score || (b.place.p || 0) - (a.place.p || 0));
  return scored.slice(0, MAX_MATCHES).map((s) => s.place);
}

/**
 * Assemble une fiche à partir de ce que l'atelier a rassemblé.
 *
 * Deux origines possibles pour le point : la localité retrouvée dans la table,
 * dont on retourne la projection pour tomber exactement là où la carte dessine
 * la ville ; ou, si la table ne connaît pas ce village, les coordonnées portées
 * par la fiche de référence. Les champs laissés vides le restent : une fiche
 * incomplète se corrige, une fiche inventée se propage.
 */
export function buildDraft({
  name, sex, country, city, place, lat, lng, placeKind,
  born, died, circa, feast, titles, desc, patronage, bio,
}) {
  const point = place ? unproject(place) : { lat: Number(lat), lng: Number(lng) };
  const draft = {
    name: { fr: String(name).trim() },
    sex: sex || 'm',
    born: born === '' || born == null ? null : Number(born),
    died: died === '' || died == null ? null : Number(died),
    circa: Boolean(circa),
    city: place ? place.n : String(city || '').trim(),
    country,
    lat: Number(point.lat.toFixed(4)),
    lng: Number(point.lng.toFixed(4)),
    feast: feast || '',
    titles: [...(titles || [])],
    source: 'expert',
  };
  // Le point porté sur la carte est une naissance par défaut ; quand c'est une
  // mort, la fiche le dit, faute de quoi le lecteur croirait à un lieu de
  // naissance qui n'en est pas un.
  if (placeKind === 'died') draft.placeKind = 'died';
  if (desc && desc.trim()) draft.desc = { fr: desc.trim() };
  if (patronage && patronage.trim()) draft.patronage = { fr: patronage.trim() };
  if (bio && bio.trim()) draft.bio = { fr: bio.trim() };
  return draft;
}

/** La valeur d'un champ traduit, dans la langue voulue puis à défaut. */
export function pick(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.fr || value.en || '';
}

/**
 * Coordonnées géographiques d'une localité.
 *
 * La table les stocke en unités monde, projetées une fois pour toutes à la
 * génération ; les fiches, elles, se lisent en degrés. On refait donc le
 * chemin inverse, ce qui garantit que le point retenu tombe exactement là où
 * la carte dessine la ville.
 */
function unproject(place) {
  const WORLD = 1000000;
  const x = place.x % WORLD;
  const lng = (x / WORLD) * 360 - 180;
  const t = Math.PI * (1 - (2 * place.y) / WORLD);
  const lat = (2 * Math.atan(Math.exp(t)) - Math.PI / 2) * 180 / Math.PI;
  return { lat, lng };
}

/**
 * Ce qui manque au corpus, tel que le corpus lui-même le révèle.
 *
 * Aucune opinion là-dedans : ce sont des comptes. Ils disent où porter
 * l'effort, ce qu'un modèle ne saurait pas mieux faire puisque la réponse est
 * dans les données.
 */
export function surveyGaps(atlas) {
  const saints = atlas.saints;
  const withoutPatronage = saints.filter((s) => !s.patronage).length;
  const withoutBio = saints.filter((s) => !s.bio).length;
  const withoutDesc = saints.filter((s) => !s.desc).length;

  const counted = new Map();
  for (const saint of saints) counted.set(saint.country, (counted.get(saint.country) || 0) + 1);

  // Les continents les moins pourvus, rapportés au nombre de pays qu'ils
  // comptent : c'est là que la carte est la plus vide.
  const byContinent = atlas.continents.map((continent) => {
    const total = continent.countries.reduce((n, id) => n + (counted.get(id) || 0), 0);
    const covered = continent.countries.filter((id) => counted.has(id)).length;
    return { id: continent.id, total, covered, countries: continent.countries.length };
  }).sort((a, b) => a.total - b.total);

  return {
    saints: saints.length,
    countries: counted.size,
    withoutPatronage,
    withoutBio,
    withoutDesc,
    byContinent,
  };
}
