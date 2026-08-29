import { can, getSession } from '../auth.js';
import { LANGUAGES, getLanguage, setLanguage, t } from '../i18n.js';
import { THEMES, getTheme, setTheme } from '../theme.js';
import { fill, h, select } from './dom.js';

/**
 * Tiroir latéral.
 *
 * Il s'ouvre sur un **sommaire** : la liste de ce qu'on peut faire, et rien
 * d'autre. On choisit une partie, et elle prend toute la place, avec un retour
 * vers le sommaire. Une rangée d'onglets aurait montré les cinq parties à la
 * fois, en n'en laissant lire aucune confortablement ; ici chaque écran ne dit
 * qu'une chose.
 *
 * Sur les petits écrans le tiroir recouvre la carte, sur les grands il la
 * borde. Dans les deux cas la carte reste maîtresse : « Retour à la carte »
 * referme le tiroir plutôt que de naviguer ailleurs.
 */

/** Une entrée du sommaire : clé, glyphe, et droit requis pour la voir. */
const ENTRIES = [
  { key: 'search', glyph: '⌕' },
  { key: 'add', glyph: '✚' },
  { key: 'moderate', glyph: '☑', right: 'moderate' },
  { key: 'assistant', glyph: '✧', right: 'moderate' },
  { key: 'account', glyph: '☖' },
  { key: 'settings', glyph: '⚙' },
];

export class Sidebar {
  constructor(host, panels) {
    this.host = host;
    this.panels = panels;
    /** `null` = le sommaire ; sinon la partie ouverte. */
    this.section = null;
    this.open = window.matchMedia('(min-width: 900px)').matches;
    this.build();
    this.sync();
  }

  entries() {
    return ENTRIES.filter((entry) => !entry.right || can(entry.right));
  }

  build() {
    this.body = h('div', { class: 'panel__body' });

    this.languageSelect = select(
      LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
      { value: getLanguage(), onchange: (e) => setLanguage(e.target.value), class: 'control' },
    );
    this.languageLabel = h('span', { class: 'field__label' });

    // Trois états plutôt que deux : « système » laisse la main au navigateur,
    // ce qui reste le bon réglage tant que le lecteur n'a rien demandé.
    this.themeSelect = select(
      THEMES.map((code) => ({ value: code, label: '' })),
      { value: getTheme(), onchange: (e) => setTheme(e.target.value), class: 'control' },
    );
    this.themeLabel = h('span', { class: 'field__label' });
    this.settings = h('div', { class: 'settings' },
      h('label', { class: 'field' }, this.languageLabel, this.languageSelect),
      h('label', { class: 'field' }, this.themeLabel, this.themeSelect));

    this.closeButton = h('button', {
      class: 'icon-btn panel__close',
      type: 'button',
      onclick: () => this.setOpen(false),
    }, h('span', { 'aria-hidden': 'true', text: '×' }));

    this.tagline = h('p', { class: 'panel__tagline' });
    this.crumb = h('div', { class: 'panel__crumb' });

    this.panel = h('aside', { class: 'panel', id: 'panel' },
      h('header', { class: 'panel__header' },
        h('div', {}, h('h1', { class: 'panel__title', text: 'SanctiMaps' }), this.tagline),
        this.closeButton),
      this.crumb,
      this.body);

    this.toggleButton = h('button', {
      class: 'icon-btn panel-toggle',
      type: 'button',
      onclick: () => this.setOpen(!this.open),
    }, h('span', { 'aria-hidden': 'true', text: '☰' }));

    this.host.append(this.panel, this.toggleButton);
  }

  setOpen(open) {
    this.open = open;
    // Refermer ramène au sommaire : rouvrir doit reposer la question « que
    // voulez-vous faire », non reprendre là où l'on en était trois clics plus tôt.
    if (!open) this.section = null;
    this.sync();
  }

  /** Ouvre une partie, en dépliant le tiroir si besoin. */
  showTab(name) {
    this.section = name;
    this.open = true;
    this.sync();
    this.body.scrollTop = 0;
  }

  /** Revient au sommaire. */
  showMenu() {
    this.section = null;
    this.sync();
  }

  showDetail(saint) {
    this.panels.detail.show(saint);
    this.section = 'detail';
    this.open = true;
    this.sync();
    this.body.scrollTop = 0;
  }

  backToSearch() {
    this.section = 'search';
    this.sync();
  }

  viewFor(name) {
    if (name === 'add') return this.panels.add.root;
    if (name === 'moderate') return this.panels.moderate.root;
    if (name === 'assistant') return this.panels.assistant.root;
    if (name === 'account') return this.panels.account.root;
    if (name === 'detail') return this.panels.detail.root;
    if (name === 'settings') return this.settings;
    return this.panels.search.root;
  }

  /** Le sommaire : une entrée par partie, plus le retour à la carte. */
  menu() {
    const pending = this.panels.atlas.pending().length;
    const rows = this.entries().map((entry) => h('button', {
      class: 'menu__item',
      type: 'button',
      dataset: { tab: entry.key },
      onclick: () => this.showTab(entry.key),
    },
    h('span', { class: 'menu__glyph', 'aria-hidden': 'true', text: entry.glyph }),
    h('span', { class: 'menu__label' },
      h('span', { class: 'menu__name', text: t(`tab.${entry.key}`) }),
      h('span', { class: 'menu__hint', text: t(`menu.${entry.key}`) })),
    entry.key === 'moderate' && pending
      ? h('span', { class: 'tab__badge', text: String(pending) })
      : null,
    h('span', { class: 'menu__chevron', 'aria-hidden': 'true', text: '›' })));

    rows.push(h('button', {
      class: 'menu__item menu__item--back',
      type: 'button',
      dataset: { tab: 'map' },
      onclick: () => this.setOpen(false),
    },
    h('span', { class: 'menu__glyph', 'aria-hidden': 'true', text: '←' }),
    h('span', { class: 'menu__label' },
      h('span', { class: 'menu__name', text: t('menu.backToMap') }))));

    return h('nav', { class: 'menu' }, ...rows);
  }

  /** Reflète l'état courant : sommaire ou partie, visibilité, textes traduits. */
  sync() {
    const names = this.entries().map((e) => e.key);
    // Un changement de rôle peut retirer sous les pieds la partie ouverte.
    if (this.section && this.section !== 'detail' && !names.includes(this.section)) {
      this.section = null;
    }

    this.panel.classList.toggle('is-open', this.open);
    this.panel.classList.toggle('is-menu', !this.section);
    this.panel.setAttribute('aria-hidden', this.open ? 'false' : 'true');
    this.toggleButton.classList.toggle('is-hidden', this.open);
    this.toggleButton.setAttribute('aria-label', t('ui.openPanel'));
    this.toggleButton.setAttribute('aria-expanded', String(this.open));
    this.closeButton.setAttribute('aria-label', t('ui.closePanel'));
    this.tagline.textContent = t('app.tagline');
    this.languageLabel.textContent = t('ui.language');
    this.languageSelect.value = getLanguage();
    this.themeLabel.textContent = t('theme.label');
    for (const option of this.themeSelect.options) option.textContent = t(`theme.${option.value}`);
    this.themeSelect.value = getTheme();
    this.panel.dataset.role = getSession().role;

    // Le fil de retour ne s'affiche que dans une partie : au sommaire, il n'y
    // a nulle part où remonter.
    if (this.section) {
      const key = this.section === 'detail' ? 'search' : this.section;
      fill(this.crumb, [h('button', {
        class: 'panel__back',
        type: 'button',
        onclick: () => this.showMenu(),
      }, h('span', { 'aria-hidden': 'true', text: '‹' }), h('span', { text: t('menu.title') })),
      h('span', { class: 'panel__where', text: t(`tab.${key}`) })]);
    } else {
      fill(this.crumb, []);
    }

    // Le sommaire se reconstruit à chaque fois (le compteur de propositions
    // bouge) ; une partie déjà en place ne se remplace pas, sous peine de
    // perdre le défilement et le champ où l'on écrivait.
    const view = this.section ? this.viewFor(this.section) : this.menu();
    if (this.section ? this.body.firstChild !== view : true) this.body.replaceChildren(view);
  }

  /** Reconstruit tout le contenu traduit après un changement de langue. */
  retranslate() {
    this.panels.search.render();
    this.panels.add.render();
    this.panels.detail.render();
    this.panels.moderate.render();
    this.panels.assistant.render();
    this.panels.account.render();
    fill(this.languageSelect, LANGUAGES.map((l) => h('option', {
      value: l.code, text: l.label, selected: l.code === getLanguage(),
    })));
    this.sync();
  }
}
