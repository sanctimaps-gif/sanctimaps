import { PENDING, REJECTED } from '../data.js';
import {
  collator, formatDay, formatFeast, formatNumber, formatYear, getLanguage, t,
} from '../i18n.js';
import { fill, h } from './dom.js';
import { emblemSvg } from '../emblems.js';

/** Le calendrier de l'AELF, lu une fois : `{ zone, jours: { "2026-10-02": {…} } }`. */
let aelf = null;
let aelfPromesse = null;
function chargerAelf() {
  aelfPromesse ||= fetch('data/aelf/calendrier.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((data) => { aelf = data || { jours: {} }; return aelf; });
  return aelfPromesse;
}

/** « 2026-10-02 » en heure locale : le jour du lecteur, non celui de Greenwich. */
function isoLocal(date) {
  return `${date.getFullYear()}-${DailyPanel.key(date)}`;
}

/** Des mots sans accents ni ponctuation, pour comparer un nom à un intitulé. */
function mots(texte) {
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
function lireJour(jour) {
  const nom = (v) => v && !DEGRE.test(v) && !/^de la f[ée]rie$/i.test(v);
  const titre = [jour.fete, jour.jour_liturgique_nom, jour.ligne1].find(nom) || '';
  const degre = jour.degre || [jour.ligne3, jour.ligne2, jour.fete].find((v) => v && DEGRE.test(v)) || '';
  return { titre, degre };
}

/** Les couleurs liturgiques, pour la pastille. */
const COULEURS = {
  blanc: '#f4efe2', vert: '#3f7a4a', violet: '#6b3f8c', rouge: '#b3262e', rose: '#e39bb4', noir: '#222',
  or: '#c9a227',
};

/**
 * Saint du jour.
 *
 * Le calendrier des saints est un calendrier perpétuel : la fête revient au
 * même jour tous les ans, et l'année ne compte pas. Cette partie ne fait donc
 * rien d'autre que lire l'horloge de la machine, en tirer un « mois-jour » et
 * ramener les fiches du corpus qui portent cette date.
 *
 * Un jour sans fête reste possible — le corpus n'est pas tenu de couvrir les
 * trois cent soixante-six jours, et les deux cent quatre-vingt-cinq fiches
 * écrites à la main n'en couvraient que deux cent seize avant l'import de
 * Wikidata. Plutôt que d'afficher un écran vide, la partie cherche la prochaine
 * date pourvue et propose d'y aller. Un vide qui indique la sortie vaut mieux
 * qu'un vide qui se tait, et une ligne finale dit franchement où en est le
 * corpus.
 */
export class DailyPanel {
  constructor(atlas, { onSelect }) {
    this.atlas = atlas;
    this.onSelect = onSelect;
    /** Décalage en jours par rapport à aujourd'hui, pour feuilleter. */
    this.offset = 0;
    this.root = h('div', { class: 'daily' });
    this.render();
    chargerAelf().then(() => this.render());
  }

  /** Ce que l'AELF dit du jour regardé, ou rien. */
  liturgie(date) {
    return aelf?.jours?.[isoLocal(date)] || null;
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
  honores(jour, date, lang) {
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
      for (const s of this.honoresParmi(new Set(sens(morceau)), date, lang, nommeUnSaint)) {
        if (!fiches.includes(s)) fiches.push(s);
      }
    }
    return this.anges(dits, fiches);
  }

  /** Les saints du corpus qu'un morceau d'intitulé nomme. */
  honoresParmi(dits, date, lang, prenomSuffit) {
    if (!dits.size) return [];
    const key = DailyPanel.key(date);
    const juge = (saint) => {
      const nom = sens(saint.name?.fr || this.atlas.saintName(saint, lang));
      if (!nom.length) return null;
      const dedans = nom.filter((m) => dits.has(m)).length;
      return { saint, prenom: dits.has(nom[0]), dedans, dehors: nom.length - dedans };
    };
    const duJour = [];
    const autres = [];
    for (const saint of this.atlas.saints) {
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
  anges(dits, fiches) {
    const anges = dits.has('anges') || dits.has('ange') || dits.has('archanges') || dits.has('archange');
    const nommes = ['michel', 'gabriel', 'raphael'].filter((m) => dits.has(m));
    for (const ap of this.atlas.apparitions || []) {
      const nomAp = mots(ap.name?.fr);
      // Le lieu, dans la ville ou dans le nom : « Apparition mariale de La Salette ».
      const lieu = [...sens(ap.city), ...sens(ap.name?.fr)]
        .filter((m) => m.length >= 5 && !GENERIQUES.has(m));
      const ange = anges && (nommes.length ? nommes.some((m) => nomAp.includes(m))
        : nomAp[0] === 'l' && nomAp[1] === 'ange');
      const marial = ((dits.has('notre') && dits.has('dame')) || dits.has('vierge'))
        && lieu.some((m) => dits.has(m));
      if (ange || marial) fiches.push(ap);
    }
    return fiches;
  }

  /** Le bandeau de la célébration : son nom, son degré, sa couleur, la source. */
  bandeau(jour, date, honores, lang) {
    const { titre: intitule, degre } = lireJour(jour);
    const couleur = (jour.couleur || '').toLowerCase();
    const meta = [degre, jour.couleur, intitule.includes(jour.semaine || '\u0000') ? null : jour.semaine]
      .filter(Boolean).join(' · ');
    const zone = aelf?.zone === 'france' || !aelf?.zone ? 'romain' : aelf.zone;
    return h('section', { class: 'daily__liturgie' },
      h('p', { class: 'daily__liturgie-titre' },
        COULEURS[couleur] ? h('span', { class: 'daily__couleur', style: `background:${COULEURS[couleur]}`, 'aria-hidden': 'true' }) : null,
        h('span', { text: t('daily.liturgie') })),
      h('p', { class: 'daily__fete', text: intitule }),
      meta ? h('p', { class: 'field__hint', text: meta }) : null,
      honores.length
        ? h('div', {},
          h('p', { class: 'daily__sous-titre', text: t('daily.honneur') }),
          h('div', { class: 'results', role: 'list' }, ...honores.map((f) => this.card(f, lang))))
        : null,
      h('a', { class: 'daily__source', href: `https://www.aelf.org/${isoLocal(date)}/${zone}/messe`,
        target: '_blank', rel: 'noopener', text: t('daily.lireAelf') }));
  }

  /** Le jour regardé : aujourd'hui, ou celui vers lequel on a feuilleté. */
  day() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + this.offset);
    return date;
  }

  /** « 08-30 » pour une date, format de fête du corpus. */
  static key(date) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /** Les saints fêtés ce jour-là, dans l'ordre des siècles. */
  saintsOn(date) {
    const key = DailyPanel.key(date);
    return this.atlas.saints
      .filter((saint) => saint.feast === key)
      .sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0));
  }

  /**
   * Le prochain jour pourvu, en partant du lendemain.
   *
   * Trois cent soixante-cinq essais au plus : au-delà, c'est que le corpus est
   * vide, et l'on préfère rendre `null` plutôt que tourner en rond.
   */
  nextFeast(from) {
    const date = new Date(from);
    for (let i = 0; i < 366; i += 1) {
      date.setDate(date.getDate() + 1);
      if (this.saintsOn(date).length) return { date, days: i + 1 };
    }
    return null;
  }

  /**
   * Combien de jours de l'année portent au moins une fête.
   *
   * Rien ne garantit que le corpus couvre l'année entière : la mesure est
   * comptée une fois et dit franchement où il en est, plutôt que de laisser
   * croire à un trou passager.
   */
  coverage() {
    if (this.covered == null || this.coveredFor !== this.atlas.saints.length) {
      this.covered = new Set(this.atlas.saints.map((s) => s.feast)).size;
      this.coveredFor = this.atlas.saints.length;
    }
    return this.covered;
  }

  move(days) {
    this.offset += days;
    this.render();
  }

  today() {
    this.offset = 0;
    this.render();
  }

  render() {
    const lang = getLanguage();
    const cmp = collator();
    const date = this.day();
    const list = this.saintsOn(date);
    // À égalité de siècle — les martyrs d'un même jour en ont souvent une
    // douzaine —, l'ordre alphabétique évite un classement au hasard.
    list.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0)
      || cmp.compare(this.atlas.saintName(a, lang), this.atlas.saintName(b, lang)));
    const jour = this.liturgie(date);
    const honores = jour ? this.honores(jour, date, lang) : [];
    const deja = new Set(honores.map((f) => f.id));
    // Les fiches mises à l'honneur passent en tête : le reste du jour suit.
    const reste = list.filter((s) => !deja.has(s.id));
    const next = list.length || jour ? null : this.nextFeast(date);

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('daily.title') }),

      // La date, en grand : c'est le sujet de la page, non un détail de coin.
      h('p', { class: 'daily__date', text: formatDay(date) }),
      this.offset !== 0
        ? h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: t('daily.back'),
          onclick: () => this.today(),
        })
        : null,

      h('div', { class: 'daily__nav' },
        h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          'aria-label': t('daily.prev'),
          text: `‹ ${t('daily.prev')}`,
          onclick: () => this.move(-1),
        }),
        h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          'aria-label': t('daily.next'),
          text: `${t('daily.next')} ›`,
          onclick: () => this.move(1),
        })),

      jour ? this.bandeau(jour, date, honores, lang) : null,

      jour && reste.length ? h('h3', { class: 'daily__sous-titre', text: t('daily.aussi') }) : null,
      reste.length
        ? h('p', { class: 'results__summary', 'aria-live': 'polite',
          text: reste.length === 1 ? t('daily.countOne') : t('daily.count', { n: reste.length }) })
        : jour ? null : h('p', { class: 'results__empty', text: t('daily.none') }),

      reste.length
        ? h('div', { class: 'results', role: 'list' }, ...reste.map((saint) => this.card(saint, lang)))
        : null,

      // Un jour sans fête ne doit pas être un cul-de-sac.
      next
        ? h('div', { class: 'daily__next' },
          h('p', { class: 'field__hint',
            text: t('daily.nextIs', { date: formatFeast(DailyPanel.key(next.date)) }) }),
          h('button', {
            class: 'btn',
            type: 'button',
            text: t('daily.goNext'),
            onclick: () => this.move(next.days),
          }))
        : null,

      h('p', { class: 'field__hint daily__coverage',
        text: t('daily.coverage', { n: formatNumber(this.coverage()), total: 366 }) }),
    ]);
  }

  card(saint, lang) {
    if (saint.kind === 'apparition' || saint.kind === 'miracle') {
      return h('button', { class: 'result result--emblem', type: 'button', role: 'listitem',
        onclick: () => this.onSelect(saint.id) },
      emblemSvg(saint),
      h('span', { class: 'result__name', text: this.atlas.saintName(saint, lang) }),
      h('span', { class: 'result__meta',
        text: `${this.atlas.countryName(saint.country, lang)} · ${saint.city}` }),
      saint.annee != null ? h('span', { class: 'result__dates', text: formatYear(saint.annee) }) : null);
    }
    const born = saint.born != null
      ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : '?';
    const died = saint.died != null
      ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : '?';
    return h('button', {
      class: `result result--emblem${saint.status !== 'published' ? ' result--draft' : ''}`,
      type: 'button',
      role: 'listitem',
      onclick: () => this.onSelect(saint.id),
    },
    emblemSvg(saint),
    h('span', { class: 'result__name', text: this.atlas.saintName(saint, lang) }),
    h('span', { class: 'result__meta',
      text: `${this.atlas.countryName(saint.country, lang)} · ${saint.city}` }),
    h('span', { class: 'result__dates' },
      h('span', { text: `${born} – ${died}` }),
      h('span', { class: 'result__feast', text: formatFeast(saint.feast) })),
    saint.status === PENDING
      ? h('span', { class: 'chip chip--pending', text: t('status.pending') }) : null,
    saint.status === REJECTED
      ? h('span', { class: 'chip chip--rejected', text: t('status.rejected') }) : null);
  }
}
