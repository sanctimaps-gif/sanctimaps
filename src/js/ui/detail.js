import { eraOf } from '../data.js';
import { formatFeast, formatYear, getLanguage, t, titleLabel } from '../i18n.js';
import { fill, h } from './dom.js';

function row(label, value) {
  if (!value) return null;
  return h('div', { class: 'sheet__row' },
    h('dt', { class: 'sheet__key', text: label }),
    h('dd', { class: 'sheet__value', text: value }));
}

/** Fiche détaillée d'un saint. */
export class DetailPanel {
  constructor(atlas, { onBack, onLocate, onRemove }) {
    this.atlas = atlas;
    this.onBack = onBack;
    this.onLocate = onLocate;
    this.onRemove = onRemove;
    this.saint = null;
    this.root = h('div', { class: 'detail' });
  }

  show(saint) {
    this.saint = saint;
    this.render();
  }

  render() {
    const saint = this.saint;
    if (!saint) {
      this.root.replaceChildren();
      return;
    }
    const lang = getLanguage();
    const era = eraOf(saint);
    const description = typeof saint.desc === 'string'
      ? saint.desc
      : saint.desc?.[lang] || saint.desc?.fr || saint.desc?.en || '';

    const otherNames = typeof saint.name === 'object'
      ? Object.entries(saint.name)
        .filter(([code, value]) => code !== lang && value)
        .map(([code, value]) => `${value} (${code})`)
        .join(' · ')
      : '';

    fill(this.root, [
      h('button', {
        class: 'btn btn--ghost detail__back',
        type: 'button',
        text: `← ${t('detail.back')}`,
        onclick: () => this.onBack(),
      }),
      h('h2', { class: 'detail__name', text: this.atlas.saintName(saint, lang) }),
      otherNames ? h('p', { class: 'detail__aka', text: otherNames }) : null,
      saint.user ? h('p', { class: 'notice notice--mine', text: t('detail.mine') }) : null,
      saint.titles?.length
        ? h('ul', { class: 'chips' }, ...saint.titles.map((key) => h('li', {
          class: 'chip', text: titleLabel(key, saint.sex),
        })))
        : null,
      description ? h('p', { class: 'detail__desc', text: description }) : null,
      h('dl', { class: 'sheet' },
        row(t('detail.birth'), saint.born != null
          ? formatYear(saint.born, { circa: saint.circa }) : t('misc.unknown')),
        row(t('detail.death'), saint.died != null
          ? formatYear(saint.died) : t('misc.unknown')),
        row(t('detail.birthplace'),
          `${saint.city} — ${this.atlas.countryName(saint.country, lang)}`),
        row(t('detail.feast'), formatFeast(saint.feast)),
        row(t('detail.era'), era ? t(`era.${era}`) : null)),
      h('div', { class: 'detail__actions' },
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('detail.locate'),
          onclick: () => this.onLocate(saint),
        }),
        saint.user
          ? h('button', {
            class: 'btn btn--danger',
            type: 'button',
            text: t('detail.remove'),
            onclick: () => {
              // eslint-disable-next-line no-alert
              if (window.confirm(t('detail.confirmRemove'))) this.onRemove(saint);
            },
          })
          : null),
    ]);
  }
}
