/**
 * Le calendrier liturgique de l'AELF, et les fiches qu'une célébration nomme.
 *
 * Partagé par le saint du jour et la recherche, et lisible hors navigateur :
 * `tools/aelf-sans-fiche.mjs` s'en sert pour lister les célébrations qu'aucune
 * fiche ne couvre.
 */

/** Le calendrier de l'AELF, lu une fois : `{ zone, jours: { "2026-10-02": {…} } }`. */
export let aelf = null;
let aelfPromesse = null;
export function chargerAelf() {
  const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  aelfPromesse ||= Promise.all([
    json('data/aelf/calendrier.json'),
    json('data/aelf/celebrations.json'),
    json('data/aelf/celebrations-auto.json'),
  ]).then(([calendrier, ecrites, auto]) => {
    aelf = {
      ...(calendrier || { jours: {} }),
      // Les pages écrites à la main passent avant celles relevées d'office.
      celebrations: { ...(auto?.celebrations || {}), ...(ecrites?.celebrations || {}) },
    };
    return aelf;
  });
  return aelfPromesse;
}

/** Ce qu'on sait d'une célébration sans fiche : des fiches à relier, une page. */
export function celebrationDe(jour, celebrations = aelf?.celebrations) {
  if (!jour || !celebrations) return null;
  return celebrations[cleCelebration(lireJour(jour).titre)] || null;
}

/** « 2026-10-02 » en heure locale : le jour du lecteur, non celui de Greenwich. */
export function isoLocal(date) {
  return `${date.getFullYear()}-${cleJour(date)}`;
}

/** « 08-30 » pour une date, format de fête du corpus. */
export function cleJour(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Ce que l'AELF dit d'un jour, ou rien. */
export function liturgieDu(date) {
  return aelf?.jours?.[isoLocal(date)] || null;
}

/** Des mots sans accents ni ponctuation, pour comparer un nom à un intitulé. */
export function mots(texte) {
  return String(texte || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'saint', 'sainte',
  'saints', 'saintes', 's', 'st', 'ste', 'ss', 'sts', 'stes', 'bienheureux', 'bienheureuse', 'of', 'the', 'en', 'a', 'au', 'aux']);
const GENERIQUES = new Set(['apparition', 'apparitions', 'mariale', 'mariales', 'notre', 'vierge',
  'marie', 'jesus', 'christ', 'sainte', 'saint', 'michel', 'gabriel', 'raphael', 'archange']);
const sens = (texte) => mots(texte).filter((m) => !VIDES.has(m));

/**
 * Lire une journée de l'AELF, dont les champs ne se rangent pas toujours de la
 * même façon : pour une mémoire, `fete` porte le nom (« Ste Thérèse de
 * l'Enfant-Jésus, vierge ») et `ligne3` le degré ; pour une fête ou une
 * solennité, `fete` ne dit que le degré (« Solennité ») et le nom est dans
 * `jour_liturgique_nom` ; un dimanche n'a que ce dernier.
 */
const DEGRE = /^(f[êe]te|solennit[ée]|m[ée]moire|m[ée]moire facultative)( du seigneur)?$/i;
export function lireJour(jour) {
  const nom = (v) => v && !DEGRE.test(v) && !/^de la f[ée]rie$/i.test(v);
  const titre = [jour.fete, jour.jour_liturgique_nom, jour.ligne1].find(nom) || '';
  const degre = jour.degre || [jour.ligne3, jour.ligne2, jour.fete].find((v) => v && DEGRE.test(v)) || '';
  return { titre, degre };
}

/**
 * Les fiches que la célébration du jour met à l'honneur.
 *
 * L'intitulé de l'AELF ne reprend pas le nom des fiches — « sainte Thérèse de
 * l'Enfant-Jésus » est au corpus « Thérèse de Lisieux » —, et l'on compare
 * donc les mots. Un saint fêté ce jour-là au corpus est retenu si son prénom
 * figure dans l'intitulé et que le reste de son nom n'y contredit pas, ou, à
 * défaut, s'il est le seul de la date à porter ce prénom. Un saint d'une autre
 * date — une fête déplacée, une fête mobile — doit y figurer en entier. Les
 * anges n'ont pas de fiche : ce sont leurs apparitions qu'on montre, comme
 * celles d'un Notre-Dame dont l'intitulé nomme le lieu.
 */
export function honores(corpus, jour, date) {
  // Une célébration que l'on a reliée à la main à des fiches : « S. Rémi » au
  // 15 janvier est la fiche de Remi de Reims, rangée au 1er octobre.
  const reliee = celebrationDe(jour, corpus.celebrations)?.fiches;
  if (reliee?.length) {
    const tout = [...corpus.saints, ...(corpus.apparitions || [])];
    const trouvees = reliee.map((id) => tout.find((f) => f.id === id)).filter(Boolean);
    if (trouvees.length) return trouvees;
  }
  const intitule = lireJour(jour).titre;
  const dits = new Set(sens(intitule));
  if (!dits.size) return [];
  // « S. Venceslas, martyr ; S. Laurent Ruiz et ses compagnons » : chaque
  // saint nommé se cherche à part.
  const fiches = [];
  for (const morceau of intitule.split(/;|\bet (?=(?:S|St|Ste|Saint|Sainte)\.?\s)/)) {
    // Le prénom seul ne suffit que si le morceau nomme un saint : « Le Saint
    // Nom de Marie » ou « la Vierge Marie du Rosaire » ne sont pas une Marie
    // du corpus.
    const nommeUnSaint = /^(?:s|st|ste|ss|saint|sainte|saints|saintes)$/.test(mots(morceau)[0]);
    for (const s of honoresParmi(corpus, new Set(sens(morceau)), date, nommeUnSaint)) {
      if (!fiches.includes(s)) fiches.push(s);
    }
  }
  return anges(corpus, dits, fiches);
}

/** Les saints du corpus qu'un morceau d'intitulé nomme. */
function honoresParmi(corpus, dits, date, prenomSuffit) {
  if (!dits.size) return [];
  const key = cleJour(date);
  const juge = (saint) => {
    const nom = sens(saint.name?.fr || saint.name?.en);
    if (!nom.length) return null;
    const dedans = nom.filter((m) => dits.has(m)).length;
    return { saint, prenom: dits.has(nom[0]), dedans, dehors: nom.length - dedans };
  };
  const duJour = [];
  const autres = [];
  for (const saint of corpus.saints) {
    const j = juge(saint);
    if (!j?.prenom) continue;
    if (saint.feast === key) duJour.push(j);
    else if (j.dehors === 0 && j.dedans >= 2) autres.push(j);
  }
  let retenus = duJour.filter((j) => j.dehors === 0 || j.dedans >= 2);
  if (!retenus.length && prenomSuffit) {
    // Le seul de la date à porter ce prénom : « Thérèse » le 1er octobre.
    const parPrenom = new Map();
    for (const j of duJour) {
      const p = sens(j.saint.name?.fr)[0];
      parPrenom.set(p, [...(parPrenom.get(p) || []), j]);
    }
    // À défaut, le seul d'entre eux qui ait une fiche écrite à la main : le
    // 16 septembre, Cyprien de Carthage plutôt que le métropolite de Kiev.
    const ecrit = (j) => !String(j.saint.id).startsWith('wd-');
    retenus = [...parPrenom.values()]
      .map((l) => (l.length === 1 ? l : l.filter(ecrit).length === 1 ? l.filter(ecrit) : []))
      .flat();
  }
  // Le nom entier, à une autre date : une fête que le corpus place à côté.
  if (!retenus.length) retenus = autres;
  return retenus.map((j) => j.saint);
}

/** Les anges, et les lieux d'apparition nommés par l'intitulé. */
function anges(corpus, dits, fiches) {
  const anges = dits.has('anges') || dits.has('ange') || dits.has('archanges') || dits.has('archange');
  const nommes = ['michel', 'gabriel', 'raphael'].filter((m) => dits.has(m));
  for (const ap of corpus.apparitions || []) {
    const nomAp = mots(ap.name?.fr);
    // Le lieu, dans la ville ou dans le nom : « Apparition mariale de La Salette ».
    const lieu = [...sens(ap.city), ...sens(ap.name?.fr)]
      .filter((m) => m.length >= 5 && !GENERIQUES.has(m));
    const ange = anges && (nommes.length ? nommes.some((m) => nomAp.includes(m))
      : nomAp[0] === 'l' && nomAp[1] === 'ange');
    // « vierge » seul qualifie une sainte (« Ste Thérèse, vierge ») : il faut Marie.
  const marial = ((dits.has('notre') && dits.has('dame')) || (dits.has('vierge') && dits.has('marie')))
      && lieu.some((m) => dits.has(m));
    if (ange || marial) fiches.push(ap);
  }
  return fiches;
}

/**
 * La clef d'une célébration : son intitulé sans accents, sans « (dimanche) »
 * ni « Mémoire facultative », ni l'année du lectionnaire. La même fête garde la
 * même clef d'une année sur l'autre.
 */
export function cleCelebration(titre) {
  return mots(String(titre || '').split(/[:,;.]\s*(?:on peut|messe)/i)[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\bM[ée]moire facultative\b/gi, ' ')
    .replace(/-\s*ann[ée]e [ABC]\b/gi, ' ')
    .replace(/\s*-\s*France\s*$/i, ' '))
    .slice(0, 10)
    .join('-');
}

/**
 * Une célébration qui mérite une page : une mémoire, une fête, une solennité,
 * ou un jour nommé — non une férie, ni un dimanche ordinaire de son temps.
 */
export function celebrationNotable(jour) {
  const { titre, degre } = lireJour(jour);
  if (!titre || titre.startsWith('(')) return false;
  if (/^f[ée]rie/i.test(degre) || /jour dans l'octave/i.test(titre)) return false;
  if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(titre)) return false;
  if (/^\d+(?:e|er|ème)\s+dimanche\b/i.test(titre) && !degre) return false;
  if (/^(?:\d+(?:e|er|ème)\s+)?dimanche (?:de l'Avent|de Carême|de Pâques|du Temps)/i.test(titre) && !degre) return false;
  return true;
}
