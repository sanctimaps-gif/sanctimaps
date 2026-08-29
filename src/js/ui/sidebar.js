import { can, getSession } from '../auth.js';
import { LANGUAGES, getLanguage, setLanguage, t } from '../i18n.js';
import { fill, h, select } from './dom.js';

/**
 * Panneau latéral : recherche, ajout, fiche, et — pour l'administrateur — la
 * file de modération et l'assistant. Il se superpose à la carte sur les petits
 * écrans et la borde sur les grands.
 */
export class Sidebar {
  constructor(host, panels) {
    this.host = host;
    this.panels = panels;
    this.tab = 'search';
    this.open = window.matchMedia('(min-width: 900px)').matches;
    this.build();
    this.sync();
  }

  /** Onglets visibles : les deux derniers n'existent que pour l'administrateur. */
  tabNames() {
    return can('moderate')
      ? ['search', 'add', 'moderate', 'assistant', 'account']
      : ['search', 'add', 'account'];
  }

  build() {
    this.body = h('div', { class: 'panel__body' });
    this.tabBar = h('div', { class: 'panel__tabs', role: 'tablist' });

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

    this.tagline = h('p', { class: 'panel__tagline' });

    this.panel = h('aside', { class: 'panel', id: 'panel' },
      h('header', { class: 'panel__header' },
        h('div', {}, h('h1', { class: 'panel__title', text: 'SanctiMaps' }), this.tagline),
        this.closeButton),
      this.tabBar,
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
    this.panels.detail.show(saint);
    this.tab = 'detail';
    this.setOpen(true);
    this.body.scrollTop = 0;
  }

  backToSearch() {
    this.tab = 'search';
    this.sync();
  }

  viewFor(name) {
    if (name === 'add') return this.panels.add.root;
    if (name === 'moderate') return this.panels.moderate.root;
    if (name === 'assistant') return this.panels.assistant.root;
    if (name === 'account') return this.panels.account.root;
    if (name === 'detail') return this.panels.detail.root;
    return this.panels.search.root;
  }

  /** Reflète l'état courant : onglets, visibilité, textes traduits. */
  sync() {
    const names = this.tabNames();
    if (this.tab !== 'detail' && !names.includes(this.tab)) this.tab = 'search';

    const pending = this.panels.atlas.pending().length;
    fill(this.tabBar, names.map((name) => {
      const active = name === this.tab;
      const badge = name === 'moderate' && pending
        ? h('span', { class: 'tab__badge', text: String(pending) })
        : null;
      return h('button', {
        class: `tab${active ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(active),
        dataset: { tab: name },
        onclick: () => this.showTab(name),
      }, h('span', { text: t(`tab.${name}`) }), badge);
    }));

    this.panel.classList.toggle('is-open', this.open);
    this.panel.setAttribute('aria-hidden', this.open ? 'false' : 'true');
    this.toggleButton.classList.toggle('is-hidden', this.open);
    this.toggleButton.setAttribute('aria-label', t('ui.openPanel'));
    this.toggleButton.setAttribute('aria-expanded', String(this.open));
    this.closeButton.setAttribute('aria-label', t('ui.closePanel'));
    this.tagline.textContent = t('app.tagline');
    this.languageLabel.textContent = t('ui.language');
    this.languageSelect.value = getLanguage();
    this.panel.dataset.role = getSession().role;

    const view = this.viewFor(this.tab);
    if (this.body.firstChild !== view) this.body.replaceChildren(view);
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
