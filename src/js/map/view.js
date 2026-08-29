import { WORLD_SIZE, unproject } from './projection.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Durée des transitions entre deux cadrages, en millisecondes. */
const TRANSITION = 720;

/** Au-delà de ce rapport, remplir l'écran rognerait trop le cadre visé. */
const COVER_LIMIT = 1.35;

/** Bornes de zoom en vue « pays », relatives au cadrage d'arrivée. */
const COUNTRY_ZOOM = [1, 40];

/** Nombre de localités affichées au cadrage d'arrivée, avant tout zoom. */
const PLACES_AT_FIT = 12;

/** Plafond de localités simultanées : au-delà, la carte devient illisible. */
const PLACES_MAX = 450;

/** Marge de déplacement autorisée autour d'un pays, en fraction de sa taille. */
const COUNTRY_SLACK = 0.35;

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
    this.bindPointer();

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
    clipped.append(this.sheet, this.countryLayer, this.detailLayer);
    this.scene.append(defs, clipped);
    this.svg.append(this.scene, this.overlay);
    this.root.append(this.svg);

    this.labels = [];
    this.markers = [];
  }

  setLanguage(lang) {
    this.lang = lang;
    this.refreshOverlay();
  }

  // -------------------------------------------------------------------------
  // Cadrages
  // -------------------------------------------------------------------------

  /**
   * Zone de dessin, en pixels. Le panneau latéral occupe sa propre colonne :
   * la scène est déjà rétrécie d'autant, il n'y a donc rien à retrancher ici.
   */
  viewport() {
    const rect = this.root.getBoundingClientRect();
    return { w: rect.width, h: rect.height, x0: 0, y0: 0, x1: rect.width, y1: rect.height };
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
    if (this.mode === 'country' && this.placeBudget() !== this.placeCount) this.refreshOverlay();
    else this.positionOverlay();
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
    this.continentId = null;
    this.countryId = null;
    this.highlightId = null;
    this.detailLayer.replaceChildren();
    this.syncCountryClasses();
    this.refreshOverlay();
    if (animate) this.animateTo(this.worldFrame()); else this.apply(this.worldFrame());
  }

  /**
   * Le planisphère est deux fois plus large que haut : sur un écran en
   * hauteur, tout montrer le réduirait à un timbre-poste. On l'agrandit donc,
   * quitte à en cacher les bords — que le déplacement, toujours borné, révèle.
   */
  worldFrame() {
    const vp = this.viewport();
    const portrait = vp.h > vp.w;
    return this.frame(this.atlas.bounds, { padding: 0.01, cover: portrait, limit: 1.6 });
  }

  showContinent(id, { animate = true } = {}) {
    const continent = this.atlas.continentById.get(id);
    if (!continent) return;
    this.mode = 'continent';
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
    if (animate) this.animateTo(target); else this.apply(target);

    // Villes et villages arrivent après coup : la transition ne les attend pas.
    this.atlas.ensurePlaces(id).then(() => {
      if (this.countryId === id) this.refreshOverlay();
    });

    // Le contour fin arrive après coup : la transition ne l'attend pas.
    const detail = await this.atlas.countryDetail(id);
    if (detail && this.countryId === id) {
      const path = el('path', {
        class: 'country-detail',
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
      marker.node.classList.toggle('is-active', marker.saint?.id === saintId);
    }
  }

  syncCountryClasses() {
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
    return Math.min(PLACES_MAX, Math.round(PLACES_AT_FIT * ratio ** 1.7));
  }

  visiblePlaces() {
    return this.atlas.loadedPlaces(this.countryId).slice(0, this.placeBudget());
  }

  refreshOverlay() {
    this.labels = [];
    this.markers = [];
    this.placeCount = this.mode === 'country' ? this.placeBudget() : 0;
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
          small: place.p < 50000,
          priority: place.c ? 1e12 : place.p,
        }));
      }
      for (const saint of this.atlas.saintsIn(this.countryId)) {
        nodes.push(this.makeMarker({
          x: saint.x, y: saint.y, kind: 'saint', saint,
          text: this.atlas.saintName(saint, this.lang),
          priority: 1e10 - (saint.born ?? saint.died ?? 0),
        }));
      }
    }

    this.overlay.replaceChildren(...nodes);
    this.positionOverlay();
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

  makeMarker({ x, y, kind, text, saint, priority, small = false }) {
    const group = el('g', { class: `marker marker--${kind}${small ? ' marker--small' : ''}` });
    if (kind === 'city') {
      group.append(el('circle', { class: 'marker__dot', r: small ? 2 : 3.2 }));
    } else {
      group.append(
        el('circle', { class: 'marker__halo', r: 9 }),
        el('circle', { class: 'marker__dot', r: 4.5 }),
      );
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.dataset.saint = saint.id;
      if (saint.user) group.classList.add('is-user');
    }
    const label = el('text', { class: 'marker__label', 'text-anchor': 'middle' });
    label.textContent = text;
    group.append(label);

    const item = { node: group, x, y, text, priority, kind, saint, label };
    this.markers.push(item);
    return group;
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
    if (!item.metrics) {
      try {
        const box = item.node.getBBox();
        item.metrics = { w: box.width, h: box.height };
      } catch {
        const size = item.kind === 'label' ? 13 : 11;
        item.metrics = { w: item.text.length * size * 0.6, h: size * 1.5 };
      }
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

    const placed = [];
    const ordered = items.filter((i) => i.visible).sort((a, b) => b.priority - a.priority);
    for (const item of ordered) {
      const isLabel = item.kind === 'label';
      const { w, h } = this.measure(item);
      const dy = isLabel ? 0 : 16; // Les repères portent leur texte en dessous.

      item.node.setAttribute('transform', `translate(${item.sx} ${item.sy})`);

      const box = [item.sx - w / 2, item.sy - h / 2 + dy, item.sx + w / 2, item.sy + h / 2 + dy];
      const clash = placed.some((p) => box[0] < p[2] && p[0] < box[2] && box[1] < p[3] && p[1] < box[3]);
      const show = !clash || item.saint?.id === this.highlightId;
      item.node.classList.toggle('is-crowded', !show);
      if (show) placed.push(box);
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

  zoomAround(point, factor, base) {
    if (this.mode !== 'country' || !this.fitScale) return;
    const [lo, hi] = COUNTRY_ZOOM;
    const k = Math.min(this.fitScale * hi, Math.max(this.fitScale * lo, base.k * factor));
    const ratio = k / base.k;
    this.apply({
      k,
      x: point.x - (point.x - base.x) * ratio,
      y: point.y - (point.y - base.y) * ratio,
    });
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

    const marker = target.closest?.('[data-saint]');
    if (marker) {
      this.handlers.onSaint?.(marker.dataset.saint);
      return;
    }
    const shape = target.closest?.('[data-country]');
    if (shape) {
      this.handlers.onCountry?.(shape.dataset.country);
      return;
    }
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
    if (this.animation) cancelAnimationFrame(this.animation);
  }
}
