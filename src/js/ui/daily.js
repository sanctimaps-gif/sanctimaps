import { PENDING, REJECTED } from '../data.js';
import {
  collator, formatDay, formatFeast, formatNumber, formatYear, getLanguage, t,
} from '../i18n.js';
import { fill, h } from './dom.js';
import { emblemSvg } from '../emblems.js';
import {
  aelf, celebrationDe, chargerAelf, honores, isoLocal, liturgieDu, lireJour,
} from '../liturgie.js';

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
    return liturgieDu(date);
  }

  /** Les fiches que la célébration du jour met à l'honneur. */
  honores(jour, date) {
    return honores({
      saints: this.atlas.saints, apparitions: this.atlas.apparitions, celebrations: aelf?.celebrations,
    }, jour, date);
  }

  /** La page d'une célébration sans fiche : son texte, ses sources, ses liens. */
  pageVue(lang) {
    const { page, jour, date } = this.pageOuverte;
    const { degre } = lireJour(jour);
    const lies = (page.lies || []).map((id) => this.atlas.pointById?.(id)).filter(Boolean);
    return [
      h('button', { class: 'btn btn--ghost daily__retour', type: 'button', text: `← ${t('daily.retour')}`,
        onclick: () => { this.pageOuverte = null; this.render(); } }),
      h('article', { class: 'daily__page' },
        h('p', { class: 'daily__liturgie-titre', text: [formatDay(date), degre].filter(Boolean).join(' · ') }),
        h('h2', { class: 'daily__page-titre', text: page.titre }),
        ...page.texte.map((p) => h('p', { class: 'daily__page-texte', text: p })),
        lies.length ? h('p', { class: 'daily__sous-titre', text: t('daily.aLire') }) : null,
        lies.length ? h('div', { class: 'results', role: 'list' }, ...lies.map((f) => this.card(f, lang))) : null,
        page.sources?.length ? h('p', { class: 'daily__sous-titre', text: t('daily.sources') }) : null,
        page.sources?.length ? h('ul', { class: 'daily__sources' }, ...page.sources.map((src) => h('li', {},
          h('a', { href: src.url, target: '_blank', rel: 'noopener', text: src.titre })))) : null),
    ];
  }

  /** Le bandeau de la célébration : son nom, son degré, sa couleur, la source. */
  bandeau(jour, date, honores, lang) {
    const { titre: intitule, degre } = lireJour(jour);
    const couleur = (jour.couleur || '').toLowerCase();
    const meta = [degre, jour.couleur, intitule.includes(jour.semaine || '\u0000') ? null : jour.semaine]
      .filter(Boolean).join(' · ');
    const zone = aelf?.zone === 'france' || !aelf?.zone ? 'romain' : aelf.zone;
    // Une célébration sans fiche a sa page, qui ne se rattache à aucun lieu.
    const page = celebrationDe(jour)?.page;
    return h('section', { class: 'daily__liturgie' },
      h('p', { class: 'daily__liturgie-titre' },
        COULEURS[couleur] ? h('span', { class: 'daily__couleur', style: `background:${COULEURS[couleur]}`, 'aria-hidden': 'true' }) : null,
        h('span', { text: t('daily.liturgie') })),
      h('p', { class: 'daily__fete', text: intitule }),
      meta ? h('p', { class: 'field__hint', text: meta }) : null,
      page ? h('button', { class: 'result daily__page-lien', type: 'button',
        onclick: () => { this.pageOuverte = { page, jour, date }; this.render(); } },
      h('span', { class: 'daily__page-glyphe', 'aria-hidden': 'true', text: '❦' }),
      h('span', { class: 'result__name', text: page.titre }),
      h('span', { class: 'result__meta', text: `${t('daily.lirePage')} ›` })) : null,
      honores.length
        ? h('div', {},
          h('p', { class: 'daily__sous-titre', text: page ? t('daily.aLire') : t('daily.honneur') }),
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
    this.pageOuverte = null;
    this.offset += days;
    this.render();
  }

  today() {
    this.pageOuverte = null;
    this.offset = 0;
    this.render();
  }

  render() {
    if (this.pageOuverte) {
      fill(this.root, this.pageVue(getLanguage()));
      return;
    }
    const lang = getLanguage();
    const cmp = collator();
    const date = this.day();
    const list = this.saintsOn(date);
    // À égalité de siècle — les martyrs d'un même jour en ont souvent une
    // douzaine —, l'ordre alphabétique évite un classement au hasard.
    list.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0)
      || cmp.compare(this.atlas.saintName(a, lang), this.atlas.saintName(b, lang)));
    const jour = this.liturgie(date);
    const honores = jour ? this.honores(jour, date) : [];
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
