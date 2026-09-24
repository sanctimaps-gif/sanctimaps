import { getLanguage, t } from '../i18n.js';
import { h } from './dom.js';

/**
 * La fiche du saint ouvert, dans la moitié du bas.
 *
 * ## Pourquoi elle n'est plus dans le tiroir
 *
 * Elle y était, et le tiroir recouvre la carte sur un téléphone : ouvrir un
 * saint faisait disparaître le pays et ses quarante-huit croix derrière un
 * panneau de neuf dixièmes d'écran. Rien n'avait été retiré — mais on ne
 * voyait plus rien, ce qui revient au même pour qui regarde.
 *
 * La fiche occupe donc une bande au bas de l'écran, la carte garde les deux
 * moitié du haut, et l'on lit la biographie en voyant toujours où le saint est
 * né et qui l'entoure. La carte se recadre d'elle-même : son hôte a rétréci,
 * et le `ResizeObserver` de la vue s'en charge.
 *
 * ## Ce qu'elle porte elle-même
 *
 * Le nom et le bouton de fermeture, et rien d'autre : tout le reste est la
 * fiche ordinaire, celle-là même qui s'affichait dans le tiroir, posée telle
 * quelle dans la partie qui défile. Le nom est dans l'en-tête plutôt que dans
 * le corps pour qu'il reste lisible quand on fait défiler la biographie — un
 * demi-écran ne montre pas toujours trois cents mots d'un coup.
 */
export class FicheBar {
  constructor(host, detail, { onClose, onName } = {}) {
    this.host = host;
    this.detail = detail;
    this.onClose = onClose;
    /** Comment nommer le saint ; l'atlas sait le faire dans la langue courante. */
    this.onName = onName || ((saint) => saint.name?.fr || saint.name || '');
    this.saint = null;

    this.title = h('h2', { class: 'fiche__name' });
    this.closeButton = h('button', {
      class: 'icon-btn fiche__close',
      type: 'button',
      onclick: () => this.close(),
    }, h('span', { 'aria-hidden': 'true', text: '×' }));

    this.body = h('div', { class: 'fiche__body' }, this.detail.root);
    this.host.append(
      h('header', { class: 'fiche__head' }, this.title, this.closeButton),
      this.body,
    );
    this.host.setAttribute('aria-label', t('tab.detail'));
    this.retranslate();
  }

  get open() {
    return !this.host.hidden;
  }

  show(saint) {
    this.saint = saint;
    this.detail.show(saint);
    this.title.textContent = this.onName(saint, getLanguage());
    this.host.hidden = false;
    // Une fiche ouverte sur un autre saint doit se lire depuis son début.
    this.body.scrollTop = 0;
  }

  /** Reprend le nom après une modification ou un changement de langue. */
  refresh() {
    if (this.saint) this.title.textContent = this.onName(this.saint, getLanguage());
  }

  close() {
    if (!this.open) return;
    this.host.hidden = true;
    this.saint = null;
    this.detail.show(null);
    if (this.onClose) this.onClose();
  }

  retranslate() {
    this.closeButton.setAttribute('aria-label', t('ui.closePanel'));
    this.host.setAttribute('aria-label', t('tab.detail'));
    this.refresh();
  }
}
