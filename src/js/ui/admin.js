import { PUBLISHED, REJECTED } from '../data.js';
import { formatFeast, formatYear, getLanguage, t } from '../i18n.js';
import { reviewPool } from '../verify.js';
import { fill, h } from './dom.js';

function lifespan(saint) {
  const born = saint.born != null ? formatYear(saint.born, { circa: saint.circa }) : '?';
  const died = saint.died != null ? formatYear(saint.died) : '?';
  return `${born} – ${died}`;
}

/** File des propositions en attente, et remise à zéro des changements locaux. */
export class ModerationPanel {
  constructor(atlas, { onOpen, onStatus, onReset }) {
    this.atlas = atlas;
    this.onOpen = onOpen;
    this.onStatus = onStatus;
    this.onReset = onReset;
    this.root = h('div', { class: 'moderate' });
    this.render();
  }

  render() {
    const lang = getLanguage();
    const waiting = this.atlas.pending();
    const store = this.atlas.store;

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('moderate.title') }),
      h('p', { class: 'results__summary', text: t('moderate.count', { n: waiting.length }) }),
      waiting.length
        ? h('div', { class: 'results' }, ...waiting.map((saint) => h('div', { class: 'review' },
          h('button', {
            class: 'review__open',
            type: 'button',
            onclick: () => this.onOpen(saint),
          },
          h('span', { class: 'result__name', text: this.atlas.saintName(saint, lang) }),
          h('span', { class: 'result__meta',
            text: `${this.atlas.countryName(saint.country, lang)} · ${saint.city}` }),
          h('span', { class: 'result__dates' },
            h('span', { text: lifespan(saint) }),
            h('span', { class: 'result__feast', text: formatFeast(saint.feast) }))),
          h('div', { class: 'review__actions' },
            h('button', {
              class: 'btn btn--go',
              type: 'button',
              text: t('moderate.approve'),
              onclick: () => this.onStatus(saint, PUBLISHED),
            }),
            h('button', {
              class: 'btn btn--danger',
              type: 'button',
              text: t('moderate.reject'),
              onclick: () => this.onStatus(saint, REJECTED),
            })))))
        : h('p', { class: 'results__empty', text: t('moderate.empty') }),

      h('h2', { class: 'panel__section', text: t('moderate.localTitle') }),
      this.atlas.hasLocalChanges()
        ? h('ul', { class: 'stats' },
          h('li', { text: `+ ${store.added.length}` }),
          h('li', { text: `~ ${Object.keys(store.edits).length}` }),
          h('li', { text: `− ${store.removed.length}` }))
        : h('p', { class: 'results__empty', text: t('moderate.localNone') }),
      this.atlas.hasLocalChanges()
        ? h('button', {
          class: 'btn btn--danger',
          type: 'button',
          text: t('moderate.reset'),
          onclick: () => {
            // eslint-disable-next-line no-alert
            if (window.confirm(t('moderate.resetConfirm'))) this.onReset();
          },
        })
        : null,
    ]);
  }
}

const HANDLED_KEY = 'sanctimaps.assistant.handled.v1';

function readHandled() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeHandled(set) {
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...set]));
  } catch {
    // Sans stockage, la file repart à zéro au prochain chargement.
  }
}

/**
 * Assistant de propositions.
 *
 * Il puise dans un réservoir de fiches préparées et livrées avec
 * l'application, les confronte au corpus et à la carte, et ne soumet à
 * l'administrateur que celles qui passent tous les contrôles. Les autres sont
 * montrées à part, avec le motif de leur mise à l'écart — c'est ce qui rend la
 * vérification vérifiable.
 *
 * Il ne s'agit pas d'un modèle de langage : l'application est un site
 * statique, sans serveur qui pourrait porter une clé d'API.
 */
export class AssistantPanel {
  constructor(atlas, { onAccept, onOpen }) {
    this.atlas = atlas;
    this.onAccept = onAccept;
    this.onOpen = onOpen;
    this.handled = readHandled();
    this.review = null;
    this.root = h('div', { class: 'assistant' });
    this.render();
  }

  scan() {
    this.review = reviewPool(this.atlas, this.handled);
    this.render();
  }

  markHandled(id) {
    this.handled.add(id);
    writeHandled(this.handled);
    this.scan();
  }

  accept(candidate) {
    this.onAccept(candidate);
    this.markHandled(candidate.id);
  }

  render() {
    const lang = getLanguage();
    const review = this.review;

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('assistant.title') }),
      h('p', { class: 'add__intro', text: t('assistant.intro') }),
      h('p', { class: 'field__hint', text: t('assistant.method') }),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: review ? t('assistant.rescan') : t('assistant.scan'),
        onclick: () => this.scan(),
      }),

      review ? h('p', { class: 'results__summary', text: t('assistant.summary', {
        ok: review.proposals.length, bad: review.discarded.length, total: review.total,
      }) }) : null,

      review && !review.total
        ? h('p', { class: 'results__empty', text: t('assistant.poolEmpty') })
        : null,

      review && review.proposals.length
        ? h('h3', { class: 'panel__subsection', text: t('assistant.proposals') })
        : null,
      review && review.proposals.length
        ? h('div', { class: 'results' }, ...review.proposals.map(({ candidate }) => h('div', {
          class: 'review',
        },
        h('button', {
          class: 'review__open',
          type: 'button',
          onclick: () => this.onOpen(candidate),
        },
        h('span', { class: 'result__name', text: this.atlas.saintName(candidate, lang) }),
        h('span', { class: 'result__meta',
          text: `${this.atlas.countryName(candidate.country, lang)} · ${candidate.city}` }),
        h('span', { class: 'result__dates' },
          h('span', { text: lifespan(candidate) }),
          h('span', { class: 'result__feast', text: formatFeast(candidate.feast) })),
        h('span', { class: 'check check--ok', text: `✓ ${t('check.passed')}` })),
        h('div', { class: 'review__actions' },
          h('button', {
            class: 'btn btn--go',
            type: 'button',
            text: t('assistant.accept'),
            onclick: () => this.accept(candidate),
          }),
          h('button', {
            class: 'btn btn--ghost',
            type: 'button',
            text: t('assistant.skip'),
            onclick: () => this.markHandled(candidate.id),
          })))))
        : null,

      review && review.proposals.length === 0 && review.total
        ? h('p', { class: 'results__empty', text: t('assistant.noneLeft') })
        : null,

      review && review.discarded.length
        ? h('h3', { class: 'panel__subsection', text: t('assistant.discarded') })
        : null,
      review && review.discarded.length
        ? h('div', { class: 'results' }, ...review.discarded.map(({ candidate, failures }) => h('div', {
          class: 'review review--bad',
        },
        h('span', { class: 'result__name', text: this.atlas.saintName(candidate, lang) }),
        h('span', { class: 'result__meta',
          text: `${this.atlas.countryName(candidate.country, lang)} · ${candidate.city}` }),
        h('ul', { class: 'checks-list' }, ...failures.map((failure) => h('li', {
          class: 'check check--bad',
          text: failure.hint
            ? `${t(`check.${failure.key}`)} (${failure.hint})`
            : t(`check.${failure.key}`),
        }))))))
        : null,
    ]);
  }
}
