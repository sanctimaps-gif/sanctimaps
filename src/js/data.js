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

const EMPTY_STORE = { version: 2, added: [], edits: {}, removed: [] };

function readStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return { ...EMPTY_STORE };
  }
  if (!raw) return { ...EMPTY_STORE };
  try {
    const parsed = JSON.parse(raw);
    return {
      version: 2,
      added: Array.isArray(parsed.added) ? parsed.added.filter((s) => s && s.id) : [],
      edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {},
      removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    };
  } catch {
    console.warn('Enregistrement local illisible : il est ignoré.');
    return { ...EMPTY_STORE };
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
  constructor({ world, countryNames, saints }) {
    this.worldSize = world.worldSize;
    this.bounds = world.bounds;
    this.continents = world.continents;
    this.countries = world.countries;
    this.names = countryNames;

    this.countryById = new Map(this.countries.map((c) => [c.id, c]));
    this.continentById = new Map(this.continents.map((c) => [c.id, c]));
    this.baseSaints = saints.saints.map((s) => ({ ...s, status: PUBLISHED }));
    this.baseById = new Map(this.baseSaints.map((s) => [s.id, s]));

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
    this.reindex();
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
   * Une fiche publiée est visible de tous ; une proposition ne l'est que des
   * comptes connectés, et une fiche refusée du seul administrateur.
   */
  canSee(saint) {
    if (saint.status === PUBLISHED) return true;
    if (saint.status === REJECTED) return this.viewerRole === 'admin';
    return this.viewerRole === 'admin' || this.viewerRole === 'user';
  }

  pending() {
    return this.everySaint.filter((s) => s.status === PENDING);
  }

  // -- écritures -------------------------------------------------------------

  addSaint(draft, { status = PENDING, author = '' } = {}) {
    const id = draft.id && !this.byId.has(draft.id)
      ? draft.id
      : `local-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const record = { ...draft, id, status, author, createdAt: new Date().toISOString() };
    delete record.x;
    delete record.y;
    this.store.added.push(record);
    const stored = this.persist();
    this.reindex();
    return { saint: this.byId.get(id), stored };
  }

  /** Retouche une fiche : sur place si elle est locale, en surcouche sinon. */
  updateSaint(id, patch) {
    const local = this.store.added.find((s) => s.id === id);
    if (local) Object.assign(local, patch);
    else if (this.baseById.has(id)) this.store.edits[id] = { ...this.store.edits[id], ...patch };
    else return false;
    this.persist();
    this.reindex();
    return true;
  }

  setStatus(id, status) {
    return this.updateSaint(id, { status });
  }

  deleteSaint(id) {
    const before = this.store.added.length;
    this.store.added = this.store.added.filter((s) => s.id !== id);
    if (this.store.added.length === before) {
      if (!this.baseById.has(id)) return false;
      this.store.removed.push(id);
      delete this.store.edits[id];
    }
    this.persist();
    this.reindex();
    return true;
  }

  /** Remet le corpus livré dans son état d'origine. */
  resetStore() {
    this.store = { ...EMPTY_STORE, added: [], edits: {}, removed: [] };
    this.persist();
    this.reindex();
  }

  hasLocalChanges() {
    return this.store.added.length > 0
      || this.store.removed.length > 0
      || Object.keys(this.store.edits).length > 0;
  }

  // -- lectures --------------------------------------------------------------

  saintsIn(countryId) {
    return this.byCountry.get(countryId) || [];
  }

  countryHasSaints(countryId) {
    return this.byCountry.has(countryId);
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
  const [world, countryNames, saints] = await Promise.all([
    getJSON(`${BASE}/world.json`),
    getJSON(`${BASE}/country-names.json`),
    getJSON(`${BASE}/saints.json`),
  ]);
  return new Atlas({ world, countryNames, saints });
}
