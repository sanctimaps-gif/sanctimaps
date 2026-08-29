import { ERAS, eraOf, fold } from '../data.js';
import { collator, formatFeast, formatYear, getLanguage, monthNames, t } from '../i18n.js';
import { field, h, select } from './dom.js';

const EMPTY = { query: '', era: '', country: '', month: '', day: '', sort: 'name' };

/** Formulaire de recherche et liste des résultats. */
export class SearchPanel {
  constructor(atlas, { onSelect }) {
    this.atlas = atlas;
    this.onSelect = onSelect;
    this.filters = { ...EMPTY };
    this.root = h('div', { class: 'search' });
    this.render();
  }

  reset() {
    this.filters = { ...EMPTY };
    this.render();
  }

  /** Pré-remplit le filtre pays, quand la carte ouvre un pays. */
  focusCountry(countryId) {
    this.filters = { ...EMPTY, country: countryId };
    this.render();
  }

  update(patch) {
    Object.assign(this.filters, patch);
    this.renderResults();
  }

  render() {
    const lang = getLanguage();
    const cmp = collator();
    const countries = [...this.atlas.byCountry.keys()]
      .map((id) => ({ value: id, label: this.atlas.countryName(id, lang) }))
      .sort((a, b) => cmp.compare(a.label, b.label));
    const months = monthNames().map((label, i) => ({ value: String(i + 1), label }));

    this.results = h('div', { class: 'results', role: 'list' });
    this.summary = h('p', { class: 'results__summary', 'aria-live': 'polite' });

    this.root.replaceChildren(
      h('div', { class: 'filters' },
        field(t('search.name'), h('input', {
          class: 'control',
          type: 'search',
          value: this.filters.query,
          placeholder: t('search.namePlaceholder'),
          oninput: (e) => this.update({ query: e.target.value }),
        })),
        field(t('search.era'), select(
          [{ value: '', label: t('search.any') },
            ...ERAS.map((era) => ({ value: era.id, label: t(`era.${era.id}`) }))],
          { value: this.filters.era, onchange: (e) => this.update({ era: e.target.value }) },
        )),
        field(t('search.country'), select(
          [{ value: '', label: t('search.any') }, ...countries],
          { value: this.filters.country, onchange: (e) => this.update({ country: e.target.value }) },
        )),
        h('div', { class: 'filters__row' },
          field(t('search.feastMonth'), select(
            [{ value: '', label: t('search.any') }, ...months],
            { value: this.filters.month, onchange: (e) => this.update({ month: e.target.value }) },
          )),
          field(t('search.feastDay'), h('input', {
            class: 'control',
            type: 'number',
            min: '1',
            max: '31',
            value: this.filters.day,
            oninput: (e) => this.update({ day: e.target.value }),
          }))),
        h('div', { class: 'filters__row' },
          field(t('search.sort'), select(
            [{ value: 'name', label: t('sort.name') },
              { value: 'chrono', label: t('sort.chrono') },
              { value: 'feast', label: t('sort.feast') }],
            { value: this.filters.sort, onchange: (e) => this.update({ sort: e.target.value }) },
          )),
          h('button', {
            class: 'btn btn--ghost filters__reset',
            type: 'button',
            text: t('search.reset'),
            onclick: () => this.reset(),
          }))),
      this.summary,
      this.results,
    );
    this.renderResults();
  }

  matches() {
    const { query, era, country, month, day } = this.filters;
    const lang = getLanguage();
    const needle = fold(query.trim());
    const monthNum = month ? Number(month) : null;
    const dayNum = day ? Number(day) : null;

    return this.atlas.saints.filter((saint) => {
      if (country && saint.country !== country) return false;
      if (era && eraOf(saint) !== era) return false;
      if (monthNum || dayNum) {
        const [m, d] = String(saint.feast || '').split('-').map(Number);
        if (monthNum && m !== monthNum) return false;
        if (dayNum && d !== dayNum) return false;
      }
      if (needle && !this.atlas.searchIndex(saint, lang).includes(needle)) return false;
      return true;
    });
  }

  renderResults() {
    const lang = getLanguage();
    const cmp = collator();
    const list = this.matches();

    if (this.filters.sort === 'chrono') {
      list.sort((a, b) => (a.born ?? a.died ?? 0) - (b.born ?? b.died ?? 0));
    } else if (this.filters.sort === 'feast') {
      list.sort((a, b) => String(a.feast).localeCompare(String(b.feast)));
    } else {
      list.sort((a, b) => cmp.compare(
        this.atlas.saintName(a, lang), this.atlas.saintName(b, lang),
      ));
    }

    this.summary.textContent = list.length === 1
      ? t('search.resultsOne')
      : t('search.results', { n: list.length });

    if (!list.length) {
      this.results.replaceChildren(h('p', { class: 'results__empty', text: t('search.none') }));
      return;
    }

    this.results.replaceChildren(...list.map((saint) => {
      const era = eraOf(saint);
      return h('button', {
        class: `result${saint.user ? ' result--user' : ''}`,
        type: 'button',
        role: 'listitem',
        onclick: () => this.onSelect(saint.id),
      },
      h('span', { class: 'result__name', text: this.atlas.saintName(saint, lang) }),
      h('span', { class: 'result__meta',
        text: `${this.atlas.countryName(saint.country, lang)} · ${saint.city}` }),
      h('span', { class: 'result__dates' },
        h('span', { text: this.lifespan(saint) }),
        h('span', { class: 'result__feast', text: formatFeast(saint.feast) })),
      era ? h('span', { class: 'chip chip--era', text: t(`era.${era}`) }) : null);
    }));
  }

  lifespan(saint) {
    const born = saint.born != null ? formatYear(saint.born, { circa: saint.circa }) : '?';
    const died = saint.died != null ? formatYear(saint.died) : '?';
    return `${born} – ${died}`;
  }
}
