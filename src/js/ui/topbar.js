import { formatNumber, t } from '../i18n.js';
import { h } from './dom.js';

/** Fil d'Ariane, indice de navigation, sélecteur de continent et légende. */
export class TopBar {
  constructor(host, atlas, { onWorld, onContinent }) {
    this.atlas = atlas;
    this.onWorld = onWorld;
    this.onContinent = onContinent;
    this.state = { mode: 'world', continentId: null, countryId: null };

    this.trail = h('nav', { class: 'trail', 'aria-label': 'fil d’Ariane' });
    this.hint = h('p', { class: 'hint' });
    this.chips = h('div', { class: 'continents' });
    this.tally = h('p', { class: 'tally' });
    this.legend = h('div', { class: 'legend' });

    host.append(
      h('header', { class: 'topbar' }, this.trail, this.hint, this.tally, this.chips),
      this.legend,
    );
    this.render();
  }

  set(state) {
    Object.assign(this.state, state);
    this.render();
  }

  render() {
    const { mode, continentId, countryId } = this.state;
    const lang = document.documentElement.lang || 'fr';

    const crumbs = [h('button', {
      class: `crumb${mode === 'world' ? ' is-current' : ''}`,
      type: 'button',
      text: t('nav.world'),
      onclick: () => this.onWorld(),
    })];
    if (continentId) {
      crumbs.push(h('span', { class: 'crumb__sep', 'aria-hidden': 'true', text: '›' }));
      crumbs.push(h('button', {
        class: `crumb${mode === 'continent' ? ' is-current' : ''}`,
        type: 'button',
        text: t(`continent.${continentId}`),
        onclick: () => this.onContinent(continentId),
      }));
    }
    if (countryId) {
      crumbs.push(h('span', { class: 'crumb__sep', 'aria-hidden': 'true', text: '›' }));
      crumbs.push(h('span', { class: 'crumb is-current',
        text: this.atlas.countryName(countryId, lang) }));
    }
    this.trail.replaceChildren(...crumbs);

    if (mode === 'country') {
      const n = this.atlas.saintsIn(countryId).length;
      this.hint.textContent = n === 0 ? t('misc.noneHere')
        : n === 1 ? t('misc.saintHere') : t('misc.saintsHere', { n: formatNumber(n) });
    } else {
      this.hint.textContent = mode === 'world' ? t('nav.hintWorld') : t('nav.hintContinent');
    }

    // Compteur d'ensemble, à la manière d'un cartouche de carte : il dit d'un
    // coup d'œil ce que le corpus couvre, avant même d'avoir cliqué.
    const total = this.atlas.saints.length;
    const countries = new Set(this.atlas.saints.map((s) => s.country)).size;
    this.tally.textContent = t('misc.counted', {
      n: formatNumber(total), c: formatNumber(countries),
    });
    this.tally.hidden = mode !== 'world';

    this.chips.replaceChildren(...this.atlas.continents.map((continent) => h('button', {
      class: `chip chip--action${continent.id === continentId ? ' is-active' : ''}`,
      type: 'button',
      text: t(`continent.${continent.id}`),
      onclick: () => this.onContinent(continent.id),
    })));

    this.legend.replaceChildren(
      h('h2', { class: 'legend__title', text: t('legend.title') }),
      h('ul', { class: 'legend__list' },
        h('li', {}, h('i', { class: 'swatch swatch--saints' }), t('legend.withSaints')),
        h('li', {}, h('i', { class: 'swatch swatch--plain' }), t('legend.withoutSaints')),
        h('li', {}, h('i', { class: 'swatch swatch--city' }), t('legend.city')),
        h('li', {}, h('i', { class: 'swatch swatch--birth' }), t('legend.birthplace'))),
    );
  }
}
