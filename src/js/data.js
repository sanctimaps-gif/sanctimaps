import { project } from './map/projection.js';

const BASE = 'data/generated';
const STORE_KEY = 'sanctimaps.store.v2';

/** États d'une fiche dans le circuit de validation. */
export const PUBLISHED = 'published';
export const PENDING = 'pending';
export const REJECTED = 'rejected';

/** Siècle d'une année : 1789 -> 18, -44 -> -1. */
export function centuryOf(year) {
  if (year == null) return null;
  // Avant Jésus-Christ, le siècle se compte à rebours : l'an 200 av. J.-C.
  // ouvre le IIe siècle, il ne clôt pas le IIIe. La division plafonnée le dit,
  // là où l'arrondi par le bas décalait d'un siècle les années rondes.
  return year > 0 ? Math.floor((year - 1) / 100) + 1 : -Math.ceil(-year / 100);
}

/** Siècle auquel rattacher une fiche : sa naissance, ou à défaut sa mort. */
export function saintCentury(saint) {
  return centuryOf(saint.born ?? saint.died);
}

/** Minuscules sans accents : permet de chercher « therese » et trouver « Thérèse ». */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Enregistrement local
// ---------------------------------------------------------------------------

/**
 * La couche locale, corpus par corpus.
 *
 * Les saints tiennent la racine — `added`, `edits`, `removed` —, les apparitions
 * une couche jumelle sous `apparitions`. Deux couches plutôt qu'une seule et un
 * champ « genre » : un identifiant retiré ne veut pas dire la même chose d'un
 * corpus à l'autre, et l'export de l'une ne doit pas emporter l'autre.
 *
 * Un enregistrement écrit par une version précédente n'a pas la seconde couche :
 * elle est alors vide, et rien n'est perdu.
 */
const VERSION_STORE = 3;

/**
 * Une couche neuve, et non une copie d'un modèle.
 *
 * Deux fonctions plutôt que deux littéraux partagés : l'étalement d'un objet ne
 * copie que les références, de sorte qu'un `{ ...MODELE }` aurait donné deux
 * couches qui partagent le même tableau — un saint ajouté serait alors entré
 * dans les apparitions par la même occasion. L'essai l'a montré ; la fonction
 * l'empêche.
 */
const coucheVide = () => ({ added: [], edits: {}, removed: [] });
const storeVide = () => ({ version: VERSION_STORE, ...coucheVide(), apparitions: coucheVide() });

/** Une couche relue d'un enregistrement quelconque, sans lui faire confiance. */
function lireCouche(source) {
  const brut = source && typeof source === 'object' ? source : {};
  return {
    added: Array.isArray(brut.added) ? brut.added.filter((s) => s && s.id) : [],
    edits: brut.edits && typeof brut.edits === 'object' ? brut.edits : {},
    removed: Array.isArray(brut.removed) ? brut.removed : [],
  };
}

function readStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return storeVide();
  }
  if (!raw) return storeVide();
  try {
    const parsed = JSON.parse(raw);
    return {
      version: VERSION_STORE,
      ...lireCouche(parsed),
      apparitions: lireCouche(parsed.apparitions),
    };
  } catch {
    console.warn('Enregistrement local illisible : il est ignoré.');
    return storeVide();
  }
}

/**
 * Atlas : la carte, le corpus des saints et les modifications locales.
 *
 * Le corpus livré avec l'application est en lecture seule. Tout ce que
 * l'utilisateur ou l'administrateur fait — ajouts, retouches, suppressions —
 * vit dans une couche locale posée par-dessus, ce qui permet de revenir au
 * corpus d'origine en effaçant simplement cette couche.
 */
export class Atlas {
  constructor({ world, countryNames, saints, apparitions }) {
    this.worldSize = world.worldSize;
    this.bounds = world.bounds;
    this.continents = world.continents;
    this.countries = world.countries;
    this.names = countryNames;

    this.countryById = new Map(this.countries.map((c) => [c.id, c]));
    this.continentById = new Map(this.continents.map((c) => [c.id, c]));
    this.baseSaints = saints.saints.map((s) => ({ ...s, status: PUBLISHED }));
    this.baseById = new Map(this.baseSaints.map((s) => [s.id, s]));

    // -- le second corpus ----------------------------------------------------
    //
    // Les apparitions vivent à part des saints, et c'est voulu : ce sont deux
    // choses différentes, qu'on ne mélange pas dans un même index sous prétexte
    // qu'elles se posent sur la même carte. La bascule choisit lequel des deux
    // la carte montre ; tout ce qui ne connaît que les saints — la recherche, le
    // saint du jour, le rappel, la modération — continue de lire `saints`.
    //
    // Un corpus vide reste possible — le fichier peut manquer —, et la carte le
    // dit alors en clair plutôt que de laisser chercher des repères qui
    // n'existent pas.
    this.corpus = 'saints';
    this.baseApparitions = (apparitions?.apparitions || [])
      .map((a) => ({ ...a, status: PUBLISHED, kind: 'apparition' }));
    this.baseApparitionById = new Map(this.baseApparitions.map((a) => [a.id, a]));

    // Les deux morceaux qui ne servent pas au premier dessin, et qu'on ne
    // télécharge donc pas avant lui. Voir `ensureTexts` et `ensureCandidates`.
    this.candidates = [];
    this.textsPromise = null;
    this.candidatesPromise = null;
    this.textsListeners = new Set();

    this.store = readStore();
    this.placeCache = new Map();
    this.detailCache = new Map();
    this.viewerRole = 'visitor';
    this.reindex();
    this.reindexApparitions();
  }

  // -- ce qui arrive après la carte ------------------------------------------

  /**
   * Va chercher les textes longs — biographie, notice, sources.
   *
   * Ils font les trois quarts du corpus et ne paraissent qu'une fois une fiche
   * ouverte : les attendre avant le premier dessin, c'était faire patienter la
   * carte pour du texte que le lecteur n'avait pas demandé. Ils arrivent donc
   * après, et se fondent dans les fiches déjà en place.
   *
   * Le fondu se fait **sur les objets eux-mêmes**, non sur des copies : tout ce
   * qui tient déjà une fiche — la carte, la recherche, une fiche ouverte — voit
   * le texte apparaître sans rien redemander. Une fiche retouchée localement
   * garde ce que l'administrateur y a écrit : sa version l'emporte.
   */
  ensureTexts() {
    if (!this.textsPromise) {
      this.textsPromise = getJSON(`${BASE}/saints-texts.json`)
        .then((textes) => {
          for (const saint of this.baseSaints) {
            const part = textes[saint.id];
            if (!part) continue;
            for (const [champ, valeur] of Object.entries(part)) {
              if (saint[champ] === undefined) saint[champ] = valeur;
            }
          }
          this.textsReady = true;
          // Les fiches retouchées sont des copies : elles ne verraient rien.
          this.reindex();
          for (const fn of this.textsListeners) fn();
          return true;
        })
        .catch(() => {
          // Sans les textes, les fiches restent lisibles : nom, dates, lieu,
          // fête. Mieux vaut une fiche sans récit qu'une carte qui refuse de
          // s'ouvrir parce qu'un fichier manque.
          this.textsPromise = null;
          return false;
        });
    }
    return this.textsPromise;
  }

  /** Prévenu quand les textes sont là, pour redessiner ce qui les montre. */
  onTextsReady(fn) {
    if (this.textsReady) fn();
    this.textsListeners.add(fn);
    return () => this.textsListeners.delete(fn);
  }

  /**
   * Va chercher le réservoir de fiches candidates.
   *
   * Il ne sert qu'à l'assistant, que seul un administrateur ouvre : le charger
   * pour tout le monde, c'était soixante-dix kilooctets demandés à chaque
   * visiteur pour un écran qu'il ne verra jamais.
   */
  ensureCandidates() {
    if (!this.candidatesPromise) {
      this.candidatesPromise = getJSON(`${BASE}/candidates.json`)
        .then((data) => {
          this.candidates = data.candidates;
          return this.candidates;
        })
        .catch(() => {
          this.candidatesPromise = null;
          return [];
        });
    }
    return this.candidatesPromise;
  }

  // -- couche locale ---------------------------------------------------------

  persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.store));
      return true;
    } catch {
      return false;
    }
  }

  /** Ajoute les coordonnées projetées à une fiche saisie ou proposée. */
  locate(saint) {
    const [x, y] = project(saint.lng, saint.lat);
    const country = this.countryById.get(saint.country);
    // Un pays cadré au-delà de l'antiméridien porte ses points un tour plus loin.
    const shift = country && country.focus[0] > this.worldSize ? this.worldSize : 0;
    return { ...saint, x: Math.round(x) + shift, y: Math.round(y) };
  }

  /** Qui regarde : conditionne les fiches en attente ou refusées qu'on voit. */
  setViewer(role) {
    this.viewerRole = role;
    this.reindexAll();
  }

  reindex() {
    const removed = new Set(this.store.removed);
    const all = [];
    for (const saint of this.baseSaints) {
      if (removed.has(saint.id)) continue;
      const patch = this.store.edits[saint.id];
      all.push(patch ? this.locate({ ...saint, ...patch, edited: true }) : saint);
    }
    for (const saint of this.store.added) all.push(this.locate({ ...saint, local: true }));

    this.everySaint = all;
    this.byId = new Map(all.map((s) => [s.id, s]));

    const visible = all.filter((s) => this.canSee(s));
    this.saints = visible;
    this.byCountry = new Map();
    for (const s of visible) {
      if (!this.byCountry.has(s.country)) this.byCountry.set(s.country, []);
      this.byCountry.get(s.country).push(s);
    }
    this.byContinent = new Map();
    for (const [id, list] of this.byCountry) {
      const continent = this.countryById.get(id)?.continent;
      if (!continent) continue;
      this.byContinent.set(continent, (this.byContinent.get(continent) || 0) + list.length);
    }
  }

  /**
   * Le même travail pour le second corpus, sur sa propre couche.
   *
   * Deux index plutôt qu'un seul : une apparition n'est pas un saint, et les
   * mélanger ferait apparaître Lourdes dans la recherche des saints, dans la
   * lettre quotidienne et dans le saint du jour.
   */
  reindexApparitions() {
    const couche = this.store.apparitions;
    const removed = new Set(couche.removed);
    const all = [];
    for (const a of this.baseApparitions) {
      if (removed.has(a.id)) continue;
      const patch = couche.edits[a.id];
      all.push(patch ? this.locate({ ...a, ...patch, edited: true }) : a);
    }
    for (const a of couche.added) {
      all.push(this.locate({ ...a, local: true, kind: 'apparition' }));
    }

    this.everyApparition = all;
    this.apparitions = all.filter((a) => this.canSee(a));
    this.apparitionById = new Map(this.apparitions.map((a) => [a.id, a]));
    this.apparitionsByCountry = new Map();
    for (const a of this.apparitions) {
      if (!this.apparitionsByCountry.has(a.country)) this.apparitionsByCountry.set(a.country, []);
      this.apparitionsByCountry.get(a.country).push(a);
    }
  }

  /** Les deux corpus à la fois : ce que la couche locale touche. */
  reindexAll() {
    this.reindex();
    this.reindexApparitions();
  }

  /**
   * Une fiche publiée est visible de tous ; une proposition ne l'est que des
   * comptes connectés, et une fiche refusée du seul administrateur.
   */
  canSee(saint) {
    if (saint.status === PUBLISHED) return true;
    if (saint.status === REJECTED) return this.viewerRole === 'admin';
    return this.viewerRole === 'admin' || this.viewerRole === 'user';
  }

  /** Les propositions en attente, des deux corpus : la modération les voit toutes. */
  pending() {
    return [...this.everySaint, ...this.everyApparition].filter((s) => s.status === PENDING);
  }

  // -- écritures -------------------------------------------------------------

  /**
   * La couche d'un corpus, et l'index livré qui va avec.
   *
   * Tout ce qui écrit passe par ici : le genre décide de la couche, et rien
   * d'autre ne change. C'est ce qui permet d'ajouter, de retoucher et de retirer
   * une apparition par le même chemin qu'un saint, sans deux jeux de méthodes
   * qui divergeraient au premier correctif.
   */
  couche(kind) {
    return kind === 'apparition' ? this.store.apparitions : this.store;
  }

  livres(kind) {
    return kind === 'apparition' ? this.baseApparitionById : this.baseById;
  }

  /**
   * De quel corpus relève un identifiant déjà connu.
   *
   * Les identifiants sont uniques d'un corpus à l'autre — `build-data` refuse
   * une apparition qui porterait celui d'un saint —, de sorte qu'il n'y a rien
   * à demander à l'appelant : l'identifiant suffit à savoir où écrire.
   */
  genreDe(id) {
    return this.baseApparitionById.has(id)
      || this.store.apparitions.added.some((a) => a.id === id)
      ? 'apparition' : 'saint';
  }

  addSaint(draft, { status = PENDING, author = '', kind = 'saint' } = {}) {
    const couche = this.couche(kind);
    const prefixe = kind === 'apparition' ? 'local-ap' : 'local';
    const pris = (candidat) => this.byId.has(candidat) || this.apparitionById.has(candidat);
    const id = draft.id && !pris(draft.id)
      ? draft.id
      : `${prefixe}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const record = { ...draft, id, status, author, createdAt: new Date().toISOString() };
    if (kind === 'apparition') record.kind = 'apparition';
    delete record.x;
    delete record.y;
    couche.added.push(record);
    const stored = this.persist();
    this.reindexAll();
    return { saint: this.byId.get(id) || this.apparitionById.get(id), stored };
  }

  /**
   * Retouche une fiche : sur place si elle est locale, en surcouche sinon.
   *
   * La surcouche ne garde **que ce qui diffère** de la fiche livrée. Le
   * formulaire renvoie toujours tous ses champs — c'est un formulaire —, et les
   * enregistrer tous reviendrait à figer la fiche entière : une ville corrigée
   * à la main gèlerait aussi la biographie, le jour de fête et les sources, que
   * la prochaine collecte ne pourrait plus mettre à jour. Une retouche qui
   * revient à la valeur d'origine s'efface d'elle-même.
   */
  updateSaint(id, patch) {
    const kind = this.genreDe(id);
    const couche = this.couche(kind);
    const local = couche.added.find((s) => s.id === id);
    if (local) Object.assign(local, patch);
    else if (this.livres(kind).has(id)) {
      const livree = this.livres(kind).get(id);
      // « Absent » et « vidé » sont la même chose : un champ qu'on efface
      // revient à la fiche livrée s'il y était déjà vide.
      const meme = (a, b) => (a == null && b == null) || JSON.stringify(a) === JSON.stringify(b);
      const fusion = { ...couche.edits[id] };
      for (const [clef, valeur] of Object.entries(patch)) {
        fusion[clef] = valeur === undefined ? null : valeur;
      }
      for (const clef of Object.keys(fusion)) {
        if (meme(fusion[clef], livree[clef])) delete fusion[clef];
      }
      if (Object.keys(fusion).length) couche.edits[id] = fusion;
      else delete couche.edits[id];
    } else return false;
    this.persist();
    this.reindexAll();
    return true;
  }

  setStatus(id, status) {
    return this.updateSaint(id, { status });
  }

  deleteSaint(id) {
    const kind = this.genreDe(id);
    const couche = this.couche(kind);
    const before = couche.added.length;
    couche.added = couche.added.filter((s) => s.id !== id);
    if (couche.added.length === before) {
      if (!this.livres(kind).has(id)) return false;
      couche.removed.push(id);
      delete couche.edits[id];
    }
    this.persist();
    this.reindexAll();
    return true;
  }

  /** Remet les corpus livrés dans leur état d'origine, les deux à la fois. */
  resetStore() {
    this.store = storeVide();
    this.persist();
    this.reindexAll();
  }

  hasLocalChanges() {
    return [this.store, this.store.apparitions].some((c) => c.added.length > 0
      || c.removed.length > 0
      || Object.keys(c.edits).length > 0);
  }

  /** Y a-t-il quelque chose à verser au dépôt du côté des apparitions ? */
  hasLocalApparitions() {
    const c = this.store.apparitions;
    return c.added.length > 0 || c.removed.length > 0 || Object.keys(c.edits).length > 0;
  }

  /**
   * Ce qu'il faut verser au dépôt pour que le travail local devienne le site.
   *
   * La couche locale vit dans le navigateur : elle ne sort pas de cette machine,
   * et le prochain import l'ignore. Trois fichiers la rendent durable, et ce
   * sont exactement les trois que `build-data` relit :
   *
   *   - `apparitions.json`  les fiches ajoutées à la main ;
   *   - `corrections.json`  ce qu'on a retouché d'une fiche importée — seuls les
   *                         champs touchés, de sorte qu'un réimport garde le
   *                         reste à jour ;
   *   - la liste des retirées, dans le même fichier de corrections.
   *
   * Une retouche n'écrase donc pas la fiche importée : elle la corrige, et
   * survit à la collecte suivante. C'est la même règle que pour les statuts et
   * les approbations — la main l'emporte sur la machine, jamais l'inverse.
   */
  exportApparitions() {
    const couche = this.store.apparitions;
    const propre = (fiche) => {
      const { status, author, createdAt, local, edited, x, y, kind, ...reste } = fiche;
      return { ...reste, kind: 'apparition' };
    };
    return {
      apparitions: {
        note: 'Fiches ajoutées à la main. À verser dans data/apparitions/apparitions.json.',
        apparitions: couche.added.map(propre),
      },
      corrections: {
        note: 'Retouches et retraits de fiches importées. À verser dans'
          + ' data/apparitions/corrections.json. Une retouche ne porte que les champs'
          + ' touchés : le reste continue de suivre la collecte.',
        corrections: couche.edits,
        retirees: couche.removed.map((id) => ({ id, pourquoi: '' })),
      },
    };
  }

  // -- lectures --------------------------------------------------------------

  saintsIn(countryId) {
    return this.byCountry.get(countryId) || [];
  }

  countryHasSaints(countryId) {
    return this.byCountry.has(countryId);
  }

  // -- le corpus que la carte montre -----------------------------------------
  //
  // La carte ne lit pas `saintsIn` directement : elle lit `pointsIn`, qui répond
  // pour le corpus courant. C'est tout ce que la bascule change — les couleurs
  // des pays, les repères posés, le compte du pays ouvert et la fiche qui
  // s'ouvre suivent d'eux-mêmes, sans qu'aucun des deux corpus n'ait à connaître
  // l'autre.

  /** Bascule vers « saints » ou « apparitions ». Vrai si cela a changé. */
  setCorpus(name) {
    const voulu = name === 'apparitions' ? 'apparitions' : 'saints';
    if (this.corpus === voulu) return false;
    this.corpus = voulu;
    return true;
  }

  /** Les repères du corpus courant, pour un pays. */
  pointsIn(countryId) {
    return this.corpus === 'apparitions'
      ? this.apparitionsByCountry.get(countryId) || []
      : this.saintsIn(countryId);
  }

  countryHasPoints(countryId) {
    return this.corpus === 'apparitions'
      ? this.apparitionsByCountry.has(countryId)
      : this.byCountry.has(countryId);
  }

  /** Une fiche par son identifiant, dans le corpus courant puis dans l'autre. */
  pointById(id) {
    return this.corpus === 'apparitions'
      ? this.apparitionById.get(id) || this.byId.get(id)
      : this.byId.get(id) || this.apparitionById.get(id);
  }

  /** Combien de repères porte le corpus courant, tous pays confondus. */
  pointCount() {
    return this.corpus === 'apparitions' ? this.apparitions.length : this.saints.length;
  }

  /** Nom du pays dans la langue demandée, avec repli sur l'anglais. */
  countryName(id, lang) {
    const entry = this.names[id];
    if (!entry) return id;
    return entry[lang] || entry.en || id;
  }

  /** Nom du saint : langue demandée, puis latin, puis français, puis anglais. */
  saintName(saint, lang) {
    const n = saint.name;
    if (typeof n === 'string') return n;
    return n[lang] || n.la || n.fr || n.en || Object.values(n)[0] || '';
  }

  /** Toutes les graphies connues d'un saint, pour la recherche textuelle. */
  searchIndex(saint, lang) {
    const n = saint.name;
    const names = typeof n === 'string' ? [n] : Object.values(n);
    // Le patronage entre dans l'index : « animaux » doit ramener François
    // d'Assise, « aveugles » Lucie de Syracuse.
    const patronage = typeof saint.patronage === 'string'
      ? [saint.patronage]
      : Object.values(saint.patronage || {});
    return fold([...names, ...patronage, saint.city,
      this.countryName(saint.country, lang)].join(' '));
  }

  /** Contour haute définition d'un pays, chargé puis mémorisé. */
  countryDetail(id) {
    if (!this.detailCache.has(id)) {
      this.detailCache.set(id, getJSON(`${BASE}/countries/${id}.json`).catch(() => null));
    }
    return this.detailCache.get(id);
  }

  /** Localités d'un pays, des grandes villes aux villages, chargées à la volée. */
  places(id) {
    if (!this.placeCache.has(id)) {
      this.placeCache.set(id, getJSON(`${BASE}/cities/${id}.json`).catch(() => []));
    }
    return this.placeCache.get(id);
  }

  /** Localités déjà chargées, pour un affichage immédiat sans attente. */
  loadedPlaces(id) {
    return this.placesReady?.get(id) || [];
  }

  /**
   * Fond documentaire de l'assistant expert.
   *
   * Il ne descend qu'à la demande : un visiteur qui regarde la carte n'a que
   * faire des cent quarante-huit fiches de référence, et l'administrateur ne
   * les charge qu'en ouvrant son atelier.
   */
  reference() {
    if (!this.referencePromise) {
      this.referencePromise = getJSON(`${BASE}/reference.json`)
        .catch(() => ({ entries: [], aliases: {} }));
    }
    return this.referencePromise;
  }

  async ensurePlaces(id) {
    const list = await this.places(id);
    if (!this.placesReady) this.placesReady = new Map();
    this.placesReady.set(id, list);
    return list;
  }
}

/**
 * Ce qu'il faut avoir pour dessiner la carte, et rien de plus.
 *
 * Trois fichiers, et trois seulement : les contours du monde, le nom des pays,
 * et les fiches allégées. Les textes longs et le réservoir de l'assistant
 * viennent après, quand on en a besoin — voir `ensureTexts` et
 * `ensureCandidates`. Le corpus complet pesait un mégaoctet et demi compressé
 * avant que rien ne s'affiche ; il en pèse trois cents kilooctets.
 */
export async function loadAtlas() {
  const [world, countryNames, saints, apparitions] = await Promise.all([
    getJSON(`${BASE}/world.json`),
    getJSON(`${BASE}/country-names.json`),
    getJSON(`${BASE}/saints.json`),
    // Le second corpus est demandé avec les autres parce que la bascule doit
    // savoir dès le premier dessin ce qu'elle a à montrer. Il ne coûte rien
    // tant qu'il est vide, et son absence n'empêche pas la carte de s'ouvrir :
    // la bascule dira simplement qu'aucune apparition n'est recensée.
    getJSON(`${BASE}/apparitions.json`).catch(() => ({ apparitions: [] })),
  ]);
  return new Atlas({ world, countryNames, saints, apparitions });
}
