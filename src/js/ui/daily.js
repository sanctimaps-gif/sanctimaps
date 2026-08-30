import { PENDING, REJECTED } from '../data.js';
import {
  collator, formatDay, formatFeast, formatNumber, formatYear, getLanguage, t,
} from '../i18n.js';
import { fill, h } from './dom.js';

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
    const next = list.length ? null : this.nextFeast(date);

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

      list.length
        ? h('p', { class: 'results__summary', 'aria-live': 'polite',
          text: list.length === 1 ? t('daily.countOne') : t('daily.count', { n: list.length }) })
        : h('p', { class: 'results__empty', text: t('daily.none') }),

      list.length
        ? h('div', { class: 'results', role: 'list' }, ...list.map((saint) => this.card(saint, lang)))
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
    const born = saint.born != null ? formatYear(saint.born, { circa: saint.circa }) : '?';
    const died = saint.died != null ? formatYear(saint.died) : '?';
    return h('button', {
      class: `result${saint.status !== 'published' ? ' result--draft' : ''}`,
      type: 'button',
      role: 'listitem',
      onclick: () => this.onSelect(saint.id),
    },
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
