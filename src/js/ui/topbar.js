import { formatNumber, t } from '../i18n.js';
import { h } from './dom.js';

/**
 * Fil d'Ariane, compte des saints du pays ouvert, et légende.
 *
 * ## Ce qui n'y est plus
 *
 * Trois choses encombraient le haut de la carte et en ont été retirées : la
 * consigne « Choisissez un continent », le cartouche « 4 628 saints recensés
 * dans 91 pays », et la rangée de pastilles Europe / Afrique / Asie…
 *
 * Elles disaient ou faisaient ce que la carte dit ou fait déjà mieux
 * qu'elles : on choisit un continent en le touchant, et le nombre de saints
 * se lit sur les pages d'index. Sur un téléphone, elles prenaient trois
 * bandes de la hauteur utile et recouvraient l'Atlantique nord.
 *
 * Reste le compte du pays ouvert — « 1 094 saints ici » —, qui n'est écrit
 * nulle part ailleurs et qu'on ne peut pas deviner en regardant.
 */
export class TopBar {
  constructor(host, atlas, { onWorld, onContinent }) {
    this.atlas = atlas;
    this.onWorld = onWorld;
    this.onContinent = onContinent;
    this.state = { mode: 'world', continentId: null, countryId: null };

    this.trail = h('nav', { class: 'trail', 'aria-label': 'fil d’Ariane' });
    this.hint = h('p', { class: 'hint' });
    this.legend = h('div', { class: 'legend' });

    host.append(
      h('header', { class: 'topbar' }, this.trail, this.hint),
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

    // Combien de saints dans le pays ouvert. Au monde et au continent, il n'y
    // a rien à dire que la carte ne montre : on se tait plutôt que de poser
    // une consigne sur l'Atlantique.
    if (mode === 'country') {
      const n = this.atlas.saintsIn(countryId).length;
      this.hint.textContent = n === 0 ? t('misc.noneHere')
        : n === 1 ? t('misc.saintHere') : t('misc.saintsHere', { n: formatNumber(n) });
    } else {
      this.hint.textContent = '';
    }
    this.hint.hidden = mode !== 'country';

    this.legend.replaceChildren(
      h('h2', { class: 'legend__title', text: t('legend.title') }),
      h('ul', { class: 'legend__list' },
        h('li', {}, h('i', { class: 'swatch swatch--saints' }), t('legend.withSaints')),
        h('li', {}, h('i', { class: 'swatch swatch--plain' }), t('legend.withoutSaints')),
        // La ligne « ville » n'a plus de sens sous un fond de tuiles : c'est
        // lui qui écrit les localités, et nous n'en posons plus aucune.
        h('li', { class: 'legend__city' }, h('i', { class: 'swatch swatch--city' }), t('legend.city')),
        h('li', {}, h('i', { class: 'swatch swatch--birth' }), t('legend.birthplace'))),
    );
  }
}
