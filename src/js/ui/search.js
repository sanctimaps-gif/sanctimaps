import { PENDING, REJECTED, centuryOf, saintCentury } from '../data.js';
import { collator, formatFeast, formatYear, getLanguage, monthNames, t } from '../i18n.js';
import { buildCalendar, downloadCalendar } from '../calendar.js';
import { buildCountryIndex, parseQuery, removeToken, stringifyQuery } from '../query.js';
import { fill, h } from './dom.js';
import { emblemSvg } from '../emblems.js';
import { aelf, chargerAelf, honores, liturgieDu } from '../liturgie.js';

/** Mois de la langue courante et mois anglais, pour que « september » marche partout. */
const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Recherche : une seule barre, et les filtres qu'elle a compris. */
export class SearchPanel {
  constructor(atlas, { onSelect }) {
    this.atlas = atlas;
    this.onSelect = onSelect;
    this.text = '';
    // Ce que la recherche parcourt : les trois corpus d'un coup — « Lourdes »
    // doit trouver l'apparition autant que Bernadette —, ou un seul.
    this.scope = 'tout';
    this.root = h('div', { class: 'search' });
    this.render();
    // Le saint du jour se lit dans le calendrier de l'AELF : il monte en tête
    // de la liste dès que le calendrier est là.
    chargerAelf().then(() => { if (this.results) this.renderResults(); });
  }

  /** Les fiches que la célébration d'aujourd'hui met à l'honneur. */
  duJour() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const jour = liturgieDu(date);
    if (!jour) return [];
    return honores({
      saints: this.atlas.saints, apparitions: this.atlas.apparitions, celebrations: aelf?.celebrations,
    }, jour, date);
  }

  reset() {
    this.text = '';
    this.render();
  }

  /** Pré-remplit la barre avec un pays, quand la carte en ouvre un. */
  focusCountry(countryId) {
    this.text = this.atlas.countryName(countryId, getLanguage());
    this.render();
  }

  months() {
    return [...monthNames(), ...ENGLISH_MONTHS];
  }

  parse() {
    const lang = getLanguage();
    if (this.indexLang !== lang) {
      this.countryIndex = buildCountryIndex(this.atlas, lang);
      this.indexLang = lang;
    }
    return parseQuery(this.text, { countryIndex: this.countryIndex, months: this.months() });
  }

  render() {
    this.input = h('input', {
      class: 'control search__input',
      type: 'search',
      value: this.text,
      placeholder: t('search.placeholder'),
      'aria-label': t('search.label'),
      oninput: (e) => {
        this.text = e.target.value;
        this.renderResults();
      },
    });

    this.tokenBar = h('div', { class: 'tokens' });
    this.summary = h('p', { class: 'results__summary', 'aria-live': 'polite' });
    this.results = h('div', { class: 'results', role: 'list' });
    this.calendarButton = h('button', {
      class: 'btn btn--ghost btn--calendar',
      type: 'button',
      onclick: () => this.exportCalendar(),
    });

    const portee = (nom, libelle) => h('button', {
      class: `chip chip--scope${this.scope === nom ? ' is-on' : ''}`,
      type: 'button',
      'aria-pressed': this.scope === nom ? 'true' : 'false',
      text: libelle,
      onclick: () => { this.scope = nom; this.render(); },
    });

    fill(this.root, [
      h('div', { class: 'search__bar' }, this.input),
      h('div', { class: 'search__scope', role: 'group', 'aria-label': t('search.scope') },
        portee('tout', t('search.scopeAll')),
        portee('saints', t('corpus.saints')),
        portee('apparitions', t('corpus.apparitions')),
        portee('miracles', t('corpus.miracles'))),
      h('p', { class: 'search__help', text: t('search.help') }),
      this.tokenBar,
      this.summary,
      this.calendarButton,
      this.results,
    ]);
    this.renderResults();
  }

  /** Réécrit la barre après le retrait d'un jeton, en gardant le reste. */
  dropToken(parsed, kind) {
    const lang = getLanguage();
    this.text = stringifyQuery(removeToken(parsed, kind), {
      atlas: this.atlas, lang, months: monthNames(),
    });
    this.input.value = this.text;
    this.renderResults();
  }

  renderTokens(parsed) {
    const lang = getLanguage();
    const label = (token) => {
      if (token.kind === 'country') return this.atlas.countryName(token.value, lang);
      if (token.kind === 'century') return t('search.centuryChip', { n: token.value });
      if (token.kind === 'year') return t('search.yearChip', { n: token.value });
      const { month, day } = token.value;
      return day
        ? formatFeast(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
        : monthNames()[month - 1];
    };
    fill(this.tokenBar, parsed.tokens.map((token) => h('button', {
      class: `chip chip--token chip--${token.kind}`,
      type: 'button',
      title: t('search.removeToken'),
      onclick: () => this.dropToken(parsed, token.kind),
    }, h('span', { text: label(token) }), h('span', { class: 'chip__x', text: '×' }))));
  }

  /** Écrit un fichier .ics des fêtes actuellement listées. */
  exportCalendar() {
    const lang = getLanguage();
    const list = this.lastResults || [];
    if (!list.length) return;
    const content = buildCalendar(list, {
      lang,
      title: t('calendar.title'),
      name: (saint, code) => this.atlas.saintName(saint, code),
      country: (id, code) => this.atlas.countryName(id, code),
    });
    downloadCalendar(content, 'saints.ics');
  }

  /** Les fiches que la portée choisie parcourt. */
  fiches() {
    const corpus = this.scope === 'tout' ? ['saints', 'apparitions', 'miracles'] : [this.scope];
    return corpus.flatMap((nom) => (nom === 'saints' ? this.atlas.saints : this.atlas.index[nom]?.liste || []));
  }

  matches(parsed) {
    const lang = getLanguage();
    return this.fiches().filter((saint) => {
      // Une apparition et un miracle ont eu lieu une année, parfois sur
      // plusieurs : le siècle et l'année se lisent sur elle.
      const date = saint.kind === 'apparition' || saint.kind === 'miracle';
      if (parsed.country && saint.country !== parsed.country) return false;
      if (parsed.century && (date ? centuryOf(saint.annee) : saintCentury(saint)) !== parsed.century) return false;
      if (parsed.year != null && (date
        ? !(parsed.year >= saint.annee && parsed.year <= (saint.anneeFin ?? saint.annee))
        : !aliveAt(saint, parsed.year))) return false;
      if (parsed.feast) {
        const [m, d] = String(saint.feast || '').split('-').map(Number);
        if (m !== parsed.feast.month) return false;
        if (parsed.feast.day && d !== parsed.feast.day) return false;
      }
      if (parsed.terms.length) {
        const haystack = this.atlas.searchIndex(saint, lang);
        if (!parsed.terms.every((term) => haystack.includes(term))) return false;
      }
      return true;
    });
  }

  renderResults() {
    const lang = getLanguage();
    const cmp = collator();
    const parsed = this.parse();
    this.renderTokens(parsed);

    const list = this.matches(parsed);
    // Tri chronologique dès qu'une date est en jeu, alphabétique sinon.
    if (parsed.century || parsed.year != null) {
      list.sort((a, b) => (a.annee ?? a.born ?? a.died ?? 0) - (b.annee ?? b.born ?? b.died ?? 0));
    } else if (parsed.feast) {
      list.sort((a, b) => String(a.feast).localeCompare(String(b.feast)));
    } else {
      list.sort((a, b) => cmp.compare(
        this.atlas.saintName(a, lang), this.atlas.saintName(b, lang),
      ));
    }

    // Sans filtre, le saint du jour passe en tête de la liste.
    const libre = !parsed.tokens.length && !parsed.terms.length;
    const duJour = new Set(libre ? this.duJour().map((f) => f.id) : []);
    if (duJour.size) {
      const enTete = list.filter((f) => duJour.has(f.id));
      const reste = list.filter((f) => !duJour.has(f.id));
      list.length = 0;
      list.push(...enTete, ...reste);
    }

    const seulsSaints = this.scope === 'saints';
    this.summary.textContent = seulsSaints
      ? (list.length === 1 ? t('search.resultsOne') : t('search.results', { n: list.length }))
      : (list.length === 1 ? t('search.resultsAnyOne') : t('search.resultsAny', { n: list.length }));

    // L'export porte sur ce qui est affiché : filtrer puis exporter donne un
    // calendrier de circonstance — les saints d'un pays, d'un siècle, d'un mois.
    // Il ne porte que sur les saints : ce sont eux qui ont un jour de fête.
    const saints = list.filter((s) => !s.kind || s.kind === 'saint');
    this.lastResults = saints;
    const filtered = parsed.tokens.length > 0 || parsed.terms.length > 0;
    this.calendarButton.textContent = filtered
      ? t('calendar.exportFiltered', { n: saints.length })
      : t('calendar.exportAll', { n: saints.length });
    this.calendarButton.disabled = saints.length === 0;
    this.calendarButton.hidden = saints.length === 0 && list.length > 0;

    if (!list.length) {
      fill(this.results, [h('p', { class: 'results__empty', text: t(seulsSaints ? 'search.none' : 'search.noneAny') })]);
      return;
    }

    fill(this.results, list.map((saint) => h('button', {
      class: `result result--emblem${saint.status !== 'published' ? ' result--draft' : ''}${duJour.has(saint.id) ? ' result--du-jour' : ''}`,
      type: 'button',
      role: 'listitem',
      onclick: () => this.onSelect(saint.id),
    },
    emblemSvg(saint),
    h('span', { class: 'result__name', text: this.atlas.saintName(saint, lang) }),
    h('span', { class: 'result__meta',
      text: `${this.atlas.countryName(saint.country, lang)} · ${saint.city}` }),
    h('span', { class: 'result__dates' },
      h('span', { text: saint.kind === 'apparition' || saint.kind === 'miracle' ? periode(saint) : lifespan(saint) }),
      saint.feast ? h('span', { class: 'result__feast', text: formatFeast(saint.feast) }) : null),
    duJour.has(saint.id) ? h('span', { class: 'chip chip--du-jour', text: t('daily.title') }) : null,
    statusChip(saint))));
  }
}

function statusChip(saint) {
  if (saint.status === PENDING) return h('span', { class: 'chip chip--pending', text: t('status.pending') });
  if (saint.status === REJECTED) return h('span', { class: 'chip chip--rejected', text: t('status.rejected') });
  return null;
}

/** L'année d'une apparition ou d'un miracle, ou ses deux bornes. */
function periode(fiche) {
  if (fiche.annee == null) return '';
  return fiche.anneeFin && fiche.anneeFin !== fiche.annee
    ? `${formatYear(fiche.annee)} – ${formatYear(fiche.anneeFin)}`
    : formatYear(fiche.annee);
}

function lifespan(saint) {
  const born = saint.born != null
    ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec }) : '?';
  const died = saint.died != null
    ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec }) : '?';
  return `${born} – ${died}`;
}

/** Une année isolée sélectionne les saints en vie à ce moment-là. */
function aliveAt(saint, year) {
  const born = saint.born ?? (saint.died != null ? saint.died - 70 : null);
  const died = saint.died ?? (saint.born != null ? saint.born + 80 : null);
  if (born == null || died == null) return false;
  return year >= born && year <= died;
}
