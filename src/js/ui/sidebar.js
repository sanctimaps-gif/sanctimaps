import { LANGUAGES, getLanguage, setLanguage, t } from '../i18n.js';
import { h, select } from './dom.js';

/**
 * Panneau latéral : recherche, ajout et fiche détaillée.
 * Il se superpose à la carte sur les petits écrans et la borde sur les grands.
 */
export class Sidebar {
  constructor(host, { searchPanel, addPanel, detailPanel }) {
    this.host = host;
    this.searchPanel = searchPanel;
    this.addPanel = addPanel;
    this.detailPanel = detailPanel;
    this.tab = 'search';
    this.open = window.matchMedia('(min-width: 900px)').matches;
    this.build();
    this.sync();
  }

  build() {
    this.body = h('div', { class: 'panel__body' });

    this.tabs = ['search', 'add'].map((name) => h('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      dataset: { tab: name },
      onclick: () => this.showTab(name),
    }));

    this.languageSelect = select(
      LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
      { value: getLanguage(), onchange: (e) => setLanguage(e.target.value), class: 'control' },
    );
    this.languageLabel = h('span', { class: 'field__label' });

    this.closeButton = h('button', {
      class: 'icon-btn panel__close',
      type: 'button',
      onclick: () => this.setOpen(false),
    }, h('span', { 'aria-hidden': 'true', text: '×' }));

    this.title = h('h1', { class: 'panel__title', text: 'SanctiMaps' });
    this.tagline = h('p', { class: 'panel__tagline' });

    this.panel = h('aside', { class: 'panel', id: 'panel' },
      h('header', { class: 'panel__header' },
        h('div', {}, this.title, this.tagline),
        this.closeButton),
      h('div', { class: 'panel__tabs', role: 'tablist' }, ...this.tabs),
      this.body,
      h('footer', { class: 'panel__footer' },
        h('label', { class: 'field field--inline' }, this.languageLabel, this.languageSelect)));

    this.toggleButton = h('button', {
      class: 'icon-btn panel-toggle',
      type: 'button',
      onclick: () => this.setOpen(!this.open),
    }, h('span', { 'aria-hidden': 'true', text: '☰' }));

    this.host.append(this.panel, this.toggleButton);
  }

  setOpen(open) {
    this.open = open;
    this.sync();
  }

  showTab(name) {
    this.tab = name;
    this.sync();
  }

  showDetail(saint) {
    this.detailPanel.show(saint);
    this.tab = 'detail';
    this.setOpen(true);
    this.body.scrollTop = 0;
  }

  backToSearch() {
    this.tab = 'search';
    this.sync();
  }

  /** Reflète l'état courant : onglet actif, visibilité, textes traduits. */
  sync() {
    this.panel.classList.toggle('is-open', this.open);
    this.panel.setAttribute('aria-hidden', this.open ? 'false' : 'true');
    this.toggleButton.classList.toggle('is-hidden', this.open);
    this.toggleButton.setAttribute('aria-label', t('ui.openPanel'));
    this.toggleButton.setAttribute('aria-expanded', String(this.open));
    this.closeButton.setAttribute('aria-label', t('ui.closePanel'));
    this.tagline.textContent = t('app.tagline');
    this.languageLabel.textContent = t('ui.language');
    this.languageSelect.value = getLanguage();

    for (const tab of this.tabs) {
      const active = tab.dataset.tab === this.tab;
      tab.textContent = t(`tab.${tab.dataset.tab}`);
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }

    const view = this.tab === 'add' ? this.addPanel.root
      : this.tab === 'detail' ? this.detailPanel.root
        : this.searchPanel.root;
    if (this.body.firstChild !== view) this.body.replaceChildren(view);
  }

  /** Reconstruit tout le contenu traduit après un changement de langue. */
  retranslate() {
    this.searchPanel.render();
    this.addPanel.render();
    this.detailPanel.render();
    this.languageSelect.replaceChildren(...LANGUAGES.map((l) => h('option', {
      value: l.code, label: l.label, text: l.label, selected: l.code === getLanguage(),
    })));
    this.sync();
  }
}
