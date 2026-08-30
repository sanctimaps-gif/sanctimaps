import { DEFAULT_COUNT, checkAvailability, requestSaints } from '../ai.js';
import { PUBLISHED, REJECTED } from '../data.js';
import { buildDraft, findPlaces, surveyGaps } from '../expert.js';
import { collator, formatFeast, formatNumber, formatYear, getLanguage, monthNames, t } from '../i18n.js';
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
    // L'expert : ce que l'administrateur sait, et ce que la table sait.
    this.expert = {
      name: '', sex: 'm', country: '', city: '',
      born: '', died: '', circa: false, month: '', day: '', desc: '',
      matches: null, chosen: null, checked: null, busy: false, error: null,
    };
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
    this.expert.error = null;
    this.render();
  }

  // -------------------------------------------------------------------------
  // Expert : la table des localités tient lieu de mémoire
  // -------------------------------------------------------------------------

  /**
   * Cherche la ville de naissance dans la table du pays.
   *
   * Le fichier d'un pays n'est chargé qu'à la demande : chercher un lieu en
   * France ne fait pas descendre les localités du monde entier.
   */
  async lookup() {
    const { country, city } = this.expert;
    if (!country || !city.trim()) return;
    this.expert.busy = true;
    this.expert.error = null;
    this.render();
    try {
      const places = await this.atlas.ensurePlaces(country);
      this.expert.matches = findPlaces(places, city);
      this.expert.chosen = this.expert.matches.length === 1 ? this.expert.matches[0] : null;
      if (!this.expert.matches.length) this.expert.error = t('expert.noPlace');
    } catch {
      this.expert.error = t('expert.noPlace');
    } finally {
      this.expert.busy = false;
      this.expert.checked = null;
      this.render();
    }
  }

  choosePlace(place) {
    this.expert.chosen = place;
    this.expert.checked = null;
    this.render();
  }

  /** Assemble la fiche et la soumet aux mêmes contrôles que toute autre. */
  compose() {
    const e = this.expert;
    if (!e.chosen || !e.name.trim()) return;
    const pad = (n) => String(n).padStart(2, '0');
    const draft = buildDraft({
      name: e.name,
      sex: e.sex,
      country: e.country,
      place: e.chosen,
      born: e.born,
      died: e.died,
      circa: e.circa,
      feast: e.month && e.day ? `${pad(Number(e.month))}-${pad(Number(e.day))}` : '',
      desc: e.desc,
    });
    const candidate = { ...draft, id: `exp-${Date.now().toString(36)}` };
    e.checked = { candidate, ...verifyCandidate(candidate, this.atlas) };
    this.render();
  }

  /** Publie la fiche composée et remet l'atelier à zéro. */
  publishExpert() {
    const checked = this.expert.checked;
    if (!checked?.ok) return;
    this.onAccept(checked.candidate);
    this.expert = {
      ...this.expert,
      name: '', city: '', born: '', died: '', circa: false, month: '', day: '', desc: '',
      matches: null, chosen: null, checked: null,
    };
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
      this.ai.error = error.reason === 'no-provider'
        ? t('assistant.aiUnavailable') : error.message;
      this.review = null;
    } finally {
      this.ai.busy = false;
      this.render();
    }
  }

  /**
   * Les sources disponibles.
   *
   * Le modèle externe ne paraît que s'il répond : un onglet qui n'affiche
   * qu'un message d'indisponibilité n'est pas un choix, c'est une impasse.
   * Les deux autres fonctionnent toujours, sans rien demander à personne.
   */
  sources() {
    const list = [['pool', t('assistant.sourcePool')], ['expert', t('assistant.sourceExpert')]];
    if (this.availability?.available) list.push(['ai', t('assistant.sourceAi')]);
    return list;
  }

  sourceSwitch() {
    return h('div', { class: 'segmented', role: 'tablist' },
      ...this.sources().map(([key, label]) => h('button', {
        class: `segmented__btn${this.source === key ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(this.source === key),
        onclick: () => this.setSource(key),
      }, h('span', { text: label }))));
  }

  /** L'atelier de l'expert : saisir, retrouver le lieu, contrôler, publier. */
  expertControls() {
    const e = this.expert;
    const lang = getLanguage();
    const cmp = collator();
    const countries = this.atlas.countries
      .map((c) => ({ value: c.id, label: this.atlas.countryName(c.id, lang) }))
      .sort((a, b) => cmp.compare(a.label, b.label));
    const months = monthNames().map((label, i) => ({ value: String(i + 1), label }));
    const gaps = surveyGaps(this.atlas);
    const thin = gaps.byContinent[0];

    // Les deux boutons se règlent depuis la frappe, sans reconstruire le
    // formulaire : un rendu à chaque touche volerait le curseur au champ.
    const lookupBtn = h('button', {
      class: 'btn',
      type: 'button',
      text: e.busy ? t('expert.looking') : t('expert.lookup'),
      onclick: () => this.lookup(),
    });
    const composeBtn = h('button', {
      class: 'btn btn--primary',
      type: 'button',
      text: t('expert.compose'),
      onclick: () => this.compose(),
    });
    const syncButtons = () => {
      lookupBtn.disabled = e.busy || !e.country || !e.city.trim();
      composeBtn.disabled = !e.chosen || !e.name.trim();
    };

    const bind = (key) => (event) => {
      e[key] = event.target.value;
      syncButtons();
    };

    return [
      h('p', { class: 'add__intro', text: t('expert.intro') }),
      h('p', { class: 'field__hint', text: t('expert.method') }),

      field(t('add.name'), h('input', {
        class: 'control', type: 'text', value: e.name,
        placeholder: t('add.namePlaceholder'), oninput: bind('name'),
      })),
      field(t('add.sex'), select(
        [{ value: 'm', label: t('add.male') }, { value: 'f', label: t('add.female') }],
        { value: e.sex, onchange: (ev) => { e.sex = ev.target.value; } },
      )),
      field(t('add.country'), select(
        [{ value: '', label: '—' }, ...countries],
        {
          value: e.country,
          onchange: (ev) => {
            e.country = ev.target.value;
            e.matches = null;
            e.chosen = null;
            e.checked = null;
            this.render();
          },
        },
      )),

      h('div', { class: 'filters__row' },
        field(t('add.city'), h('input', {
          class: 'control', type: 'text', value: e.city,
          placeholder: t('add.cityPlaceholder'),
          oninput: bind('city'),
          onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.lookup(); } },
        })),
        lookupBtn),

      e.error ? h('p', { class: 'notice notice--error', text: e.error }) : null,

      // La table répond par des lieux, pas par un lieu : à l'administrateur de
      // reconnaître le sien parmi les homonymes, population à l'appui.
      e.matches && e.matches.length
        ? h('div', { class: 'results' }, ...e.matches.map((place) => h('button', {
          class: `result${e.chosen === place ? ' is-active' : ''}`,
          type: 'button',
          onclick: () => this.choosePlace(place),
        },
        h('span', { class: 'result__name', text: place.n }),
        h('span', { class: 'result__meta',
          text: place.p ? t('expert.inhabitants', { n: formatNumber(place.p) }) : '—' }))))
        : null,

      h('div', { class: 'filters__row' },
        field(t('add.born'), h('input', {
          class: 'control', type: 'number', placeholder: '1182',
          value: e.born, oninput: bind('born'),
        })),
        field(t('add.died'), h('input', {
          class: 'control', type: 'number', placeholder: '1226',
          value: e.died, oninput: bind('died'),
        }))),
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: e.circa,
          onchange: (ev) => { e.circa = ev.target.checked; },
        }),
        h('span', { text: t('expert.circa') })),

      h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.feast') }),
        h('div', { class: 'filters__row' },
          select([{ value: '', label: '—' }, ...months], {
            value: e.month, onchange: bind('month'), 'aria-label': t('add.month'),
          }),
          h('input', {
            class: 'control', type: 'number', min: '1', max: '31',
            value: e.day, oninput: bind('day'), 'aria-label': t('add.day'),
          }))),

      field(t('add.desc'), h('textarea', {
        class: 'control control--area', rows: '2',
        placeholder: t('add.descPlaceholder'), oninput: bind('desc'),
      }, e.desc)),

      composeBtn,

      e.checked ? this.expertVerdict(e.checked) : null,

      // Un état des lieux, tiré du corpus lui-même : il dit où porter l'effort.
      // Les boutons naissent au bon état, avant même la première frappe.
      (syncButtons(), null),

      h('p', { class: 'field__hint expert__survey', text: t('expert.survey', {
        n: formatNumber(gaps.saints),
        c: formatNumber(gaps.countries),
        continent: t(`continent.${thin.id}`),
        few: formatNumber(thin.total),
        patronage: formatNumber(gaps.withoutPatronage),
      }) }),
    ];
  }

  /** Ce que les six contrôles ont dit de la fiche composée. */
  expertVerdict(checked) {
    if (!checked.ok) {
      return h('div', { class: 'review review--bad' },
        h('span', { class: 'result__name', text: checked.candidate.name.fr }),
        h('ul', { class: 'checks-list' }, ...checked.failures.map((failure) => h('li', {
          class: 'check check--bad',
          text: failure.hint
            ? `${t(`check.${failure.key}`)} (${failure.hint})`
            : t(`check.${failure.key}`),
        }))));
    }
    const c = checked.candidate;
    return h('div', { class: 'review' },
      h('span', { class: 'result__name', text: c.name.fr }),
      h('span', { class: 'result__meta',
        text: `${this.atlas.countryName(c.country, getLanguage())} · ${c.city} · ${c.lat}, ${c.lng}` }),
      h('span', { class: 'check check--ok', text: `✓ ${t('check.passed')}` }),
      h('div', { class: 'review__actions' },
        h('button', {
          class: 'btn btn--go',
          type: 'button',
          text: t('expert.publish'),
          onclick: () => this.publishExpert(),
        })));
  }

  aiControls() {
    const available = this.availability?.available;
    const centuries = Array.from({ length: 21 }, (_, i) => ({
      value: String(i + 1), label: t('search.centuryChip', { n: i + 1 }),
    }));
    const continents = this.atlas.continents
      .map((c) => ({ value: c.id, label: t(`continent.${c.id}`) }));

    const info = this.availability;
    return h('div', {},
      h('p', { class: 'add__intro', text: t('assistant.aiIntro') }),
      // Dire quel service est en fonction : « local » et « distant » ne se
      // valent pas, ni pour la confidentialité ni pour la facture.
      available && info?.provider
        ? h('p', { class: 'chip chip--provider',
          text: t(info.local ? 'assistant.aiLocal' : 'assistant.aiRemote',
            { provider: info.provider, model: info.model }) })
        : null,
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
    // Un modèle externe qui cesse de répondre ne doit pas laisser l'écran sur
    // un onglet devenu invisible.
    if (this.source === 'ai' && !this.availability?.available) this.source = 'pool';
    const review = this.review;
    const pool = this.source === 'pool';
    const expert = this.source === 'expert';

    if (expert) {
      fill(this.root, [
        h('h2', { class: 'panel__section', text: t('assistant.title') }),
        this.sourceSwitch(),
        ...this.expertControls(),
      ]);
      return;
    }

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
