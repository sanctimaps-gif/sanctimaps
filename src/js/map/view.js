import { TILE_ATTRIBUTION, TILE_URL, getBasemap, onBasemapChange } from '../basemap.js';
import { t } from '../i18n.js';
import { WORLD_SIZE, unproject } from './projection.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Durée des transitions entre deux cadrages, en millisecondes. */
const TRANSITION = 720;

/** Au-delà de ce rapport, remplir l'écran rognerait trop le cadre visé. */
const COVER_LIMIT = 1.35;

/** Le planisphère, lui, peut être rogné franchement pour emplir la hauteur. */
const WORLD_COVER = 3.2;

/**
 * Bornes de zoom en vue « pays ».
 *
 * Un simple rapport au cadrage d'arrivée serait injuste : quarante fois la
 * Belgique descend dans la rue, quarante fois la Russie reste à deux cents
 * kilomètres du sol. La borne haute vise donc une échelle au sol — celle où
 * les villages se nomment — et le rapport ne sert plus que de garde-fou.
 */
const COUNTRY_ZOOM = [1, 40];

/** Rapport au-delà duquel on ne va pas, même pour un très grand pays. */
const COUNTRY_ZOOM_MAX = 200;
const COUNTRY_ZOOM_MAX_TILED = 12000;

/** Échelle au sol visée au zoom maximal, en mètres par pixel. */
const GROUND_LIMIT = 40;

/** La même, quand un fond de tuiles prend le relais : on descend dans la rue. */
const GROUND_LIMIT_TILED = 1.2;

/** Pas d'un appui sur « + » ou « − ». */
const ZOOM_STEP = 1.6;

/**
 * Combien de localités on retient dans le cadre visible.
 *
 * Un nombre à peu près constant, et non croissant : c'est ce qui rend la
 * révélation progressive. La fenêtre se resserrant à mesure qu'on zoome, les
 * mêmes deux cents places reviennent à des lieux de plus en plus petits — les
 * préfectures cèdent aux bourgs, les bourgs aux villages. Laisser le nombre
 * croître, au contraire, empile les noms jusqu'à noyer la carte.
 */
const PLACES_AT_FIT = 190;
const PLACES_MAX = 300;

/** Croissance très lente du budget avec le zoom : une inflexion, pas une rampe. */
const PLACES_GROWTH = 0.28;

/** Marge de déplacement autorisée autour d'un pays, en fraction de sa taille. */
const COUNTRY_SLACK = 0.35;

/** Marge de localités calculées hors écran, en fraction de la plus grande dimension. */
const OVERLAY_MARGIN = 0.35;

/** La même, pour les tuiles. Plus étroite : une tuile hors champ est une
 *  requête pour rien, et le fournisseur n'a pas à la servir. */
const TILE_MARGIN = 0.1;

/** Déplacement, dans la même unité, au-delà duquel le calque est recalculé. */
const OVERLAY_REDRAW = 0.25;

/** Air réservé autour d'un nom, en pixels. Généreux : c'est le blanc entre les
 *  noms qui rend une carte lisible, bien plus que leur nombre. */
const LABEL_GAP = 8;
const LABEL_GAP_Y = 3;

/** Descente du nom sous son repère, en cadratins. Doit suivre la feuille de style. */
const LABEL_DROP = 1.55;

/** La croix d'un saint est plus haute qu'un point : son nom descend d'autant. */
const LABEL_DROP_SAINT = 2.5;

/**
 * Distance en pixels en deçà de laquelle deux saints partagent un repère.
 *
 * De l'ordre du diamètre du médaillon : si deux croix se recouvrent, elles
 * doivent n'en faire qu'une, qui ouvre une liste.
 */
const CLUSTER_RADIUS = 26;

/**
 * Croix latine, dessinée autour de son centre.
 *
 * C'est le repère d'un lieu de naissance : une croix se reconnaît d'un coup
 * d'œil parmi des points, et dit ce qu'elle marque sans légende.
 */
const CROSS = 'M-1.1 -5.2H1.1V-2.4H3.5V-0.4H1.1V5.2H-1.1V-0.4H-3.5V-2.4H-1.1Z';

/**
 * Rangs de localité, du chef-lieu au hameau.
 *
 * C'est ce qui donne à la vue pays son grain de carte d'état-major : la taille
 * du point et du nom dit l'importance du lieu, et les petites communes ne
 * s'écrivent pas comme une préfecture.
 */
const PLACE_RANKS = [
  { max: Infinity, cls: 'city', dot: 3.4 },
  { max: 100000, cls: 'town', dot: 2.7 },
  { max: 20000, cls: 'village', dot: 2 },
  { max: 5000, cls: 'hamlet', dot: 1.5 },
];

/** « 50 km », « ٥٠ كم », « 50公里 » — l'unité suit la langue affichée. */
function formatDistance(value, unit, lang) {
  try {
    return new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
  } catch {
    return `${value} ${unit === 'kilometer' ? 'km' : 'm'}`;
  }
}

function placeRank(population) {
  let rank = PLACE_RANKS[0];
  for (const candidate of PLACE_RANKS) if (population < candidate.max) rank = candidate;
  return rank;
}

/** Longueurs rondes pour l'échelle, en mètres. */
const SCALE_STEPS = [
  10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000,
  50000, 100000, 250000, 500000, 1000000, 2000000,
];

/** Circonférence de la Terre à l'équateur, en mètres. */
const EQUATOR = 40075017;

/** Côté d'une tuile, en pixels. Universel depuis Google Maps. */
const TILE_SIZE = 256;

/** Zoom de tuile le plus fin qu'on demande : au-delà, le fournisseur peine. */
const TILE_MAX_Z = 18;

/** Après tant d'échecs de suite, on cesse de demander : le fond est coupé. */
const TILE_GIVE_UP = 8;

/**
 * Débord de chaque tuile, en fraction de son côté.
 *
 * Deux tuiles jointives laissent un cheveu de fond entre elles, l'arrondi du
 * rendu ne tombant pas au même endroit de part et d'autre. Les faire déborder
 * d'un poil supprime ces coutures.
 */
const TILE_BLEED = 0.004;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function grow(bbox, factor) {
  const dx = (bbox[2] - bbox[0]) * factor;
  const dy = (bbox[3] - bbox[1]) * factor;
  return [bbox[0] - dx, bbox[1] - dy, bbox[2] + dx, bbox[3] + dy];
}

/**
 * Vue cartographique.
 *
 * Trois échelles de lecture s'enchaînent — monde, continent, pays — et
 * chacune fixe ce que l'on peut voir et faire : le zoom libre n'existe qu'une
 * fois un pays ouvert, et le déplacement reste borné au cadre courant.
 */
export class MapView {
  constructor(root, atlas, handlers = {}) {
    this.root = root;
    this.atlas = atlas;
    this.handlers = handlers;
    this.lang = 'fr';

    this.mode = 'world';
    this.continentId = null;
    this.countryId = null;
    this.highlightId = null;
    this.picking = null;

    this.transform = { k: 1, x: 0, y: 0 };
    this.animation = null;

    this.build();
    this.buildControls();
    this.bindPointer();
    this.bindKeys();

    // Couper ou rallumer le fond de carte change aussi jusqu'où l'on peut
    // zoomer : il faut donc recadrer, et non seulement redessiner.
    this.offBasemap = onBasemapChange(() => {
      this.clearTiles();
      if (this.mode === 'country') this.apply(this.clamp(this.transform));
      this.refreshOverlay();
    });

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.root);
  }

  // -------------------------------------------------------------------------
  // Construction du DOM
  // -------------------------------------------------------------------------

  build() {
    this.svg = el('svg', { class: 'map', 'aria-hidden': 'true' });
    this.scene = el('g', { class: 'scene' });
    this.overlay = el('g', { class: 'overlay' });

    const [x0, y0, x1, y1] = this.atlas.bounds;
    const frame = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    this.sheet = el('rect', { class: 'sheet', ...frame });

    // Les tracés débordent le cadre du monde : le Groenland monte au-delà de la
    // coupe nord, la Tchoukotka passe l'antiméridien. On les rogne au rectangle
    // de la carte plutôt que de les laisser flotter dans le vide. Le découpage
    // porte sur un groupe intérieur, sans transformation propre, pour que le
    // rectangle de coupe partage exactement le repère de ce qu'il découpe.
    const clip = el('clipPath', { id: 'sanctimaps-sheet' });
    clip.append(el('rect', frame));
    const defs = el('defs');
    defs.append(clip);

    this.countryLayer = el('g', { class: 'countries' });
    this.tileLayer = el('g', { class: 'tiles' });
    this.detailLayer = el('g', { class: 'outline' });
    this.paths = new Map();
    for (const country of this.atlas.countries) {
      const path = el('path', {
        class: 'country',
        d: country.d,
        'fill-rule': 'evenodd',
        'vector-effect': 'non-scaling-stroke',
      });
      path.dataset.country = country.id;
      this.paths.set(country.id, path);
      this.countryLayer.append(path);
    }

    const clipped = el('g', { 'clip-path': 'url(#sanctimaps-sheet)' });
    // Les tuiles se posent sur le fond vectoriel et sous le contour du pays :
    // le trait qui dit « vous êtes ici » doit rester lisible par-dessus.
    clipped.append(this.sheet, this.countryLayer, this.tileLayer, this.detailLayer);
    this.scene.append(defs, clipped);
    this.svg.append(this.scene, this.overlay);
    this.root.append(this.svg);

    this.labels = [];
    this.markers = [];
    this.fonts = new Map();
    this.tiles = new Map();
    this.tileRange = null;
    this.tileFailures = 0;
  }

  /**
   * Commandes posées sur la carte : le zoom et l'échelle.
   *
   * La molette et le pincement ne sont pas donnés à tout le monde — souris
   * sans roulette, pavé tactile capricieux, écran qui interprète le pincement
   * pour son propre compte. Trois boutons rendent le zoom accessible partout,
   * et l'échelle dit à quelle distance on est réellement en train de regarder.
   */
  buildControls() {
    const button = (cls, glyph, action) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `icon-btn zoom__btn ${cls}`;
      node.append(Object.assign(document.createElement('span'), {
        textContent: glyph, ariaHidden: 'true',
      }));
      node.addEventListener('click', action);
      return node;
    };

    this.zoomIn = button('zoom__in', '+', () => this.zoomBy(ZOOM_STEP));
    this.zoomOut = button('zoom__out', '−', () => this.zoomBy(1 / ZOOM_STEP));
    this.zoomFit = button('zoom__fit', '⤢', () => this.refit());

    this.zoomBox = document.createElement('div');
    this.zoomBox.className = 'zoom';
    this.zoomBox.hidden = true;
    this.zoomBox.append(this.zoomIn, this.zoomOut, this.zoomFit);

    this.scaleRule = document.createElement('div');
    this.scaleRule.className = 'scale__rule';
    this.scaleText = document.createElement('span');
    this.scaleText.className = 'scale__text';
    this.scaleBar = document.createElement('div');
    this.scaleBar.className = 'scale';
    this.scaleBar.hidden = true;
    this.scaleBar.append(this.scaleText, this.scaleRule);

    // La mention de source n'est pas une politesse : la licence du fond de
    // carte l'exige dès qu'une tuile est affichée.
    this.attribution = document.createElement('a');
    this.attribution.className = 'attribution';
    this.attribution.href = 'https://www.openstreetmap.org/copyright';
    this.attribution.target = '_blank';
    this.attribution.rel = 'noopener noreferrer';
    this.attribution.textContent = TILE_ATTRIBUTION;
    this.attribution.hidden = true;

    this.root.append(this.zoomBox, this.scaleBar, this.attribution);
    this.retranslateControls();
  }

  retranslateControls() {
    this.zoomIn.title = t('map.zoomIn');
    this.zoomIn.setAttribute('aria-label', t('map.zoomIn'));
    this.zoomOut.title = t('map.zoomOut');
    this.zoomOut.setAttribute('aria-label', t('map.zoomOut'));
    this.zoomFit.title = t('map.zoomFit');
    this.zoomFit.setAttribute('aria-label', t('map.zoomFit'));
  }

  /** N'ouvrir les commandes qu'où le zoom existe : une fois un pays ouvert. */
  syncControls() {
    const open = this.mode === 'country';
    this.zoomBox.hidden = !open;
    this.scaleBar.hidden = !open;
    if (!open) return;
    const k = this.transform.k;
    const [lo, hi] = this.zoomLimits();
    this.zoomIn.disabled = k >= hi - 1e-9;
    this.zoomOut.disabled = k <= lo + 1e-9;
    this.zoomFit.disabled = this.zoomOut.disabled;
    this.drawScale();
  }

  /** Zoom par palier, centré sur le milieu de l'écran. */
  zoomBy(factor) {
    const vp = this.viewport();
    this.zoomAround({ x: vp.w / 2, y: vp.h / 2 }, factor, this.transform);
  }

  /** Revient au cadrage d'arrivée du pays ouvert. */
  refit() {
    const country = this.atlas.countryById.get(this.countryId);
    if (!country) return;
    this.animateTo(this.frame(country.focus, { padding: 0.07 }));
  }

  /**
   * Barre d'échelle.
   *
   * En Mercator, un pixel ne vaut pas la même distance partout : l'échelle est
   * calculée à la latitude du milieu de l'écran, seul endroit où elle est
   * exacte. On cherche ensuite la plus grande longueur ronde qui tienne dans
   * la largeur allouée.
   */
  drawScale() {
    const vp = this.viewport();
    const metresPerPixel = this.groundScale();
    const budget = Math.min(150, vp.w * 0.22);

    let metres = SCALE_STEPS[0];
    for (const step of SCALE_STEPS) if (step / metresPerPixel <= budget) metres = step;
    const width = Math.round(metres / metresPerPixel);

    this.scaleRule.style.width = `${width}px`;
    this.scaleText.textContent = metres >= 1000
      ? formatDistance(metres / 1000, 'kilometer', this.lang)
      : formatDistance(metres, 'meter', this.lang);
  }

  // -------------------------------------------------------------------------
  // Fond de tuiles
  // -------------------------------------------------------------------------

  /**
   * Mètres au sol par pixel d'écran, à la latitude du milieu de la vue.
   *
   * En Mercator un pixel ne vaut pas la même distance partout : c'est cette
   * grandeur, et non le facteur de zoom, qui dit à quelle échelle on regarde.
   */
  groundScale() {
    const vp = this.viewport();
    const { k, y } = this.transform;
    const [, lat] = unproject(0, (vp.h / 2 - y) / k);
    return (EQUATOR * Math.cos(lat * Math.PI / 180)) / (WORLD_SIZE * k);
  }

  /**
   * Peut-on compter sur un fond de tuiles ?
   *
   * Non seulement s'il est demandé, mais s'il répond : un fournisseur coupé,
   * un réseau absent, et l'application doit se retrouver exactement dans
   * l'état où elle serait sans lui — mêmes limites de zoom, mêmes villages
   * dessinés. Sans quoi elle offrirait un zoom qui ne montre plus rien.
   */
  tilesAvailable() {
    return getBasemap() === 'auto' && this.tileFailures < TILE_GIVE_UP;
  }

  /**
   * Le fond de tuiles a-t-il lieu d'être ?
   *
   * Dès l'ouverture d'un pays, et non à partir d'un zoom : on veut voir les
   * routes tout de suite, pas après trois paliers. Aux échelles supérieures —
   * monde, continent — la carte est thématique, elle dit quels pays comptent
   * des saints ; y poser des rues n'aurait aucun sens.
   */
  tilesWanted() {
    return this.mode === 'country' && this.tilesAvailable();
  }

  /**
   * Niveau de tuile dont la résolution colle à celle de l'écran.
   *
   * Une tuile de zoom z couvre WORLD_SIZE / 2^z unités monde ; on cherche le z
   * pour lequel elle occupe environ 256 pixels, sans quoi l'image serait
   * étirée ou inutilement fine.
   */
  tileZoom() {
    const ideal = Math.log2((WORLD_SIZE * this.transform.k) / TILE_SIZE);
    return Math.max(0, Math.min(TILE_MAX_Z, Math.round(ideal)));
  }

  /** Pose, déplace et retire les tuiles selon le cadre visible. */
  syncTiles() {
    if (!this.tilesWanted()) {
      if (this.tiles.size) this.clearTiles();
      this.root.classList.remove('has-tiles');
      document.documentElement.dataset.tiles = 'off';
      if (this.attribution) this.attribution.hidden = true;
      return;
    }

    const z = this.tileZoom();
    const count = 2 ** z;
    const span = WORLD_SIZE / count;
    const [x0, y0, x1, y1] = this.window(TILE_MARGIN);
    const range = {
      z,
      i0: Math.max(0, Math.floor(x0 / span)),
      i1: Math.min(count - 1, Math.floor(x1 / span)),
      j0: Math.max(0, Math.floor(y0 / span)),
      j1: Math.min(count - 1, Math.floor(y1 / span)),
    };

    // Rien n'a bougé d'une tuile entière : le calque est déjà juste.
    const before = this.tileRange;
    if (before && before.z === z && before.i0 === range.i0 && before.i1 === range.i1
      && before.j0 === range.j0 && before.j1 === range.j1) return;
    this.tileRange = range;

    const wanted = new Set();
    const bleed = span * TILE_BLEED;
    for (let i = range.i0; i <= range.i1; i += 1) {
      for (let j = range.j0; j <= range.j1; j += 1) {
        const key = `${z}/${i}/${j}`;
        wanted.add(key);
        if (this.tiles.has(key)) continue;
        const node = el('image', {
          class: 'tile',
          x: i * span - bleed,
          y: j * span - bleed,
          width: span + bleed * 2,
          height: span + bleed * 2,
          preserveAspectRatio: 'none',
        });
        node.addEventListener('load', () => {
          node.classList.add('is-loaded');
          this.tileFailures = 0;
        });
        node.addEventListener('error', () => {
          node.remove();
          this.tiles.delete(key);
          this.tileFailures += 1;
          // Le fond a beau être coupé, la carte reste entière. Renoncer, c'est
          // revenir en tout point à l'état sans tuiles : les villages
          // reparaissent, et le zoom se resserre là où il a encore de quoi
          // montrer quelque chose.
          if (this.tileFailures === TILE_GIVE_UP) this.giveUpTiles();
        });
        node.setAttributeNS('http://www.w3.org/1999/xlink', 'href',
          TILE_URL.replace('{z}', z).replace('{x}', i).replace('{y}', j));
        this.tileLayer.append(node);
        this.tiles.set(key, node);
      }
    }

    // Les tuiles d'un autre niveau restent le temps que celles-ci arrivent :
    // les retirer d'abord ferait clignoter le fond à chaque cran de zoom.
    for (const [key, node] of this.tiles) {
      if (wanted.has(key)) continue;
      if (key.startsWith(`${z}/`) || node.classList.contains('is-stale')) {
        node.remove();
        this.tiles.delete(key);
      } else {
        node.classList.add('is-stale');
      }
    }

    this.root.classList.add('has-tiles');
    document.documentElement.dataset.tiles = 'on';
    if (this.attribution) this.attribution.hidden = false;
  }

  /** Repli complet vers la carte vectorielle. */
  giveUpTiles() {
    this.clearTiles();
    this.root.classList.remove('has-tiles');
    document.documentElement.dataset.tiles = 'off';
    if (this.attribution) this.attribution.hidden = true;
    // Les localités reprennent leur service : il faut donc les charger, ce
    // qu'on avait justement évité de faire en comptant sur les tuiles.
    if (this.countryId) {
      const id = this.countryId;
      this.atlas.ensurePlaces(id).then(() => {
        if (this.countryId === id) this.refreshOverlay();
      });
    }
    this.refreshOverlay();
    if (this.mode === 'country') {
      const [, hi] = this.zoomLimits();
      if (this.transform.k > hi) this.zoomBy(hi / this.transform.k);
    }
  }

  clearTiles() {
    this.tileLayer.replaceChildren();
    this.tiles.clear();
    this.tileRange = null;
  }

  setLanguage(lang) {
    this.lang = lang;
    this.retranslateControls();
    this.refreshOverlay();
    this.syncControls();
  }

  // -------------------------------------------------------------------------
  // Cadrages
  // -------------------------------------------------------------------------

  /**
   * Zone de dessin, en pixels. Le panneau latéral occupe sa propre colonne :
   * la scène est déjà rétrécie d'autant, il n'y a donc rien à retrancher ici.
   */
  viewport() {
    // Mesure conservée d'un redimensionnement à l'autre : la lire après avoir
    // écrit un millier de transformations forcerait le navigateur à tout
    // recalculer sur-le-champ, et le zoom se traînerait.
    if (!this.vp) {
      const rect = this.root.getBoundingClientRect();
      this.vp = {
        w: rect.width, h: rect.height, x0: 0, y0: 0, x1: rect.width, y1: rect.height,
        left: rect.left, top: rect.top,
      };
    }
    return this.vp;
  }

  /**
   * Encombrement des éléments posés sur la carte.
   *
   * Un nom de village écrit sous le fil d'Ariane ou sous la légende est un nom
   * perdu : autant laisser la place à un autre. Ces cadres sont donc semés
   * dans la grille de collision avant les étiquettes.
   */
  chromeBoxes() {
    if (this.reserved) return this.reserved;
    const vp = this.viewport();
    this.reserved = [];
    for (const el of document.querySelectorAll('.trail, .hint, .tally, .continents, .legend, .zoom, .scale, .attribution')) {
      if (el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      this.reserved.push([
        r.left - vp.left - 4, r.top - vp.top - 4,
        r.right - vp.left + 4, r.bottom - vp.top + 4,
      ]);
    }
    return this.reserved;
  }

  /** Transformation amenant `bbox` dans la zone visible. */
  frame(bbox, { cover = false, padding = 0.04, limit = COVER_LIMIT } = {}) {
    const vp = this.viewport();
    const vw = Math.max(1, vp.x1 - vp.x0);
    const vh = Math.max(1, vp.y1 - vp.y0);
    const bw = Math.max(1, bbox[2] - bbox[0]);
    const bh = Math.max(1, bbox[3] - bbox[1]);
    const kx = vw / bw;
    const ky = vh / bh;

    // « contain » montre tout le cadre ; « cover » le fait déborder pour
    // remplir l'écran, sans jamais rogner au-delà de COVER_LIMIT.
    const contain = Math.min(kx, ky);
    const k = (cover ? Math.min(Math.max(kx, ky), contain * limit) : contain) * (1 - padding);

    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    return { k, x: (vp.x0 + vp.x1) / 2 - cx * k, y: (vp.y0 + vp.y1) / 2 - cy * k };
  }

  /** Cadre au-delà duquel la carte ne se laisse pas déplacer. */
  domain() {
    if (this.mode === 'country') {
      const country = this.atlas.countryById.get(this.countryId);
      return grow(country.focus, COUNTRY_SLACK);
    }
    if (this.mode === 'continent') return this.atlas.continentById.get(this.continentId).bbox;
    return this.atlas.bounds;
  }

  /** Ramène la translation dans les limites du cadre courant. */
  clamp(transform) {
    const vp = this.viewport();
    const d = this.domain();
    const { k } = transform;
    let { x, y } = transform;

    const fit = (value, lowEdge, highEdge, d0, d1) => {
      const max = lowEdge - d0 * k;
      const min = highEdge - d1 * k;
      if (min > max) return (lowEdge + highEdge) / 2 - ((d0 + d1) / 2) * k;
      return Math.min(max, Math.max(min, value));
    };

    x = fit(x, vp.x0, vp.x1, d[0], d[2]);
    y = fit(y, vp.y0, vp.y1, d[1], d[3]);
    return { k, x, y };
  }

  apply(transform, { clamp = true } = {}) {
    this.transform = clamp ? this.clamp(transform) : transform;
    const { k, x, y } = this.transform;
    this.scene.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    // Zoomer fait apparaître des localités plus petites : on ne reconstruit le
    // calque que lorsque leur nombre change réellement.
    // Déplacer la carte déplacerait la liste sous le doigt : mieux vaut la
    // refermer que la laisser désigner un autre endroit.
    if (this.picker && (this.transform.k !== this.pickerAt?.k
      || Math.abs(this.transform.x - this.pickerAt.x) > 2
      || Math.abs(this.transform.y - this.pickerAt.y) > 2)) this.closePicker();
    this.pickerAt = this.picker ? { ...this.transform } : null;

    this.syncTiles();
    if (this.overlayStale()) this.refreshOverlay();
    else this.positionOverlay();
    this.syncControls();
  }

  /**
   * Le calque doit-il être reconstruit, ou seulement repositionné ?
   *
   * Repositionner coûte une boucle ; reconstruire coûte quatorze cents nœuds.
   * On ne reconstruit donc que lorsque la sélection a réellement pu changer :
   * le budget a bougé, le zoom a franchi un cran, ou l'on s'est déplacé assez
   * loin pour sortir de la marge calculée d'avance.
   */
  overlayStale() {
    if (this.mode !== 'country') return false;
    const at = this.overlayAt;
    if (!at) return true;
    // Le budget bouge à chaque fraction de zoom : sans marge, on reconstruirait
    // mille nœuds à chaque cran de molette pour vingt noms de plus.
    const budget = this.placeBudget();
    if (budget > this.placeCount * 1.2 || budget < this.placeCount * 0.8) return true;
    if (Math.abs(Math.log(this.transform.k / at.k)) > 0.3) return true;
    const vp = this.viewport();
    const span = Math.max(vp.w, vp.h) * OVERLAY_REDRAW;
    return Math.abs(this.transform.x - at.x) > span
      || Math.abs(this.transform.y - at.y) > span;
  }

  animateTo(target) {
    if (this.animation) cancelAnimationFrame(this.animation);
    const from = { ...this.transform };
    const to = this.clamp(target);
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / TRANSITION);
      const e = easeInOut(p);
      this.apply({
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      }, { clamp: false });
      if (p < 1) this.animation = requestAnimationFrame(step);
      else this.animation = null;
    };
    this.animation = requestAnimationFrame(step);
  }

  onResize() {
    // Un changement de zoom du navigateur passe par ici : les tailles lues en
    // pixels ne valent plus, la fonte est remesurée.
    this.vp = null;
    this.reserved = null;
    this.fonts.clear();
    if (this.mode === 'world') this.apply(this.worldFrame());
    else if (this.mode === 'continent') {
      const bbox = this.atlas.continentById.get(this.continentId).bbox;
      this.apply(this.frame(bbox, { cover: true, padding: 0.03 }));
    } else {
      // En vue pays on préserve le zoom en cours, quitte à le recadrer.
      this.apply({ ...this.transform });
    }
    this.refreshOverlay();
  }

  // -------------------------------------------------------------------------
  // Changements de niveau
  // -------------------------------------------------------------------------

  showWorld({ animate = true } = {}) {
    this.mode = 'world';
    this.closePicker();
    this.clearTiles();
    this.continentId = null;
    this.countryId = null;
    this.highlightId = null;
    this.detailLayer.replaceChildren();
    this.syncCountryClasses();
    this.refreshOverlay();
    if (animate) this.animateTo(this.worldFrame()); else this.apply(this.worldFrame());
  }

  /**
   * Le planisphère occupe toute la hauteur, quitte à sortir par les côtés.
   *
   * Le montrer en entier le réduisait à un bandeau au milieu de l'écran, avec
   * deux larges bandes de mer au-dessus et au-dessous : on ouvrait
   * l'application sur du vide. Mieux vaut arriver dans la carte, et laisser le
   * déplacement — toujours borné — découvrir ce qui dépasse.
   */
  worldFrame() {
    return this.frame(this.atlas.bounds, { padding: 0, cover: true, limit: WORLD_COVER });
  }

  showContinent(id, { animate = true } = {}) {
    const continent = this.atlas.continentById.get(id);
    if (!continent) return;
    this.mode = 'continent';
    this.closePicker();
    this.clearTiles();
    this.continentId = id;
    this.countryId = null;
    this.highlightId = null;
    this.detailLayer.replaceChildren();
    this.syncCountryClasses();
    this.refreshOverlay();
    const target = this.frame(continent.bbox, { cover: true, padding: 0.03 });
    if (animate) this.animateTo(target); else this.apply(target);
  }

  async showCountry(id, { animate = true } = {}) {
    const country = this.atlas.countryById.get(id);
    if (!country) return;
    this.closePicker();
    if (this.countryId !== id) this.clearTiles();
    this.mode = 'country';
    this.continentId = country.continent;
    this.countryId = id;
    this.highlightId = null;
    this.syncCountryClasses();
    this.refreshOverlay();

    // Cadrage « contenir » : le pays doit tenir tout entier à l'écran, quitte
    // à laisser de la mer autour d'un territoire très allongé.
    const target = this.frame(country.focus, { padding: 0.07 });
    this.fitScale = target.k;
    // Latitude du milieu du pays : en Mercator, c'est elle qui dit combien de
    // mètres vaut un pixel, donc jusqu'où il est utile de zoomer.
    [, this.countryLat] = unproject(0, (country.focus[1] + country.focus[3]) / 2);
    if (animate) this.animateTo(target); else this.apply(target);

    // Villes et villages arrivent après coup : la transition ne les attend pas.
    // Sous un fond de tuiles ils ne serviraient à rien : autant ne pas
    // télécharger un demi-mégaoctet de noms que personne ne lira.
    if (!this.tilesWanted()) {
      this.atlas.ensurePlaces(id).then(() => {
        if (this.countryId === id) this.refreshOverlay();
      });
    }

    // Le contour fin arrive après coup : la transition ne l'attend pas.
    const detail = await this.atlas.countryDetail(id);
    if (detail && this.countryId === id) {
      const path = el('path', {
        // Le contour fin reprend la couleur du pays : ouvrir un pays ne doit
        // pas lui faire perdre le signal « compte des saints ».
        class: `country-detail${this.atlas.countryHasSaints(id) ? ' has-saints' : ''}`,
        d: detail.d,
        'fill-rule': 'evenodd',
        'vector-effect': 'non-scaling-stroke',
      });
      path.dataset.country = id;
      this.detailLayer.replaceChildren(path);
    }
  }

  highlightSaint(saintId) {
    this.highlightId = saintId;
    for (const marker of this.markers) {
      marker.node.classList.toggle(
        'is-active',
        !!marker.group?.some((s) => s.id === saintId),
      );
    }
  }

  syncCountryClasses() {
    // L'échelle courante est portée sur l'hôte : la feuille de style en a
    // besoin pour traiter les pays voisins autrement selon qu'on choisit
    // parmi eux ou qu'on est déjà entré dans l'un d'eux.
    this.root.dataset.mode = this.mode;
    // Le contour fin est posé une fois à l'ouverture du pays ; si le corpus
    // bouge ensuite — un premier saint y est publié — sa couleur doit suivre.
    const outline = this.detailLayer.firstChild;
    if (outline && this.countryId) {
      outline.classList.toggle('has-saints', this.atlas.countryHasSaints(this.countryId));
    }
    for (const country of this.atlas.countries) {
      const path = this.paths.get(country.id);
      const has = this.atlas.countryHasSaints(country.id);
      path.classList.toggle('has-saints', has);
      path.classList.toggle('is-selected', this.mode === 'country' && country.id === this.countryId);
      path.classList.toggle(
        'is-muted',
        (this.mode === 'continent' && country.continent !== this.continentId)
        || (this.mode === 'country' && country.id !== this.countryId),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Calque non déformé : étiquettes et repères
  // -------------------------------------------------------------------------

  /**
   * Combien de localités montrer à l'échelle courante.
   *
   * Au cadrage d'arrivée on ne veut que les grandes villes ; plus on zoome,
   * plus la carte descend vers les bourgs puis les villages, le tri par
   * population faisant office de hiérarchie.
   */
  placeBudget() {
    if (!this.fitScale) return PLACES_AT_FIT;
    const ratio = Math.max(1, this.transform.k / this.fitScale);
    return Math.min(PLACES_MAX, Math.round(PLACES_AT_FIT * ratio ** PLACES_GROWTH));
  }

  /**
   * Fenêtre prise en compte, en coordonnées monde.
   *
   * Plus large que l'écran : la marge doit couvrir tout déplacement admis
   * avant le prochain calcul du calque, sinon on tirerait derrière soi une
   * bande vide de noms.
   */
  window(fraction = OVERLAY_MARGIN) {
    const vp = this.viewport();
    const margin = Math.max(vp.w, vp.h) * fraction;
    const { k, x, y } = this.transform;
    return [
      (-margin - x) / k, (-margin - y) / k,
      (vp.w + margin - x) / k, (vp.h + margin - y) / k,
    ];
  }

  /**
   * Quelles localités montrer.
   *
   * Le tri du fichier étant par population décroissante, prendre les premières
   * *du cadre visible* revient à garder les plus importantes de ce qu'on
   * regarde. C'est ce qui fait descendre la carte jusqu'aux villages : zoomé
   * sur la Bretagne, on veut les bourgs bretons, pas Marseille et Lyon parce
   * qu'elles pèsent plus lourd à l'échelle du pays.
   */
  visiblePlaces() {
    // Sous un fond de tuiles, le fournisseur écrit déjà chaque bourg et chaque
    // rue : redoubler ses noms des nôtres ne ferait que les brouiller. La
    // carte porte la géographie, nous portons les saints.
    if (this.tilesWanted()) return [];
    const all = this.atlas.loadedPlaces(this.countryId);
    const budget = this.placeBudget();
    if (!this.fitScale || this.transform.k <= this.fitScale * 1.02) return all.slice(0, budget);

    const [x0, y0, x1, y1] = this.window();
    const out = [];
    for (const place of all) {
      if (place.x < x0 || place.x > x1 || place.y < y0 || place.y > y1) continue;
      out.push(place);
      if (out.length >= budget) break;
    }
    return out;
  }

  refreshOverlay() {
    this.reserved = null;
    this.labels = [];
    this.markers = [];
    this.placeCount = this.mode === 'country' ? this.placeBudget() : 0;
    this.overlayAt = { ...this.transform };
    const nodes = [];

    if (this.mode === 'continent') {
      const continent = this.atlas.continentById.get(this.continentId);
      for (const id of continent.countries) {
        const country = this.atlas.countryById.get(id);
        const count = this.atlas.saintsIn(id).length;
        nodes.push(this.makeLabel({
          x: country.label[0],
          y: country.label[1],
          text: this.atlas.countryName(id, this.lang),
          sub: count ? String(count) : '',
          cls: `label label--country${count ? ' has-saints' : ''}`,
          priority: country.area + (count ? 1e12 : 0),
        }));
      }
    } else if (this.mode === 'country') {
      // Priorités d'affichage quand les étiquettes se disputent la place :
      // la capitale d'abord — elle situe le pays —, puis les saints, puis les
      // autres localités, qui ne sont là que pour donner des repères.
      for (const place of this.visiblePlaces()) {
        nodes.push(this.makeMarker({
          x: place.x, y: place.y, kind: 'city', text: place.n,
          rank: place.c ? PLACE_RANKS[0] : placeRank(place.p),
          priority: place.c ? 1e12 : place.p,
        }));
      }
      this.clusters = this.clusterSaints(this.atlas.saintsIn(this.countryId));
      this.clusters.forEach((group, index) => {
        const shared = group.every((s) => s.city === group[0].city) ? group[0].city : '';
        nodes.push(this.makeMarker({
          x: group.x, y: group.y, kind: 'saint', group, index,
          text: group.length === 1
            ? this.atlas.saintName(group[0], this.lang)
            : (shared || t('map.several', { n: group.length })),
          // Un groupe passe avant un saint seul : il en cache plusieurs.
          priority: 1e10 + group.length - (group[0].born ?? group[0].died ?? 0),
        }));
      });
    }

    this.overlay.replaceChildren(...nodes);
    this.positionOverlay();
  }

  /**
   * Regroupe les saints dont les repères se toucheraient à l'écran.
   *
   * Cinq saints sont nés à Alexandrie, cinq à Londres, trois à Rome : leurs
   * croix se posent au même endroit, et cliquer en ouvrait une au hasard — la
   * dernière dessinée. Un groupe porte le nombre qu'il cache, et l'on choisit
   * dans une liste. Le regroupement se refait à chaque zoom : deux villages
   * voisins se séparent dès qu'on s'approche assez pour les distinguer.
   */
  clusterSaints(saints) {
    const { k, x: tx, y: ty } = this.transform;
    const cell = CLUSTER_RADIUS;
    const grid = new Map();
    const groups = [];

    for (const saint of saints) {
      const sx = saint.x * k + tx;
      const sy = saint.y * k + ty;
      const cx = Math.floor(sx / cell);
      const cy = Math.floor(sy / cell);

      let found = null;
      for (let i = cx - 1; i <= cx + 1 && !found; i += 1) {
        for (let j = cy - 1; j <= cy + 1 && !found; j += 1) {
          for (const group of grid.get(`${i},${j}`) || []) {
            if (Math.hypot(group.sx - sx, group.sy - sy) <= CLUSTER_RADIUS) {
              found = group;
              break;
            }
          }
        }
      }

      if (found) {
        found.push(saint);
        // Le groupe se recentre sur ses membres, sans quoi sa croix pencherait
        // vers le premier arrivé.
        found.sx = (found.sx * (found.length - 1) + sx) / found.length;
        found.sy = (found.sy * (found.length - 1) + sy) / found.length;
        found.x = (found.x * (found.length - 1) + saint.x) / found.length;
        found.y = (found.y * (found.length - 1) + saint.y) / found.length;
        continue;
      }

      const group = [saint];
      group.sx = sx;
      group.sy = sy;
      group.x = saint.x;
      group.y = saint.y;
      groups.push(group);
      const key = `${cx},${cy}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(group); else grid.set(key, [group]);
    }

    // Les plus anciens d'abord dans chaque liste : on lit une file de saints
    // comme une chronologie, non comme l'ordre du fichier.
    for (const group of groups) {
      group.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0));
    }
    return groups;
  }

  makeLabel({ x, y, text, sub, cls, priority }) {
    const group = el('g', { class: cls });
    const main = el('text', { class: 'label__text', 'text-anchor': 'middle' });
    main.textContent = text;
    group.append(main);
    if (sub) {
      const badge = el('text', { class: 'label__count', 'text-anchor': 'middle', dy: '1.15em' });
      badge.textContent = sub;
      group.append(badge);
    }
    const item = { node: group, x, y, text, priority, kind: 'label' };
    this.labels.push(item);
    return group;
  }

  makeMarker({ x, y, kind, text, group, index, priority, rank }) {
    const node = el('g', { class: `marker marker--${kind}${rank ? ` marker--${rank.cls}` : ''}` });
    if (kind === 'city') {
      node.append(el('circle', { class: 'marker__dot', r: rank.dot }));
    } else {
      // Un médaillon : disque clair pour détacher le repère de la carte,
      // écusson coloré, croix blanche. Trois pièces plutôt qu'une image, pour
      // qu'il suive le thème et l'état de la fiche sans autre ressource.
      node.append(
        el('circle', { class: 'marker__halo', r: 13 }),
        el('circle', { class: 'marker__ring', r: 10.5 }),
        el('rect', { class: 'marker__badge', x: -7.5, y: -7.5, width: 15, height: 15, rx: 4.5 }),
        el('path', { class: 'marker__cross', d: CROSS }),
      );
      if (group.length > 1) {
        // Une pastille dit combien de saints le repère recouvre : sans elle,
        // rien n'inviterait à cliquer pour découvrir les autres.
        node.classList.add('marker--group');
        const count = el('text', { class: 'marker__count', 'text-anchor': 'middle' });
        count.textContent = String(group.length);
        node.append(el('circle', { class: 'marker__countdot', cx: 9, cy: -9, r: 7 }), count);
      }
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.dataset.cluster = String(index);
      if (group.length === 1 && group[0].user) node.classList.add('is-user');
    }
    const label = el('text', { class: 'marker__label', 'text-anchor': 'middle' });
    label.textContent = text;
    node.append(label);

    const item = { node, x, y, text, priority, kind, group, label, rank };
    this.markers.push(item);
    return node;
  }

  /**
   * Largeur d'un texte sans passer par la mise en page.
   *
   * `getBBox()` est juste, mais il force un recalcul de la mise en page à
   * chaque appel : sur un millier de noms, c'est une centaine de millisecondes
   * par image, et le zoom devient poisseux. La mesure sur un contexte de
   * dessin donne le même résultat pour du texte simple, sans rien recalculer.
   */
  textWidth(text, font) {
    if (!this.gauge) this.gauge = document.createElement('canvas').getContext('2d');
    if (this.gauge.font !== font) this.gauge.font = font;
    return this.gauge.measureText(text).width;
  }

  /** Fonte effective d'un rang, lue une fois sur un élément réel. */
  fontOf(item) {
    const key = item.rank?.cls || item.kind;
    let entry = this.fonts.get(key);
    if (!entry) {
      const style = getComputedStyle(item.label);
      const size = parseFloat(style.fontSize);
      entry = {
        font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        h: size * 1.25,
        // Le nom est posé sous le repère : le décalage suit donc la taille du
        // rang, et vaut davantage sous une croix que sous un point. Un
        // décalage fixe désalignerait la boîte de collision du texte qu'elle
        // est censée protéger.
        dy: size * (item.kind === 'saint' ? LABEL_DROP_SAINT : LABEL_DROP),
      };
      this.fonts.set(key, entry);
    }
    return entry;
  }

  /**
   * Encombrement d'une étiquette, mesuré une seule fois par élément.
   *
   * Le texte ne changeant plus jusqu'au prochain rendu du calque, la mesure
   * est mise en cache : elle ne coûte donc rien pendant les animations, et
   * elle est autrement plus juste qu'une estimation au nombre de caractères,
   * qui ignorerait la casse, la graisse et l'interlettrage.
   */
  measure(item) {
    if (item.metrics) return item.metrics;
    // Tout ce qui se compte par centaines passe par la mesure rapide. Les
    // étiquettes de pays, elles, sont quelques dizaines, ne servent qu'en vue
    // continent — où le zoom est verrouillé — et portent une pastille de
    // compte sous le nom : pour elles, la mesure exacte du tracé reste juste.
    if (item.kind !== 'label') {
      const { font, h, dy } = this.fontOf(item);
      // Le médaillon d'un saint déborde son nom quand celui-ci est très court.
      const floor = item.kind === 'saint' ? 26 : 18;
      item.metrics = { w: Math.max(this.textWidth(item.text, font), floor), h, dy };
      return item.metrics;
    }
    try {
      const box = item.node.getBBox();
      item.metrics = { w: box.width, h: box.height };
    } catch {
      const size = item.kind === 'label' ? 13 : 11;
      item.metrics = { w: item.text.length * size * 0.6, h: size * 1.5 };
    }
    return item.metrics;
  }

  /**
   * Replace les éléments non déformés et masque les étiquettes qui se
   * chevauchent, les plus importantes gardant la priorité.
   */
  positionOverlay() {
    const { k, x: tx, y: ty } = this.transform;
    const vp = this.viewport();
    const items = [...this.labels, ...this.markers];
    if (!items.length) return;

    for (const item of items) {
      item.sx = item.x * k + tx;
      item.sy = item.y * k + ty;
      item.visible = item.sx > -80 && item.sx < vp.w + 80 && item.sy > -60 && item.sy < vp.h + 60;
      item.node.style.display = item.visible ? '' : 'none';
    }

    // Grille de collision plutôt que comparaison de chacun avec tous : à
    // quatorze cents noms, le second coûterait un million de tests par image.
    // Chaque étiquette n'est confrontée qu'à celles des cases qu'elle touche.
    const CELL = 64;
    const grid = new Map();
    const cells = (box) => {
      const out = [];
      for (let cx = Math.floor(box[0] / CELL); cx <= Math.floor(box[2] / CELL); cx += 1) {
        for (let cy = Math.floor(box[1] / CELL); cy <= Math.floor(box[3] / CELL); cy += 1) {
          out.push(`${cx},${cy}`);
        }
      }
      return out;
    };

    const occupy = (box) => {
      for (const key of cells(box)) {
        const bucket = grid.get(key);
        if (bucket) bucket.push(box); else grid.set(key, [box]);
      }
    };
    for (const box of this.chromeBoxes()) occupy(box);

    const ordered = items.filter((i) => i.visible).sort((a, b) => b.priority - a.priority);
    for (const item of ordered) {
      const { w, h, dy = 0 } = this.measure(item);

      item.node.setAttribute('transform', `translate(${item.sx} ${item.sy})`);

      // Un peu d'air autour de chaque nom : deux étiquettes qui se frôlent se
      // lisent presque aussi mal que deux qui se recouvrent.
      const box = [
        item.sx - w / 2 - LABEL_GAP, item.sy - h / 2 + dy - LABEL_GAP_Y,
        item.sx + w / 2 + LABEL_GAP, item.sy + h / 2 + dy + LABEL_GAP_Y,
      ];
      const keys = cells(box);
      const clash = keys.some((key) => grid.get(key)?.some(
        (p) => box[0] < p[2] && p[0] < box[2] && box[1] < p[3] && p[1] < box[3],
      ));
      const show = !clash || !!item.group?.some((s) => s.id === this.highlightId);
      item.node.classList.toggle('is-crowded', !show);
      if (show) occupy(box);
    }
  }

  // -------------------------------------------------------------------------
  // Souris, doigt, molette
  // -------------------------------------------------------------------------

  bindPointer() {
    const pointers = new Map();
    let start = null;
    let pinch = null;

    const local = (event) => {
      const rect = this.root.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    this.svg.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      this.svg.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
      if (pointers.size === 1) {
        start = { ...local(event), transform: { ...this.transform }, moved: false, target: event.target };
      } else if (pointers.size === 2 && this.mode === 'country') {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), transform: { ...this.transform } };
      }
    });

    this.svg.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, local(event));

      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.zoomAround(centre, distance / (pinch.distance || 1), pinch.transform);
        return;
      }
      if (!start) return;
      const p = local(event);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) start.moved = true;
      if (start.moved) {
        if (this.animation) {
          cancelAnimationFrame(this.animation);
          this.animation = null;
        }
        this.apply({ k: start.transform.k, x: start.transform.x + dx, y: start.transform.y + dy });
      }
    });

    const release = (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0 && start) {
        if (!start.moved) this.onTap(start.target, local(event));
        start = null;
      }
    };
    this.svg.addEventListener('pointerup', release);
    this.svg.addEventListener('pointercancel', release);

    this.svg.addEventListener('wheel', (event) => {
      if (this.mode !== 'country') return; // Le zoom libre n'existe qu'en vue pays.
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      this.zoomAround(local(event), factor, this.transform);
    }, { passive: false });

    this.svg.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const marker = event.target.closest?.('[data-saint]');
      if (!marker) return;
      event.preventDefault();
      this.handlers.onSaint?.(marker.dataset.saint);
    });
  }

  /** Zoom au clavier, pour qui n'a ni molette ni pavé tactile. */
  bindKeys() {
    this.onKey = (event) => {
      if (event.key === 'Escape' && this.picker) {
        this.closePicker();
        event.stopPropagation();
        return;
      }
      if (this.mode !== 'country') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Rien ne doit se déclencher pendant qu'on écrit dans la barre de recherche.
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'Escape' && this.picker) { this.closePicker(); return; }
      if (event.key === '+' || event.key === '=') this.zoomBy(ZOOM_STEP);
      else if (event.key === '-' || event.key === '_') this.zoomBy(1 / ZOOM_STEP);
      else if (event.key === '0') this.refit();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
  }

  /** Bornes absolues du zoom pour le pays ouvert. */
  zoomLimits() {
    // Sans fond de tuiles, descendre plus bas que la quarantaine de mètres par
    // pixel ne montrerait qu'un aplat : nos données s'arrêtent là. Avec, il y a
    // des rues à voir, et l'on peut aller jusqu'au niveau du pâté de maisons.
    const limit = this.tilesAvailable() ? GROUND_LIMIT_TILED : GROUND_LIMIT;
    const ground = (EQUATOR * Math.cos((this.countryLat || 0) * Math.PI / 180))
      / (WORLD_SIZE * limit);
    return [
      this.fitScale * COUNTRY_ZOOM[0],
      Math.min(
        this.fitScale * (this.tilesAvailable() ? COUNTRY_ZOOM_MAX_TILED : COUNTRY_ZOOM_MAX),
        Math.max(this.fitScale * COUNTRY_ZOOM[1], ground),
      ),
    ];
  }

  zoomAround(point, factor, base) {
    if (this.mode !== 'country' || !this.fitScale) return;
    const [lo, hi] = this.zoomLimits();
    const k = Math.min(hi, Math.max(lo, base.k * factor));
    const ratio = k / base.k;
    this.apply({
      k,
      x: point.x - (point.x - base.x) * ratio,
      y: point.y - (point.y - base.y) * ratio,
    });
  }

  /**
   * Liste de choix, quand un repère en cache plusieurs.
   *
   * Elle se pose sur la carte, à côté du groupe, et se referme au premier
   * geste qui l'éloigne : choisir un saint, cliquer ailleurs, déplacer la
   * carte, appuyer sur Échap.
   */
  openPicker(group, at) {
    this.closePicker();
    const vp = this.viewport();
    const shared = group.every((s) => s.city === group[0].city) ? group[0].city : '';

    const box = document.createElement('div');
    box.className = 'picker';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('map.chooseSaint'));

    const head = document.createElement('p');
    head.className = 'picker__head';
    head.textContent = shared
      ? `${shared} — ${t('map.several', { n: group.length })}`
      : t('map.several', { n: group.length });
    box.append(head);

    for (const saint of group) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'picker__item';
      const name = document.createElement('span');
      name.className = 'picker__name';
      name.textContent = this.atlas.saintName(saint, this.lang);
      const meta = document.createElement('span');
      meta.className = 'picker__meta';
      const born = saint.born ?? saint.died;
      meta.textContent = [saint.city, born == null ? '' : String(born)]
        .filter(Boolean).join(' · ');
      row.append(name, meta);
      row.addEventListener('click', () => {
        this.closePicker();
        this.handlers.onSaint?.(saint.id);
      });
      box.append(row);
    }

    this.root.append(box);
    this.picker = box;
    // Le repère de position est posé ici, et non au prochain rendu : sans lui,
    // la première image venue croirait la carte déplacée et refermerait la
    // liste avant qu'on ait pu lire un seul nom.
    this.pickerAt = { ...this.transform };

    // Posée près du repère, mais jamais hors de la carte : sur un téléphone,
    // un groupe au bord de l'écran pousserait la liste dans le vide.
    const w = box.offsetWidth;
    const hgt = box.offsetHeight;
    const left = Math.max(8, Math.min(vp.w - w - 8, at.x - w / 2));
    const top = at.y + 18 + hgt > vp.h ? at.y - hgt - 18 : at.y + 18;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(Math.max(8, top))}px`;
    box.classList.add('is-open');
  }

  closePicker() {
    this.picker?.remove();
    this.picker = null;
  }

  onTap(target, point) {
    if (this.picking) {
      const { k, x, y } = this.transform;
      let wx = (point.x - x) / k;
      if (wx > WORLD_SIZE) wx -= WORLD_SIZE;
      const [lng, lat] = unproject(wx, (point.y - y) / k);
      const done = this.picking;
      this.picking = null;
      this.root.classList.remove('is-picking');
      done({
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
        // Le pays sous le curseur évite d'avoir à le choisir séparément —
        // et d'aboutir à un point posé hors du pays déclaré.
        country: target.closest?.('[data-country]')?.dataset.country || null,
      });
      return;
    }

    const marker = target.closest?.('[data-cluster]');
    if (marker) {
      const group = this.clusters?.[Number(marker.dataset.cluster)];
      if (!group) return;
      // Un seul saint : autant ouvrir sa fiche sans faire choisir entre lui
      // et lui-même.
      if (group.length === 1) this.handlers.onSaint?.(group[0].id);
      else this.openPicker(group, point);
      return;
    }
    this.closePicker();
    const shape = target.closest?.('[data-country]');
    if (shape) {
      this.handlers.onCountry?.(shape.dataset.country);
      return;
    }
    // Sous un fond de tuiles, tout l'écran est de la carte : un clic « à côté »
    // n'existe plus, et le prendre pour un retour ferait remonter d'un niveau
    // au moindre tapotement. On revient alors par le fil d'Ariane ou Échap.
    if (this.tilesWanted()) return;
    this.handlers.onBackground?.();
  }

  beginPick(callback) {
    this.picking = callback;
    this.root.classList.add('is-picking');
  }

  cancelPick() {
    this.picking = null;
    this.root.classList.remove('is-picking');
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.offBasemap?.();
    window.removeEventListener('keydown', this.onKey);
    if (this.animation) cancelAnimationFrame(this.animation);
  }
}
