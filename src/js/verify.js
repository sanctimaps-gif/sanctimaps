import { fold } from './data.js';
import { project } from './map/projection.js';

/**
 * Vérification d'une fiche candidate avant de la proposer.
 *
 * Rien ici n'est deviné : chaque contrôle confronte la fiche au corpus déjà
 * en place et à la géométrie de la carte. Une fiche qui échoue est écartée
 * avec le motif exact, pour que l'administrateur voie ce qui cloche plutôt
 * qu'un simple refus.
 */

/** Marge tolérée autour du cadre d'un pays, en fraction de sa taille. */
const BBOX_SLACK = 0.08;

/** Deux points plus proches que cela sont tenus pour le même lieu. */
const SAME_PLACE_DEGREES = 0.25;

const FEAST = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Graphies retenues pour comparer deux noms.
 *
 * Seules les formes vernaculaires comptent : les formes latines sont trop
 * souvent réduites au prénom seul — « Laurentius » vaut aussi bien pour
 * Laurent de Rome que pour Laurent O'Toole — et feraient passer pour un
 * doublon deux saints séparés de mille ans.
 */
function nameForms(saint) {
  const n = saint.name;
  if (typeof n === 'string') return [fold(n)];
  return [n.fr, n.en].filter(Boolean).map(fold);
}

/** Mots significatifs d'un nom, pour reconnaître la même personne. */
function nameWords(saint) {
  const words = new Set();
  const n = saint.name;
  const values = typeof n === 'string' ? [n] : Object.values(n || {});
  for (const value of values) {
    for (const word of fold(value).split(/[^a-z0-9]+/)) {
      if (word.length >= 4) words.add(word);
    }
  }
  return words;
}

function sharesWord(a, b) {
  const words = nameWords(b);
  for (const word of nameWords(a)) if (words.has(word)) return true;
  return false;
}

function insideCountry(saint, country, worldSize) {
  const [x, y] = project(saint.lng, saint.lat);
  const box = country.bbox;
  // Un pays cadré au-delà de l'antiméridien porte ses points un tour plus loin.
  const shifted = country.focus[0] > worldSize ? x + worldSize : x;
  const w = (box[2] - box[0]) * BBOX_SLACK;
  const h = (box[3] - box[1]) * BBOX_SLACK;
  return shifted >= box[0] - w && shifted <= box[2] + w
    && y >= box[1] - h && y <= box[3] + h;
}

/**
 * @param {object} candidate fiche à examiner
 * @param {import('./data.js').Atlas} atlas corpus et carte de référence
 * @returns {{ok: boolean, failures: Array<{key: string, hint?: string}>}}
 */
export function verifyCandidate(candidate, atlas) {
  const failures = [];

  const country = atlas.countryById.get(candidate.country);
  if (!country) failures.push({ key: 'country', hint: candidate.country });
  else if (!insideCountry(candidate, country, atlas.worldSize)) {
    failures.push({ key: 'coords', hint: `${candidate.lat}, ${candidate.lng}` });
  }

  const { born, died } = candidate;
  if (born == null && died == null) failures.push({ key: 'dates' });
  else if (born != null && died != null && died < born) {
    failures.push({ key: 'dates', hint: `${born} → ${died}` });
  }

  if (!FEAST.test(String(candidate.feast || ''))) {
    failures.push({ key: 'feast', hint: String(candidate.feast || '—') });
  }

  const forms = new Set(nameForms(candidate));
  for (const saint of atlas.everySaint) {
    if (nameForms(saint).some((form) => forms.has(form))) {
      failures.push({ key: 'duplicateName', hint: saint.city });
      break;
    }
  }

  // Même lieu et même fête ne suffisent pas : des compagnons martyrisés
  // ensemble les partagent légitimement. Il faut en plus que les noms se
  // recoupent pour conclure qu'il s'agit bien de la même personne.
  for (const saint of atlas.everySaint) {
    if (saint.country !== candidate.country || saint.feast !== candidate.feast) continue;
    if (Math.abs(saint.lat - candidate.lat) >= SAME_PLACE_DEGREES
      || Math.abs(saint.lng - candidate.lng) >= SAME_PLACE_DEGREES) continue;
    if (!sharesWord(saint, candidate)) continue;
    failures.push({ key: 'duplicatePlace', hint: saint.city });
    break;
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Passe tout le réservoir au crible.
 *
 * `handled` contient les identifiants déjà traités — acceptés ou passés —
 * pour ne pas represser deux fois la même fiche à l'administrateur.
 */
export function reviewPool(atlas, handled = new Set()) {
  const proposals = [];
  const discarded = [];
  for (const candidate of atlas.candidates) {
    if (handled.has(candidate.id)) continue;
    const result = verifyCandidate(candidate, atlas);
    if (result.ok) proposals.push({ candidate, ...result });
    else discarded.push({ candidate, ...result });
  }
  return { proposals, discarded, total: proposals.length + discarded.length };
}
