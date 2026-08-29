import { project } from './map/projection.js';

const BASE = 'data/generated';
const USER_KEY = 'sanctimaps.userSaints.v1';

/** Découpage historique utilisé par le filtre « époque ». */
export const ERAS = [
  { id: 'apostolic', to: 100 },
  { id: 'patristic', from: 100, to: 500 },
  { id: 'earlyMedieval', from: 500, to: 1000 },
  { id: 'medieval', from: 1000, to: 1500 },
  { id: 'reformation', from: 1500, to: 1700 },
  { id: 'modern', from: 1700, to: 1900 },
  { id: 'contemporary', from: 1900 },
];

/** Une fiche est datée par sa naissance, ou à défaut par sa mort. */
export function eraOf(saint) {
  const year = saint.born ?? saint.died;
  if (year == null) return null;
  for (const era of ERAS) {
    if ((era.from == null || year >= era.from) && (era.to == null || year < era.to)) return era.id;
  }
  return null;
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
// Fiches ajoutées par l'utilisateur
// ---------------------------------------------------------------------------

function readUserSaints() {
  let raw;
  try {
    raw = localStorage.getItem(USER_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s && s.id) : [];
  } catch {
    console.warn('Fiches personnelles illisibles : elles sont ignorées.');
    return [];
  }
}

function writeUserSaints(list) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export class Atlas {
  constructor({ world, cities, countryNames, saints }) {
    this.worldSize = world.worldSize;
    this.bounds = world.bounds;
    this.continents = world.continents;
    this.countries = world.countries;
    this.cities = cities;
    this.names = countryNames;

    this.countryById = new Map(this.countries.map((c) => [c.id, c]));
    this.continentById = new Map(this.continents.map((c) => [c.id, c]));
    this.baseSaints = saints.saints;
    this.userSaints = readUserSaints().map((s) => this.locate(s));
    this.detailCache = new Map();
    this.reindex();
  }

  /** Ajoute les coordonnées projetées à une fiche saisie par l'utilisateur. */
  locate(saint) {
    const [x, y] = project(saint.lng, saint.lat);
    const country = this.countryById.get(saint.country);
    // Un pays cadré au-delà de l'antiméridien porte ses points un tour plus loin.
    const shift = country && country.focus[0] > this.worldSize ? this.worldSize : 0;
    return { ...saint, user: true, x: Math.round(x) + shift, y: Math.round(y) };
  }

  reindex() {
    this.saints = [...this.baseSaints, ...this.userSaints];
    this.byCountry = new Map();
    for (const s of this.saints) {
      if (!this.byCountry.has(s.country)) this.byCountry.set(s.country, []);
      this.byCountry.get(s.country).push(s);
    }
    this.byId = new Map(this.saints.map((s) => [s.id, s]));
    this.byContinent = new Map();
    for (const [id, list] of this.byCountry) {
      const continent = this.countryById.get(id)?.continent;
      if (!continent) continue;
      this.byContinent.set(continent, (this.byContinent.get(continent) || 0) + list.length);
    }
  }

  saintsIn(countryId) {
    return this.byCountry.get(countryId) || [];
  }

  countryHasSaints(countryId) {
    return this.byCountry.has(countryId);
  }

  citiesIn(countryId) {
    return this.cities[countryId] || [];
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
    return fold([...names, saint.city, this.countryName(saint.country, lang)].join(' '));
  }

  /** Contour haute définition d'un pays, chargé puis mémorisé. */
  async countryDetail(id) {
    if (this.detailCache.has(id)) return this.detailCache.get(id);
    const promise = getJSON(`${BASE}/countries/${id}.json`).catch(() => null);
    this.detailCache.set(id, promise);
    return promise;
  }

  addSaint(saint) {
    const record = this.locate({ ...saint, id: saint.id || `user-${Date.now().toString(36)}` });
    this.userSaints.push(record);
    const stored = writeUserSaints(this.userSaints.map(stripRuntime));
    this.reindex();
    return { saint: record, stored };
  }

  removeSaint(id) {
    const before = this.userSaints.length;
    this.userSaints = this.userSaints.filter((s) => s.id !== id);
    if (this.userSaints.length === before) return false;
    writeUserSaints(this.userSaints.map(stripRuntime));
    this.reindex();
    return true;
  }
}

/** Les coordonnées projetées sont recalculées au chargement : inutile de les stocker. */
function stripRuntime(saint) {
  const { x, y, user, ...rest } = saint;
  return rest;
}

export async function loadAtlas() {
  const [world, cities, countryNames, saints] = await Promise.all([
    getJSON(`${BASE}/world.json`),
    getJSON(`${BASE}/cities.json`),
    getJSON(`${BASE}/country-names.json`),
    getJSON(`${BASE}/saints.json`),
  ]);
  return new Atlas({ world, cities, countryNames, saints });
}
