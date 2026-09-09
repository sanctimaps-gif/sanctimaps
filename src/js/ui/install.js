import {
  cheminInstallation, estInstallee, installer, onInstallChange,
} from '../install.js';
import { t } from '../i18n.js';
import { fill, h } from './dom.js';

/**
 * « Ajouter à l'écran d'accueil », dans les réglages.
 *
 * Quatre écrans possibles pour un seul réglage, parce que les navigateurs ne
 * proposent pas la même chose :
 *
 * - déjà installée : on le dit, et l'on n'offre rien ;
 * - le navigateur a proposé : un bouton, qui installe pour de bon ;
 * - Safari, iPhone, Firefox : la marche à suivre, en une phrase — leur
 *   installation passe par un menu du navigateur, qu'aucun code ne peut
 *   ouvrir ;
 * - rien de tout cela : on explique que le navigateur ne le propose pas,
 *   plutôt que d'afficher un bouton mort.
 *
 * Le navigateur peut proposer l'installation à tout moment — au bout de
 * quelques secondes, ou d'une seconde visite. La partie se redessine donc
 * quand l'état change, même si elle est déjà à l'écran.
 */
export class InstallPanel {
  constructor() {
    this.root = h('div', { class: 'install' });
    this.message = '';
    this.render();
    this.stop = onInstallChange(() => this.render());
  }

  async lancer() {
    const reponse = await installer();
    // « Acceptée » ne s'affiche pas : la fenêtre disparaît et l'icône paraît
    // sur l'écran d'accueil, ce qui se voit mieux qu'une phrase.
    this.message = reponse === 'refusee' ? t('install.dismissed')
      : (reponse === 'indisponible' ? t('install.unavailable') : '');
    this.render();
  }

  render() {
    const chemin = cheminInstallation();

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('install.title') }),

      chemin === 'installee'
        ? h('p', { class: 'notice notice--mine', text: t('install.already') })
        : h('p', { class: 'field__hint', text: t('install.intro') }),

      chemin === 'bouton'
        ? h('button', {
          class: 'btn btn--primary',
          type: 'button',
          text: t('install.button'),
          onclick: () => this.lancer(),
        })
        : null,

      // La marche à suivre, quand c'est un menu du navigateur qui l'ouvre.
      chemin === 'ios' ? h('p', { class: 'field__hint', text: t('install.ios') }) : null,
      chemin === 'safari' ? h('p', { class: 'field__hint', text: t('install.safari') }) : null,
      chemin === 'firefox' ? h('p', { class: 'field__hint', text: t('install.firefox') }) : null,
      chemin === 'aucun' ? h('p', { class: 'field__hint', text: t('install.none') }) : null,

      chemin !== 'installee'
        ? h('p', { class: 'field__hint', text: t('install.what') })
        : null,

      this.message ? h('p', { class: 'notice notice--pending', text: this.message }) : null,
    ]);
  }

  /** Redessine après un changement de langue. */
  retranslate() {
    this.render();
  }
}

export { estInstallee };
