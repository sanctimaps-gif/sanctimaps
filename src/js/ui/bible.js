import { t } from '../i18n.js';
import { h, fill } from './dom.js';

/**
 * La Bible et la messe du jour : le site « Bible » (texte de l'AELF), incrusté.
 *
 * C'est un site à part, publié sur GitHub Pages ; on l'affiche tel quel dans
 * un cadre, ouvert sur les lectures du jour. Le cadre n'est chargé qu'à la
 * première ouverture : le site ne pèse rien tant qu'on ne le regarde pas.
 */
export const BIBLE_URL = 'https://sanctimaps-gif.github.io/Bible/#messe';

export class BiblePanel {
  constructor() {
    this.root = h('div', { class: 'bible' });
    this.render();
  }

  /** Charge le site au premier affichage. */
  show() {
    if (this.frame && !this.frame.src) this.frame.src = BIBLE_URL;
  }

  render() {
    this.frame ||= h('iframe', {
      class: 'bible__cadre', loading: 'lazy', referrerpolicy: 'no-referrer',
      allow: 'clipboard-write; fullscreen', title: t('bible.titre'),
    });
    this.frame.title = t('bible.titre');
    fill(this.root, [
      this.frame,
      h('a', { class: 'bible__lien', href: BIBLE_URL, target: '_blank', rel: 'noopener', text: `${t('bible.ouvrir')} ↗` }),
    ]);
  }
}
