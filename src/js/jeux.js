/**
 * Les jeux : ce qu'ils savent du corpus, sans rien afficher.
 *
 * Tout est tiré des fiches elles-mêmes — le pays, le jour de fête, le siècle,
 * la ville, le patronage, les liens —, de sorte qu'une question ne dit jamais
 * rien que la carte ne dise aussi, et qu'un saint ajouté entre de lui-même
 * dans les jeux. L'interface vit dans `ui/jeux.js`.
 */

import { centuryOf, fold } from './data.js';
import { formatFeast, formatYear, pickText, t, titleLabel } from './i18n.js';
import { qidOf } from './portrait.js';

// ---------------------------------------------------------------------------
// La notoriété
// ---------------------------------------------------------------------------

/**
 * Quatre degrés de notoriété, du saint que tout le monde connaît à celui que
 * personne ne connaît. Aucune base ne la mesure : on l'estime de ce que la
 * carte sait de chacun.
 *
 * Le meilleur indice est le numéro de l'élément Wikidata : les saints dont
 * tout le monde parle y sont entrés parmi les premiers, et portent de petits
 * numéros — Augustin Q8018, Jeanne d'Arc Q7226 —, quand un martyr de 1936
 * béatifié en 2007 en porte un de huit chiffres. S'y ajoutent les fiches
 * écrites à la main, jugées indispensables, les lieux marqués et les liens
 * attestés — sans excès : un groupe de martyrs récents en a beaucoup —, une
 * longue biographie, un portrait. Le classement se coupe en quatre tranches.
 */
export const NOTORIETES = [1, 2, 3, 4];
const TRANCHES = [150, 700, 2000];

function poidsQid(qid) {
  const n = qid ? Number(qid.slice(1)) : null;
  if (n == null) return 0;
  return n < 20000 ? 10 : n < 100000 ? 8 : n < 400000 ? 5 : n < 1500000 ? 3 : n < 8000000 ? 1 : 0;
}

export function classerNotoriete(atlas) {
  const score = (s) => {
    const bio = pickText(s.bio, 'fr').length;
    return (s.id.startsWith('wd-') ? 0 : 8)
      + poidsQid(qidOf(s))
      + Math.min(4, atlas.lieuxDe(s.id).length * 0.7)
      + Math.min(4, (atlas.liens?.[s.id] || []).length)
      + (bio > 1200 ? 2 : bio > 500 ? 1 : 0)
      + (s.portrait ? 1 : 0);
  };
  const classes = [...atlas.saints]
    .filter((s) => s.status === 'published' && s.name && s.country)
    .map((s) => ({ s, v: score(s) }))
    .sort((a, b) => b.v - a.v);
  const niveau = new Map();
  classes.forEach(({ s }, i) => {
    niveau.set(s.id, i < TRANCHES[0] ? 1 : i < TRANCHES[1] ? 2 : i < TRANCHES[2] ? 3 : 4);
  });
  return niveau;
}

// ---------------------------------------------------------------------------
// Le hasard
// ---------------------------------------------------------------------------

export const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];

export function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** `n` valeurs distinctes tirées d'une liste, sans `sauf`. */
function tirer(liste, n, sauf) {
  const vus = new Set([sauf]);
  const sortie = [];
  for (const v of melanger(liste)) {
    if (sortie.length >= n) break;
    if (v == null || v === '' || vus.has(v)) continue;
    vus.add(v);
    sortie.push(v);
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// Le quiz
// ---------------------------------------------------------------------------

/**
 * Trois façons de répondre : un QCM de quatre choix dont on peut voir la
 * réponse, un QCM de huit choix avec un lien pour aller la chercher sur la
 * carte, une réponse écrite, sans aide. Plus c'est difficile, plus ça rapporte.
 */
export const MODES = [
  { cle: 'a', choix: 4, points: 1 },
  { cle: 'b', choix: 8, points: 2 },
  { cle: 'c', choix: 0, points: 4 },
];

const siecle = (s) => centuryOf(s.born ?? s.died);
const libelleSiecle = (n) => (n == null ? '' : formatYear(n > 0 ? (n - 1) * 100 + 50 : n * 100 + 50, { precision: 7 }));

/**
 * Les sortes de questions. Chacune dit si elle vaut pour une fiche, et ce
 * qu'on demande, ce qu'on répond et parmi quoi l'on choisit.
 */
const SORTES = [
  {
    cle: 'pays',
    vaut: (s) => !!s.country,
    ecrite: true,
    faire: (s, ctx) => ({
      question: t('jeux.q.pays', { nom: ctx.nom(s), sex: s.sex }),
      reponse: ctx.pays(s.country),
      leurres: (n) => tirer(ctx.tousPays, n, ctx.pays(s.country)),
    }),
  },
  {
    cle: 'fete',
    vaut: (s) => !!s.feast,
    ecrite: false,
    faire: (s, ctx) => ({
      question: t('jeux.q.fete', { nom: ctx.nom(s), sex: s.sex }),
      reponse: formatFeast(s.feast),
      leurres: (n) => tirer(ctx.toutesFetes.map(formatFeast), n, formatFeast(s.feast)),
    }),
  },
  {
    cle: 'siecle',
    vaut: (s) => siecle(s) != null,
    ecrite: true,
    faire: (s, ctx) => {
      const n = siecle(s);
      const proches = [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6].map((d) => n + d).filter((v) => v !== 0 && v <= 21);
      return {
        question: t('jeux.q.siecle', { nom: ctx.nom(s), sex: s.sex }),
        reponse: libelleSiecle(n),
        siecle: n,
        leurres: (k) => tirer(proches.map(libelleSiecle), k, libelleSiecle(n)),
      };
    },
  },
  {
    cle: 'ville',
    vaut: (s) => s.city && s.city !== '—',
    ecrite: true,
    faire: (s, ctx) => ({
      question: t('jeux.q.ville', { ville: s.city, pays: ctx.pays(s.country) }),
      reponse: ctx.nom(s),
      estSaint: true,
      leurres: (n) => tirer(ctx.memeNiveau(s).filter((x) => x.city !== s.city).map(ctx.nom), n, ctx.nom(s)),
    }),
  },
  {
    cle: 'jour',
    vaut: (s) => !!s.feast,
    ecrite: true,
    faire: (s, ctx) => ({
      question: t('jeux.q.jour', { date: formatFeast(s.feast) }),
      reponse: ctx.nom(s),
      estSaint: true,
      leurres: (n) => tirer(ctx.memeNiveau(s).filter((x) => x.feast !== s.feast).map(ctx.nom), n, ctx.nom(s)),
    }),
  },
  {
    cle: 'patron',
    vaut: (s, ctx) => !!pickText(s.patronage, ctx.lang),
    ecrite: false,
    faire: (s, ctx) => ({
      question: t('jeux.q.patron', { nom: ctx.nom(s), sex: s.sex }),
      reponse: pickText(s.patronage, ctx.lang),
      leurres: (n) => tirer(ctx.tousPatronages, n, pickText(s.patronage, ctx.lang)),
    }),
  },
];

/** Le contexte d'une partie : ce dont les questions ont besoin pour se dire. */
export function contexteQuiz(atlas, niveaux, lang) {
  const saints = atlas.saints.filter((s) => niveaux.has(s.id));
  const parNiveau = new Map(NOTORIETES.map((n) => [n, saints.filter((s) => niveaux.get(s.id) === n)]));
  return {
    lang,
    niveaux,
    saints,
    parNiveau,
    nom: (s) => atlas.saintName(s, lang),
    pays: (id) => atlas.countryName(id, lang),
    tousPays: [...new Set(saints.map((s) => atlas.countryName(s.country, lang)))],
    toutesFetes: [...new Set(saints.map((s) => s.feast).filter(Boolean))],
    tousPatronages: [...new Set(saints.map((s) => pickText(s.patronage, lang)).filter(Boolean))],
    memeNiveau: (s) => parNiveau.get(niveaux.get(s.id)) || saints,
  };
}

/**
 * Une question : sur un saint du degré choisi, d'une sorte qui lui convient.
 * En réponse écrite, on n'emploie que les sortes où l'on peut écrire la réponse.
 */
export function faireQuestion(ctx, niveau, mode) {
  const pool = ctx.parNiveau.get(niveau) || [];
  for (let essai = 0; essai < 40; essai += 1) {
    const saint = auHasard(pool);
    if (!saint) return null;
    const sortes = SORTES.filter((q) => q.vaut(saint, ctx) && (mode.choix || q.ecrite));
    if (!sortes.length) continue;
    const sorte = auHasard(sortes);
    const q = sorte.faire(saint, ctx);
    if (!q.reponse) continue;
    const choix = mode.choix ? melanger([q.reponse, ...q.leurres(mode.choix - 1)]) : [];
    if (mode.choix && choix.length < Math.min(mode.choix, 3)) continue;
    return { ...q, saint, sorte: sorte.cle, choix };
  }
  return null;
}

/** Les chiffres romains d'un siècle, pour accepter « XIII » comme « 13 ». */
const ROMAINS = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii',
  'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi'];

/**
 * Une réponse écrite est-elle juste ? On pardonne les accents, la casse, un
 * titre omis : « thérèse de lisieux » vaut « Thérèse de Lisieux », « Lisieux »
 * seul ne vaut pas, « 13 » ou « XIII » valent le XIIIe siècle.
 */
export function reponseJuste(question, saisie) {
  const g = fold(saisie).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!g) return false;
  if (question.siecle != null) {
    const n = Math.abs(question.siecle);
    const chiffres = g.match(/\d+/)?.[0];
    if (chiffres) return Number(chiffres) === n;
    return g.split(' ').some((m) => m.replace(/e(me|r)?$/, '') === ROMAINS[n]);
  }
  const r = fold(question.reponse).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (g === r) return true;
  const sansSaint = (x) => x.replace(/^(saint|sainte|st|ste|san|santa|santo|sao|sankt) /, '');
  if (sansSaint(g) === sansSaint(r)) return true;
  // Le nom sans son lieu : « Thérèse » pour « Thérèse de Lisieux » est trop
  // peu ; mais deux mots ou plus du nom, dans l'ordre, suffisent.
  const mots = sansSaint(g).split(' ');
  return mots.length >= 2 && sansSaint(r).startsWith(sansSaint(g)) && sansSaint(g).length >= 8;
}

// ---------------------------------------------------------------------------
// La chaîne de saints
// ---------------------------------------------------------------------------

/** Cinq longueurs de chaîne, de facile à impossible. */
export const CHAINES = [
  { cle: 'facile', n: 5 },
  { cle: 'moyen', n: 10 },
  { cle: 'complique', n: 15 },
  { cle: 'hard', n: 20 },
  { cle: 'impossible', n: 30 },
];

/**
 * Les voisins d'un saint : ceux que la carte relie à lui — liens attestés,
 * fiches liées, et ceux qu'il a pu croiser, même lieu, même temps.
 */
export function voisins(atlas, id) {
  const vus = new Set();
  const sortie = [];
  for (const c of atlas.rencontresDe(id)) {
    if (vus.has(c.saint.id)) continue;
    vus.add(c.saint.id);
    sortie.push({ saint: c.saint, atteste: c.atteste, quoi: c.quoi, ou: c.ou });
  }
  for (const { fiche, quoi } of atlas.liesDe?.(id) || []) {
    if (fiche.kind && fiche.kind !== 'saint') continue;
    if (vus.has(fiche.id)) continue;
    vus.add(fiche.id);
    sortie.push({ saint: fiche, lie: quoi });
  }
  return sortie;
}

/**
 * Une chaîne de `n` maillons : un départ connu, puis une marche où chaque pas
 * va vers un voisin qu'on n'a pas encore vu, en préférant ceux qui ouvrent le
 * plus de chemins. L'arrivée est le saint où la marche s'arrête, et jamais un
 * voisin du départ. La chaîne du joueur doit avoir exactement `n` maillons,
 * sans repasser par un saint : l'arrivée ne se rejoint qu'au dernier. Il en
 * existe au moins une — celle qu'on a tirée.
 */
export function faireChaine(atlas, niveaux, n) {
  const departs = atlas.saints.filter((s) => niveaux.get(s.id) <= 2);
  for (let essai = 0; essai < 60; essai += 1) {
    const depart = auHasard(departs);
    if (!depart) return null;
    const chemin = [depart];
    const vus = new Set([depart.id]);
    let courant = depart;
    while (chemin.length <= n) {
      const suivants = voisins(atlas, courant.id).map((v) => v.saint).filter((s) => !vus.has(s.id));
      if (!suivants.length) break;
      // Un peu de hasard, et une préférence pour les saints qui ont eux-mêmes
      // des voisins : la marche ne s'enferme pas dans une impasse.
      const notes = suivants.slice(0, 12).map((s) => ({ s, v: voisins(atlas, s.id).length + Math.random() * 6 }));
      notes.sort((a, b) => b.v - a.v);
      courant = auHasard(notes.slice(0, 3)).s;
      vus.add(courant.id);
      chemin.push(courant);
    }
    // Une arrivée voisine du départ ne ferait pas une chaîne : on en tire une autre.
    const voisinDuDepart = voisins(atlas, depart.id).some((v) => v.saint.id === courant.id);
    if (chemin.length === n + 1 && !voisinDuDepart) return { depart, arrivee: courant, chemin };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Qui est-ce ?
// ---------------------------------------------------------------------------

/**
 * Les indices d'un saint, du plus vague au plus parlant : le siècle, les
 * qualités, le pays, le patronage, le jour de fête, la ville, sa notice — son
 * nom masqué —, enfin ses initiales. Chaque indice demandé coûte des points.
 */
export function indices(atlas, saint, lang) {
  const nom = atlas.saintName(saint, lang);
  const masque = (texte) => {
    let sortie = texte;
    for (const mot of nom.split(/[\s'’-]+/).filter((m) => m.length >= 3)) {
      sortie = sortie.replace(new RegExp(mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '…');
    }
    return sortie;
  };
  const liste = [];
  const n = siecle(saint);
  if (n != null) liste.push(t('jeux.i.siecle', { s: libelleSiecle(n), sex: saint.sex }));
  if (saint.titles?.length) {
    liste.push(t('jeux.i.qualites', { q: saint.titles.map((k) => titleLabel(k, saint.sex)).join(', '), sex: saint.sex }));
  }
  liste.push(t('jeux.i.pays', { p: atlas.countryName(saint.country, lang), sex: saint.sex }));
  const patron = pickText(saint.patronage, lang);
  if (patron) liste.push(t('jeux.i.patron', { p: masque(patron), sex: saint.sex }));
  if (saint.feast) liste.push(t('jeux.i.fete', { d: formatFeast(saint.feast), sex: saint.sex }));
  if (saint.city && saint.city !== '—') liste.push(t('jeux.i.ville', { v: saint.city, sex: saint.sex }));
  const desc = pickText(saint.desc, lang);
  if (desc) liste.push(t('jeux.i.notice', { d: masque(desc) }));
  const initiales = nom.split(/\s+/).map((m) => `${m[0]}${'·'.repeat(Math.max(0, m.length - 1))}`).join(' ');
  liste.push(t('jeux.i.initiales', { i: initiales }));
  return liste;
}

// ---------------------------------------------------------------------------
// Les points et les paliers
// ---------------------------------------------------------------------------

/**
 * Les paliers, et les points qu'il faut pour les atteindre. Ils n'ont pour
 * l'instant qu'un numéro : pour leur donner un nom, il suffit de l'écrire dans
 * `nom` — « Pèlerin », « Ermite »… —, et c'est lui que l'application montrera.
 */
export const PALIERS = [
  { seuil: 0, nom: null },
  { seuil: 20, nom: null },
  { seuil: 50, nom: null },
  { seuil: 100, nom: null },
  { seuil: 175, nom: null },
  { seuil: 275, nom: null },
  { seuil: 400, nom: null },
  { seuil: 550, nom: null },
  { seuil: 750, nom: null },
  { seuil: 1000, nom: null },
  { seuil: 1300, nom: null },
  { seuil: 1650, nom: null },
  { seuil: 2050, nom: null },
  { seuil: 2500, nom: null },
  { seuil: 3000, nom: null },
];

const CLE_POINTS = 'sanctimaps.jeux.v1';

export function lirePoints() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_POINTS) || '{}');
    return { points: Number(brut.points) || 0, parties: Number(brut.parties) || 0 };
  } catch {
    return { points: 0, parties: 0 };
  }
}

export function ajouterPoints(n) {
  const etat = lirePoints();
  etat.points += Math.max(0, Math.round(n));
  etat.parties += 1;
  try { localStorage.setItem(CLE_POINTS, JSON.stringify(etat)); } catch { /* navigation privée */ }
  return etat;
}

/** Le palier atteint, et ce qui manque pour le suivant. */
export function palierDe(points) {
  let i = 0;
  while (i + 1 < PALIERS.length && points >= PALIERS[i + 1].seuil) i += 1;
  const palier = PALIERS[i];
  const suivant = PALIERS[i + 1] || null;
  return {
    numero: i + 1,
    nom: palier.nom || t('jeux.palier', { n: i + 1 }),
    seuil: palier.seuil,
    suivant: suivant ? { numero: i + 2, seuil: suivant.seuil, nom: suivant.nom || t('jeux.palier', { n: i + 2 }) } : null,
  };
}
