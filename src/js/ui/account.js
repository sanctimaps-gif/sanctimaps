import {
  ADMIN, DEFAULT_ADMIN_CODE, USER, VISITOR,
  changeAdminCode, getSession, signInAdmin, signInUser, signOut, usesDefaultCode,
} from '../auth.js';
import { t } from '../i18n.js';
import { field, fill, h } from './dom.js';

/** Choix du rôle : visiteur, utilisateur, administrateur. */
export class AccountPanel {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.name = getSession().name;
    this.code = '';
    this.message = null;
    this.root = h('div', { class: 'account' });
    this.render();
  }

  notify(kind, text) {
    this.message = { kind, text };
    this.render();
  }

  async openUser() {
    signInUser(this.name);
    this.message = null;
    this.onChange();
  }

  async openAdmin() {
    const result = await signInAdmin(this.name, this.code);
    if (!result.ok) {
      this.notify('error', t('account.badCode'));
      return;
    }
    this.code = '';
    this.message = null;
    this.onChange();
  }

  async updateCode(current, next) {
    const result = await changeAdminCode(current, next);
    if (result.ok) this.notify('ok', t('account.codeChanged'));
    else if (result.reason === 'short') this.notify('error', t('account.codeTooShort'));
    else this.notify('error', t('account.badCode'));
  }

  render() {
    const session = getSession();
    const roleLabel = t(`account.${session.role}`);

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('account.title') }),
      h('p', { class: 'field__hint', text: t('account.notice') }),
      this.message
        ? h('p', { class: `notice notice--${this.message.kind}`, text: this.message.text })
        : null,

      h('p', { class: 'account__current', text: t('account.signedAs', {
        role: roleLabel, name: session.name || t('account.anonymous'),
      }) }),

      h('ul', { class: 'rights' },
        h('li', {}, h('b', { text: `${t('account.visitor')} — ` }), t('account.visitorRights')),
        h('li', {}, h('b', { text: `${t('account.user')} — ` }), t('account.userRights')),
        h('li', {}, h('b', { text: `${t('account.admin')} — ` }), t('account.adminRights'))),

      session.role !== VISITOR
        ? h('button', {
          class: 'btn',
          type: 'button',
          text: t('account.signOut'),
          onclick: () => { signOut(); this.message = null; this.onChange(); },
        })
        : null,

      session.role === VISITOR ? field(t('account.name'), h('input', {
        class: 'control',
        type: 'text',
        value: this.name,
        placeholder: t('account.namePlaceholder'),
        oninput: (e) => { this.name = e.target.value; },
      })) : null,

      session.role === VISITOR ? h('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: t('account.signInUser'),
        onclick: () => this.openUser(),
      }) : null,

      session.role === VISITOR ? h('div', { class: 'group' },
        field(t('account.code'), h('input', {
          class: 'control',
          type: 'password',
          value: this.code,
          oninput: (e) => { this.code = e.target.value; },
        })),
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('account.signInAdmin'),
          onclick: () => this.openAdmin(),
        })) : null,

      session.role === ADMIN && usesDefaultCode()
        ? h('p', { class: 'notice notice--error',
          text: t('account.defaultCode', { code: DEFAULT_ADMIN_CODE }) })
        : null,

      session.role === ADMIN ? this.codeForm() : null,
    ]);
  }

  codeForm() {
    const current = h('input', { class: 'control', type: 'password' });
    const next = h('input', { class: 'control', type: 'password' });
    return h('div', { class: 'group' },
      h('p', { class: 'group__legend', text: t('account.changeCode') }),
      field(t('account.currentCode'), current),
      field(t('account.newCode'), next),
      h('button', {
        class: 'btn',
        type: 'button',
        text: t('account.changeCode'),
        onclick: () => this.updateCode(current.value, next.value),
      }));
  }
}

export const ROLES = { VISITOR, USER, ADMIN };
