/**
 * Assistant expert — sans modèle, sans réseau, sans fournisseur.
 *
 * Ce que faisait le modèle de langue tenait en deux choses très différentes :
 * **savoir** qu'un saint existe et où il est né, et **placer** ce lieu sur la
 * carte. La première demande une mémoire ; la seconde, une table. Or la table,
 * nous l'avons déjà : 113 584 localités livrées avec l'application, avec leurs
 * coordonnées et leur population.
 *
 * L'expert fait donc la seconde moitié du travail, celle qui est fastidieuse
 * et où l'on se trompe : l'administrateur donne le nom du saint et sa ville de
 * naissance, et le programme retrouve le lieu, en tire le pays et les
 * coordonnées exactes, puis passe la fiche aux mêmes six contrôles que le
 * reste. Rien n'est deviné, donc rien n'est inventé — c'est la différence
 * entre un index et un modèle, et sur des coordonnées l'index gagne toujours.
 *
 * Ce qu'il ne fait pas, et ne prétend pas faire : vous dire quels saints
 * existent. Cela reste votre part, ou celle du réservoir livré avec
 * l'application.
 */

import { fold } from './data.js';

/** Nombre de lieux proposés pour un nom de ville ambigu. */
const MAX_MATCHES = 8;

/**
 * Cherche une localité dans un pays.
 *
 * Un nom exact l'emporte sur un début de nom, qui l'emporte sur une simple
 * inclusion ; à égalité, la population tranche. « Saint-Pierre » ramène ainsi
 * d'abord la commune qui porte exactement ce nom, non les douze
 * « Saint-Pierre-de-quelque-chose ».
 */
export function findPlaces(places, query) {
  const needle = fold(String(query || '').trim());
  if (!needle) return [];

  const scored = [];
  for (const place of places) {
    const name = fold(place.n);
    let rank = -1;
    if (name === needle) rank = 3;
    else if (name.startsWith(needle)) rank = 2;
    else if (name.includes(needle)) rank = 1;
    if (rank < 0) continue;
    scored.push({ place, rank });
  }

  scored.sort((a, b) => b.rank - a.rank || (b.place.p || 0) - (a.place.p || 0));
  return scored.slice(0, MAX_MATCHES).map((s) => s.place);
}

/**
 * Assemble une fiche à partir de ce que l'administrateur a saisi et du lieu
 * retrouvé dans la table.
 *
 * Les champs laissés vides le restent : une fiche incomplète se corrige, une
 * fiche inventée se propage.
 */
export function buildDraft({ name, sex, country, place, born, died, circa, feast, titles, desc }) {
  const { lat, lng } = unproject(place);
  const draft = {
    name: { fr: name.trim() },
    sex: sex || 'm',
    born: born === '' || born == null ? null : Number(born),
    died: died === '' || died == null ? null : Number(died),
    circa: Boolean(circa),
    city: place.n,
    country,
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    feast: feast || '',
    titles: [...(titles || [])],
    source: 'expert',
  };
  if (desc && desc.trim()) draft.desc = { fr: desc.trim() };
  return draft;
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
