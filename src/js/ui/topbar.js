import { formatNumber, t } from '../i18n.js';
import { h } from './dom.js';

/**
 * Fil d'Ariane, bascule des corpus, compte du pays ouvert, et légende.
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
 *
 * ## La bascule
 *
 * Deux boutons collés, « Saints » et « Apparitions » : la carte ne montre
 * jamais les deux en même temps, et rien ne serait plus illisible qu'un
 * planisphère où une croix voudrait dire deux choses. Le second corpus est vide
 * pour l'instant, et cela se dit en clair sous la bascule plutôt que de laisser
 * chercher des repères qui n'existent pas.
 */
export class TopBar {
  constructor(host, atlas, { onWorld, onContinent, onCorpus }) {
    this.atlas = atlas;
    this.onWorld = onWorld;
    this.onContinent = onContinent;
    this.onCorpus = onCorpus;
    this.state = { mode: 'world', continentId: null, countryId: null };

    this.trail = h('nav', { class: 'trail', 'aria-label': 'fil d’Ariane' });
    this.corpus = h('div', { class: 'corpus', role: 'group' });
    this.hint = h('p', { class: 'hint' });
    // L'avis du corpus vide : posé sur sa propre ligne, sous la bascule, et
    // annoncé au lecteur d'écran puisqu'il paraît après un geste.
    this.avis = h('p', { class: 'avis', role: 'status', 'aria-live': 'polite' });
    this.legend = h('div', { class: 'legend' });

    host.append(
      h('header', { class: 'topbar' }, this.trail, this.corpus, this.hint, this.avis),
      this.legend,
    );
    this.render();
  }

  set(state) {
    Object.assign(this.state, state);
    this.render();
  }

  /** Un des deux boutons de la bascule. */
  bouton(nom, libelle) {
    const courant = this.atlas.corpus === nom;
    return h('button', {
      class: `corpus__btn${courant ? ' is-current' : ''}`,
      type: 'button',
      // Deux boutons qui se répondent : `aria-pressed` dit lequel est enfoncé,
      // ce qu'une classe de style ne dit qu'à l'œil.
      'aria-pressed': courant ? 'true' : 'false',
      text: libelle,
      onclick: () => { if (!courant) this.onCorpus?.(nom); },
    });
  }

  render() {
    const { mode, continentId, countryId } = this.state;
    const lang = document.documentElement.lang || 'fr';
    const apparitions = this.atlas.corpus === 'apparitions';

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

    this.corpus.setAttribute('aria-label', t('corpus.label'));
    this.corpus.replaceChildren(
      this.bouton('saints', t('corpus.saints')),
      this.bouton('apparitions', t('corpus.apparitions')),
    );

    // Un corpus vide se dit, et ne se devine pas : une carte sans un seul
    // repère ressemble trop à une carte en panne.
    const vide = apparitions && this.atlas.apparitions.length === 0;
    this.avis.textContent = vide ? t('corpus.none') : '';
    this.avis.hidden = !vide;

    // Combien de repères dans le pays ouvert. Au monde et au continent, il n'y
    // a rien à dire que la carte ne montre : on se tait plutôt que de poser
    // une consigne sur l'Atlantique.
    if (mode === 'country' && !vide) {
      const n = this.atlas.pointsIn(countryId).length;
      const cles = apparitions
        ? ['misc.noApparitionHere', 'misc.apparitionHere', 'misc.apparitionsHere']
        : ['misc.noneHere', 'misc.saintHere', 'misc.saintsHere'];
      this.hint.textContent = n === 0 ? t(cles[0])
        : n === 1 ? t(cles[1]) : t(cles[2], { n: formatNumber(n) });
    } else {
      this.hint.textContent = '';
    }
    this.hint.hidden = !this.hint.textContent;

    this.legend.replaceChildren(
      h('h2', { class: 'legend__title', text: t('legend.title') }),
      h('ul', { class: 'legend__list' },
        h('li', {}, h('i', { class: 'swatch swatch--saints' }),
          t(apparitions ? 'legend.withApparitions' : 'legend.withSaints')),
        h('li', {}, h('i', { class: 'swatch swatch--plain' }),
          t(apparitions ? 'legend.withoutApparitions' : 'legend.withoutSaints')),
        // La ligne « ville » n'a plus de sens sous un fond de tuiles : c'est
        // lui qui écrit les localités, et nous n'en posons plus aucune.
        h('li', { class: 'legend__city' }, h('i', { class: 'swatch swatch--city' }), t('legend.city')),
        h('li', {}, h('i', { class: `swatch swatch--${apparitions ? 'apparition' : 'birth'}` }),
          t(apparitions ? 'legend.apparition' : 'legend.birthplace'))),
    );
  }
}
