import { loadAtlas } from './data.js';
import { getDirection, getLanguage, onLanguageChange, t } from './i18n.js';
import { MapView } from './map/view.js';
import { AddPanel } from './ui/addForm.js';
import { DetailPanel } from './ui/detail.js';
import { SearchPanel } from './ui/search.js';
import { Sidebar } from './ui/sidebar.js';
import { TopBar } from './ui/topbar.js';

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const stage = document.getElementById('stage');
const mapHost = document.getElementById('map-host');
const app = document.getElementById('app');

document.documentElement.lang = getLanguage();
document.documentElement.dir = getDirection();
loaderText.textContent = t('app.loading');

async function start() {
  const atlas = await loadAtlas();

  const map = new MapView(mapHost, atlas, {
    continentName: (id) => t(`continent.${id}`),
    onCountry: (id) => openCountryFromMap(id),
    onSaint: (id) => openSaint(id),
    onBackground: () => goBack(),
  });

  const searchPanel = new SearchPanel(atlas, { onSelect: (id) => openSaint(id, { fly: true }) });

  const detailPanel = new DetailPanel(atlas, {
    onBack: () => sidebar.backToSearch(),
    onLocate: (saint) => flyToSaint(saint),
    onRemove: (saint) => {
      atlas.removeSaint(saint.id);
      map.syncCountryClasses();
      map.refreshOverlay();
      searchPanel.render();
      addPanel.render();
      sidebar.backToSearch();
      topBar.render();
    },
  });

  const addPanel = new AddPanel(atlas, {
    onAdd: (draft) => {
      const { saint } = atlas.addSaint(draft);
      map.syncCountryClasses();
      map.refreshOverlay();
      searchPanel.render();
      topBar.render();
      flyToSaint(saint);
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

  const sidebar = new Sidebar(app, { searchPanel, addPanel, detailPanel });

  const topBar = new TopBar(stage, atlas, {
    onWorld: () => goWorld(),
    onContinent: (id) => goContinent(id),
  });

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
    if (map.countryId !== saint.country) goCountry(saint.country);
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

  onLanguageChange(() => {
    sidebar.retranslate();
    topBar.render();
    map.setLanguage(getLanguage());
  });

  map.setLanguage(getLanguage());
  goWorld();
  loader.remove();
}

start().catch((error) => {
  console.error(error);
  loader.classList.add('is-error');
  loaderText.textContent = t('app.error');
});
