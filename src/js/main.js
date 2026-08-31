import { getSession, onSessionChange } from './auth.js';
import { PUBLISHED, loadAtlas } from './data.js';
import { getDirection, getLanguage, onLanguageChange, t } from './i18n.js';
import { MapView } from './map/view.js';
import { AccountPanel } from './ui/account.js';
import { AddPanel } from './ui/addForm.js';
import { AssistantPanel, ModerationPanel } from './ui/admin.js';
import { DailyPanel } from './ui/daily.js';
import { ReminderPanel } from './ui/reminder.js';
import { DetailPanel } from './ui/detail.js';
import { SearchPanel } from './ui/search.js';
import { apply as applyTheme } from './theme.js';
import { Sidebar } from './ui/sidebar.js';
import { TopBar } from './ui/topbar.js';

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const stage = document.getElementById('stage');
const mapHost = document.getElementById('map-host');
const app = document.getElementById('app');

applyTheme();
document.documentElement.lang = getLanguage();
document.documentElement.dir = getDirection();
loaderText.textContent = t('app.loading');

async function start() {
  const atlas = await loadAtlas();
  atlas.setViewer(getSession().role);

  const map = new MapView(mapHost, atlas, {
    onCountry: (id) => openCountryFromMap(id),
    onSaint: (id) => openSaint(id),
    onBackground: () => goBack(),
  });

  const searchPanel = new SearchPanel(atlas, { onSelect: (id) => openSaint(id, { fly: true }) });

  const detailPanel = new DetailPanel(atlas, {
    onBack: () => sidebar.backToSearch(),
    onLocate: (saint) => flyToSaint(saint),
    onEdit: (saint) => {
      addPanel.edit(saint);
      sidebar.showTab('add');
    },
    onRemove: (saint) => {
      atlas.deleteSaint(saint.id);
      refreshAll();
      sidebar.backToSearch();
    },
    onStatus: (saint, status) => {
      atlas.setStatus(saint.id, status);
      refreshAll();
      detailPanel.refresh();
    },
  });

  const addPanel = new AddPanel(atlas, {
    onSubmit: ({ draft, editing, status, author }) => {
      if (editing) atlas.updateSaint(editing, draft);
      else atlas.addSaint(draft, { status, author });
      refreshAll();
      const saved = editing ? atlas.byId.get(editing) : atlas.store.added.at(-1);
      if (saved) flyToSaint(atlas.byId.get(saved.id) || saved);
    },
    onPick: () => {
      // Sur petit écran le panneau recouvre la carte : on l'escamote le temps du clic.
      if (!isWide()) sidebar.setOpen(false);
      map.beginPick((coords) => {
        addPanel.setCoordinates(coords);
        sidebar.setOpen(true);
        sidebar.showTab('add');
      });
    },
    onCancelPick: () => map.cancelPick(),
  });

  const moderationPanel = new ModerationPanel(atlas, {
    onOpen: (saint) => { map.highlightSaint(saint.id); sidebar.showDetail(saint); },
    onStatus: (saint, status) => {
      atlas.setStatus(saint.id, status);
      refreshAll();
    },
    onReset: () => {
      atlas.resetStore();
      refreshAll();
    },
  });

  const assistantPanel = new AssistantPanel(atlas, {
    onAccept: (candidate) => {
      const { id, x, y, ...draft } = candidate;
      atlas.addSaint(draft, { status: PUBLISHED, author: getSession().name });
      refreshAll();
    },
    onOpen: (candidate) => flyTo(candidate.country),
  });

  const accountPanel = new AccountPanel({
    onChange: () => {
      atlas.setViewer(getSession().role);
      refreshAll();
      accountPanel.render();
    },
  });

  // Le saint du jour ne dépend que de l'horloge et du corpus : il n'a besoin
  // d'aucun réglage, et se met à jour comme les autres quand le corpus bouge.
  const dailyPanel = new DailyPanel(atlas, { onSelect: (id) => openSaint(id, { fly: true }) });

  // Le rappel quotidien vit dans les réglages, à côté du compte.
  const reminderPanel = new ReminderPanel(atlas);

  const sidebar = new Sidebar(app, {
    atlas,
    search: searchPanel,
    daily: dailyPanel,
    reminder: reminderPanel,
    add: addPanel,
    detail: detailPanel,
    moderate: moderationPanel,
    assistant: assistantPanel,
    account: accountPanel,
  });

  const topBar = new TopBar(stage, atlas, {
    onWorld: () => goWorld(),
    onContinent: (id) => goContinent(id),
  });

  // -------------------------------------------------------------------------
  // Rafraîchissement transversal
  // -------------------------------------------------------------------------

  /** Le corpus a bougé : carte, listes et onglets doivent suivre. */
  function refreshAll() {
    map.syncCountryClasses();
    map.refreshOverlay();
    searchPanel.renderResults();
    dailyPanel.render();
    reminderPanel.render();
    addPanel.render();
    moderationPanel.render();
    assistantPanel.render();
    topBar.render();
    sidebar.sync();
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function isWide() {
    return window.matchMedia('(min-width: 900px)').matches;
  }

  function syncChrome() {
    topBar.set({ mode: map.mode, continentId: map.continentId, countryId: map.countryId });
  }

  function goWorld() {
    map.showWorld();
    syncChrome();
  }

  function goContinent(id) {
    map.showContinent(id);
    syncChrome();
  }

  function goCountry(id) {
    map.showCountry(id);
    addPanel.suggestCountry(id);
    syncChrome();
  }

  function goBack() {
    if (map.mode === 'country') goContinent(map.continentId);
    else if (map.mode === 'continent') goWorld();
  }

  /**
   * Un clic sur un pays ne veut pas dire la même chose selon l'échelle :
   * depuis le monde il désigne un continent, depuis un continent un pays.
   */
  function openCountryFromMap(id) {
    const country = atlas.countryById.get(id);
    if (!country) return;
    if (map.mode === 'world') goContinent(country.continent);
    else if (map.mode === 'continent') {
      if (country.continent === map.continentId) goCountry(id);
      else goContinent(country.continent);
    } else if (id !== map.countryId) goCountry(id);
  }

  function flyTo(countryId) {
    if (map.countryId !== countryId) goCountry(countryId);
  }

  function openSaint(id, { fly = false } = {}) {
    const saint = atlas.byId.get(id);
    if (!saint) return;
    if (fly) flyToSaint(saint);
    else {
      map.highlightSaint(saint.id);
      sidebar.showDetail(saint);
    }
  }

  function flyToSaint(saint) {
    flyTo(saint.country);
    map.highlightSaint(saint.id);
    sidebar.showDetail(saint);
    syncChrome();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (map.picking) {
      map.cancelPick();
      addPanel.picking = false;
      addPanel.render();
      return;
    }
    goBack();
  });

  onSessionChange(() => {
    atlas.setViewer(getSession().role);
    refreshAll();
  });

  onLanguageChange(() => {
    sidebar.retranslate();
    topBar.render();
    map.setLanguage(getLanguage());
  });

  map.setLanguage(getLanguage());
  goWorld();

  // Une adresse peut nommer un saint : « ?saint=blandine ». C'est par là
  // qu'arrive un lecteur venu d'une page de fiche ou d'un moteur de recherche,
  // et la carte doit alors s'ouvrir sur ce saint plutôt que sur le monde.
  //
  // Un identifiant inconnu arrive plus souvent qu'on ne croit : une page
  // gardée en signet, un lien partagé, une fiche retirée du corpus depuis. La
  // carte s'ouvrait alors sur le monde, sans un mot — le lecteur venait de
  // quitter une biographie pour un planisphère muet, et rien ne lui disait
  // pourquoi. Elle ouvre maintenant la recherche, qui est l'endroit d'où l'on
  // repart.
  const asked = new URLSearchParams(location.search).get('saint');
  if (asked) {
    if (atlas.byId.has(asked)) openSaint(asked, { fly: true });
    else sidebar.showTab('search');
  }

  loader.remove();
}

start().catch((error) => {
  console.error(error);
  loader.classList.add('is-error');
  loaderText.textContent = t('app.error');
});
