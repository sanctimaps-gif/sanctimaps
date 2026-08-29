import { DEFAULT_COUNT, checkAvailability, requestSaints } from '../ai.js';
import { PUBLISHED, REJECTED } from '../data.js';
import { formatFeast, formatYear, getLanguage, t } from '../i18n.js';
import { reviewPool, verifyCandidate } from '../verify.js';
import { field, fill, h, select } from './dom.js';

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
 * Deux sources, un seul circuit. Le **réservoir** puise dans des fiches
 * préparées et livrées avec l'application ; l'**IA** demande des fiches
 * complètes au modèle, par l'intermédiaire du serveur qui détient la clé.
 * Dans les deux cas les fiches passent par la même vérification — pays connu,
 * point tombant dans ce pays, dates cohérentes, fête possible, absence de
 * doublon — et seules celles qui la franchissent sont proposées. Les autres
 * sont montrées à part avec le motif exact de leur mise à l'écart, ce qui rend
 * la vérification vérifiable.
 *
 * L'administrateur tranche toujours : rien n'est publié sans son accord.
 */
export class AssistantPanel {
  constructor(atlas, { onAccept, onOpen }) {
    this.atlas = atlas;
    this.onAccept = onAccept;
    this.onOpen = onOpen;
    this.handled = readHandled();
    this.source = 'pool';
    this.review = null;
    this.ai = { region: '', century: '', count: DEFAULT_COUNT, busy: false, error: null, usage: null };
    this.root = h('div', { class: 'assistant' });
    this.render();
    checkAvailability().then((status) => {
      this.availability = status;
      this.render();
    });
  }

  setSource(source) {
    this.source = source;
    this.review = null;
    this.ai.error = null;
    this.render();
  }

  scan() {
    this.review = reviewPool(this.atlas, this.handled);
    this.render();
  }

  markHandled(id) {
    this.handled.add(id);
    writeHandled(this.handled);
    if (this.source === 'pool') this.scan();
    else this.dropFromReview(id);
  }

  /** Retire une fiche de la liste courante, sans relancer toute la source. */
  dropFromReview(id) {
    if (!this.review) return;
    this.review = {
      ...this.review,
      proposals: this.review.proposals.filter((p) => p.candidate.id !== id),
    };
    this.render();
  }

  accept(candidate) {
    this.onAccept(candidate);
    this.markHandled(candidate.id);
  }

  /** Pays dans lesquels puiser, selon la région choisie. */
  scope() {
    const region = this.ai.region;
    const countries = region
      ? this.atlas.continentById.get(region)?.countries || []
      : this.atlas.countries.map((c) => c.id);
    return {
      countries,
      regionLabel: region ? t(`continent.${region}`) : '',
    };
  }

  async generate() {
    this.ai.busy = true;
    this.ai.error = null;
    this.render();

    const lang = getLanguage();
    const { countries, regionLabel } = this.scope();
    // Le modèle reçoit les noms déjà présents pour ne pas les reproposer ;
    // la vérification rattrape de toute façon ceux qui passeraient au travers.
    const exclude = this.atlas.everySaint.map((s) => this.atlas.saintName(s, lang));

    try {
      const result = await requestSaints({
        countries,
        century: this.ai.century ? Number(this.ai.century) : null,
        exclude,
        regionLabel,
        count: this.ai.count,
      });
      const stamp = Date.now().toString(36);
      const proposals = [];
      const discarded = [];
      result.saints.forEach((saint, index) => {
        const candidate = { ...saint, id: `ai-${stamp}-${index}`, source: 'ai' };
        const checked = verifyCandidate(candidate, this.atlas);
        (checked.ok ? proposals : discarded).push({ candidate, ...checked });
      });
      this.review = { proposals, discarded, total: proposals.length + discarded.length };
      this.ai.usage = result.usage;
    } catch (error) {
      this.ai.error = error.reason === 'no-key' ? t('assistant.aiUnavailable') : error.message;
      this.review = null;
    } finally {
      this.ai.busy = false;
      this.render();
    }
  }

  sourceSwitch() {
    return h('div', { class: 'segmented', role: 'tablist' },
      ...[['pool', t('assistant.sourcePool')], ['ai', t('assistant.sourceAi')]].map(([key, label]) => h('button', {
        class: `segmented__btn${this.source === key ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(this.source === key),
        onclick: () => this.setSource(key),
      }, h('span', { text: label }))));
  }

  aiControls() {
    const available = this.availability?.available;
    const centuries = Array.from({ length: 21 }, (_, i) => ({
      value: String(i + 1), label: t('search.centuryChip', { n: i + 1 }),
    }));
    const continents = this.atlas.continents
      .map((c) => ({ value: c.id, label: t(`continent.${c.id}`) }));

    return h('div', {},
      h('p', { class: 'add__intro', text: t('assistant.aiIntro') }),
      h('p', { class: 'field__hint', text: t('assistant.aiNote') }),
      available === false
        ? h('p', { class: 'notice notice--error', text: t('assistant.aiUnavailable') })
        : null,
      this.ai.error ? h('p', { class: 'notice notice--error', text: this.ai.error }) : null,

      h('div', { class: 'filters__row' },
        field(t('assistant.aiRegion'), select(
          [{ value: '', label: t('assistant.aiAll') }, ...continents],
          { value: this.ai.region, onchange: (e) => { this.ai.region = e.target.value; } },
        )),
        field(t('assistant.aiCentury'), select(
          [{ value: '', label: t('assistant.aiAll') }, ...centuries],
          { value: this.ai.century, onchange: (e) => { this.ai.century = e.target.value; } },
        ))),
      field(t('assistant.aiCount'), select(
        [3, 5, 8].map((n) => ({ value: String(n), label: String(n) })),
        { value: String(this.ai.count), onchange: (e) => { this.ai.count = Number(e.target.value); } },
      )),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        disabled: this.ai.busy || available === false,
        text: this.ai.busy ? t('assistant.generating') : t('assistant.generate'),
        onclick: () => this.generate(),
      }));
  }

  /** Une fiche retenue : ce qu'elle dit, et ce qu'on peut en faire. */
  proposalCard({ candidate }) {
    const lang = getLanguage();
    const desc = typeof candidate.desc === 'string'
      ? candidate.desc
      : candidate.desc?.[lang] || candidate.desc?.fr || candidate.desc?.en || '';
    return h('div', { class: 'review' },
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
        h('span', { class: 'result__feast', text: formatFeast(candidate.feast) }))),
      desc ? h('p', { class: 'review__desc', text: desc }) : null,
      h('span', { class: 'check check--ok', text: `✓ ${t('check.passed')}` }),
      candidate.confidence
        ? h('span', { class: `check check--${candidate.confidence}`,
          text: t('assistant.confidence', { level: t(`confidence.${candidate.confidence}`) }) })
        : null,
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
        })));
  }

  /** Une fiche écartée : pourquoi elle l'a été. */
  discardCard({ candidate, failures }) {
    const lang = getLanguage();
    return h('div', { class: 'review review--bad' },
      h('span', { class: 'result__name', text: this.atlas.saintName(candidate, lang) }),
      h('span', { class: 'result__meta',
        text: `${this.atlas.countryName(candidate.country, lang)} · ${candidate.city}` }),
      h('ul', { class: 'checks-list' }, ...failures.map((failure) => h('li', {
        class: 'check check--bad',
        text: failure.hint
          ? `${t(`check.${failure.key}`)} (${failure.hint})`
          : t(`check.${failure.key}`),
      }))));
  }

  render() {
    const review = this.review;
    const pool = this.source === 'pool';

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('assistant.title') }),
      this.sourceSwitch(),

      pool ? h('p', { class: 'add__intro', text: t('assistant.intro') }) : null,
      pool ? h('p', { class: 'field__hint', text: t('assistant.method') }) : null,
      pool ? h('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: review ? t('assistant.rescan') : t('assistant.scan'),
        onclick: () => this.scan(),
      }) : this.aiControls(),

      review ? h('p', { class: 'results__summary', text: t('assistant.summary', {
        ok: review.proposals.length, bad: review.discarded.length, total: review.total,
      }) }) : null,

      review && !review.total
        ? h('p', { class: 'results__empty', text: pool ? t('assistant.poolEmpty') : t('assistant.aiEmpty') })
        : null,

      review && review.proposals.length
        ? h('h3', { class: 'panel__subsection', text: t('assistant.proposals') })
        : null,
      review && review.proposals.length
        ? h('div', { class: 'results' }, ...review.proposals.map((p) => this.proposalCard(p)))
        : null,

      review && review.total && !review.proposals.length
        ? h('p', { class: 'results__empty', text: t('assistant.noneLeft') })
        : null,

      review && review.discarded.length
        ? h('h3', { class: 'panel__subsection', text: t('assistant.discarded') })
        : null,
      review && review.discarded.length
        ? h('div', { class: 'results' }, ...review.discarded.map((d) => this.discardCard(d)))
        : null,
    ]);
  }
}
