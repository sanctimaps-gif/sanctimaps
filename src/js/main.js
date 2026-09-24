import { getSession, onSessionChange } from './auth.js';
import { PUBLISHED, loadAtlas } from './data.js';
import { getDirection, getLanguage, onLanguageChange, t } from './i18n.js';
import { MapView } from './map/view.js';
import { AccountPanel } from './ui/account.js';
import { AddPanel } from './ui/addForm.js';
import { AssistantPanel, ModerationPanel } from './ui/admin.js';
import { DailyPanel } from './ui/daily.js';
import { enregistrerServiceWorker } from './install.js';
import { InstallPanel } from './ui/install.js';
import { ReminderPanel } from './ui/reminder.js';
import { DetailPanel } from './ui/detail.js';
import { FicheBar } from './ui/fiche.js';
import { SearchPanel } from './ui/search.js';
import { apply as applyTheme } from './theme.js';
import { Sidebar } from './ui/sidebar.js';
import { TopBar } from './ui/topbar.js';

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const loaderClose = document.getElementById('loader-close');
const loaderGo = document.getElementById('loader-go');
const stage = document.getElementById('stage');
const mapHost = document.getElementById('map-host');
const app = document.getElementById('app');
const ficheHost = document.getElementById('fiche');

applyTheme();
// Avant tout le reste : c'est lui qui rend la carte installable, et qui la
// garde lisible quand le réseau manque.
enregistrerServiceWorker();
document.documentElement.lang = getLanguage();
document.documentElement.dir = getDirection();
loaderText.textContent = t('app.loading');
loaderClose.setAttribute('aria-label', t('app.closeIntro'));
loaderGo.textContent = t('app.seeMap');

/**
 * L'écran de présentation se ferme quand on le ferme, et pas avant.
 *
 * Il partait de lui-même dès que la carte était prête, c'est-à-dire au bout
 * d'une seconde ou deux : personne n'avait le temps de lire. La carte se
 * peuple donc derrière pendant qu'on lit, et l'on sort par la croix du coin,
 * par le bouton du bas, ou par Échap.
 *
 * Le nœud est retiré, non masqué : il couvre tout l'écran, et un calque
 * invisible posé sur la carte intercepterait les gestes.
 */
const intro = document.querySelector('.intro');
let ferme = false;
function fermerIntro() {
  if (ferme) return;
  ferme = true;
  // Ce qui était derrière redevient atteignable : au clavier comme au lecteur
  // d'écran. `aria-modal` seul ne ferait que le promettre.
  app.inert = false;
  if (intro) intro.inert = false;
  loader.classList.add('is-done');
  const parti = () => loader.remove();
  loader.addEventListener('transitionend', parti, { once: true });
  // Un navigateur qui n'anime rien — « prefers-reduced-motion », un onglet en
  // arrière-plan — n'émet jamais l'événement : le repli n'est pas facultatif.
  setTimeout(parti, 400);
}

// Les sorties sont branchées avant le chargement, et non après : si les
// données ne viennent pas, le lecteur doit pouvoir refermer la présentation
// plutôt que de rester enfermé dedans.
loaderClose.addEventListener('click', fermerIntro);
loaderGo.addEventListener('click', fermerIntro);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || ferme) return;
  fermerIntro();
  // La carte écoute Échap elle aussi, pour refermer une fiche ou remonter d'un
  // niveau. Sans cette coupure, la même touche fermerait la présentation *et*
  // ferait reculer une carte que le lecteur n'a pas encore vue.
  event.stopImmediatePropagation();
});

// Tant que la présentation est ouverte, ce qu'elle couvre est hors d'atteinte :
// le calque arrête la souris, `inert` arrête la tabulation et le lecteur
// d'écran. Sans lui, `aria-modal` ne serait qu'une promesse.
app.inert = true;
if (intro) intro.inert = true;

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
    // « Retour aux résultats » ferme la fiche et rouvre la recherche : la fiche
    // ne vit plus dans le tiroir, les deux ne sont plus au même endroit.
    onBack: () => {
      fiche.close();
      sidebar.showTab('search');
    },
    onLocate: (saint) => flyToSaint(saint),
    onEdit: (saint) => {
      addPanel.edit(saint);
      sidebar.showTab('add');
    },
    onRemove: (saint) => {
      atlas.deleteSaint(saint.id);
      // La fiche parlerait d'un saint que le corpus ne connaît plus : elle se
      // ferme avant le rafraîchissement, qui la relirait.
      fiche.close();
      refreshAll();
      sidebar.showTab('search');
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

  // La moitié du bas : la fiche du saint ouvert, la carte gardant l'autre.
  // Elle est construite avant les panneaux qui l'ouvrent.
  const fiche = new FicheBar(ficheHost, detailPanel, {
    onClose: () => map.highlightSaint(null),
    onName: (saint, lang) => atlas.saintName(saint, lang),
  });

  const moderationPanel = new ModerationPanel(atlas, {
    onOpen: (saint) => { map.highlightSaint(saint.id); showFiche(saint); },
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

  // « Ajouter à l'écran d'accueil » : le navigateur peut le proposer à tout
  // moment, la partie se redessine seule quand il le fait.
  const installPanel = new InstallPanel();

  const sidebar = new Sidebar(app, {
    atlas,
    search: searchPanel,
    daily: dailyPanel,
    reminder: reminderPanel,
    install: installPanel,
    add: addPanel,
    detail: detailPanel,
    moderate: moderationPanel,
    assistant: assistantPanel,
    account: accountPanel,
  });

  const topBar = new TopBar(stage, atlas, {
    onWorld: () => goWorld(),
    onContinent: (id) => goContinent(id),
    onCorpus: (nom) => basculerCorpus(nom),
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
    installPanel.render();
    addPanel.render();
    moderationPanel.render();
    assistantPanel.render();
    topBar.render();
    sidebar.sync();
    fiche.refresh();
  }

  /**
   * La carte change de corpus : les saints, ou les apparitions.
   *
   * Seule la carte bouge, et c'est voulu : la recherche, le saint du jour, le
   * rappel et la modération ne connaissent que les saints, et n'ont rien à
   * redessiner. Ce qui doit suivre, c'est la couleur des pays, les repères
   * posés, le compte du pays ouvert et la légende.
   *
   * La fiche ouverte se referme : elle parlerait d'un saint dont la croix n'est
   * plus sur la carte — le même défaut que quitter un pays sans la fermer.
   */
  function basculerCorpus(nom) {
    if (!atlas.setCorpus(nom)) return;
    fiche.close();
    map.highlightSaint(null);
    map.syncCountryClasses();
    map.refreshOverlay();
    topBar.render();
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

  // Quitter le pays laisse la fiche sans son point sur la carte : elle parlerait
  // d'un saint qu'on ne voit plus. Elle se referme donc avec lui.
  function goWorld() {
    fiche.close();
    map.showWorld();
    syncChrome();
  }

  function goContinent(id) {
    fiche.close();
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

  /**
   * Ouvre la fiche dans la moitié du bas, et dégage la carte pour qu'on la voie.
   *
   * Sur petit écran le tiroir recouvre la carte : il se referme, puisque c'est
   * la fiche qui prend le relais. Puis la croix du saint est ramenée dans les
   * moitié restée visible — elle pouvait se trouver juste là où la fiche
   * vient de se poser.
   */
  function showFiche(saint) {
    fiche.show(saint);
    if (!isWide()) sidebar.setOpen(false);
    // La carte vient de perdre la moitié de sa hauteur : elle doit le savoir
    // avant que quoi que ce soit ne recalcule un cadrage.
    map.remeasure();
    map.revealSaint(saint.id);
  }

  function openSaint(id, { fly = false } = {}) {
    // Dans le corpus courant d'abord, dans l'autre ensuite : un repère cliqué
    // sur la carte appartient au corpus affiché, mais une adresse partagée peut
    // nommer l'un ou l'autre.
    const saint = atlas.pointById(id);
    if (!saint) return;
    // Un lien peut nommer une apparition quand la carte montre les saints : elle
    // bascule alors d'elle-même, sans quoi la fiche s'ouvrirait sur un repère
    // absent de la carte.
    basculerCorpus(saint.kind === 'apparition' ? 'apparitions' : 'saints');
    if (fly) flyToSaint(saint);
    else {
      map.highlightSaint(saint.id);
      showFiche(saint);
    }
  }

  function flyToSaint(saint) {
    // La fiche s'ouvre **avant** le vol, et l'ordre compte : c'est elle qui
    // prend la moitié du bas, et le cadrage du pays doit être calculé sur la
    // moitié qui reste. Dans l'autre sens, le vol visait la hauteur
    // d'avant et le pays débordait par le bas en arrivant — on perdait les
    // croix du sud, celles-là mêmes qu'on voulait garder sous les yeux.
    showFiche(saint);
    flyTo(saint.country);
    map.highlightSaint(saint.id);
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
    // Échap ferme d'abord ce qui est ouvert par-dessus, et ne remonte d'un
    // niveau qu'ensuite : sinon une fiche qu'on voulait seulement refermer
    // faisait quitter le pays, et toutes ses croix avec lui.
    if (fiche.open) {
      fiche.close();
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
    fiche.retranslate();
    topBar.render();
    map.setLanguage(getLanguage());
  });

  map.setLanguage(getLanguage());
  goWorld();

  // La carte est là ; les textes longs peuvent venir maintenant. Ils se
  // fondent dans les fiches à leur arrivée, et l'on redessine ce qui les
  // montre — une fiche ouverte entre-temps se complète sous les yeux.
  atlas.ensureTexts();
  atlas.onTextsReady(() => {
    detailPanel.refresh();
    fiche.refresh();
    dailyPanel.render();
  });

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
    if (atlas.pointById(asked)) openSaint(asked, { fly: true });
    else sidebar.showTab('search');
  }

  // La carte est prête : on le dit, et l'on n'en fait pas plus. C'est le
  // lecteur qui décide quand il a fini de lire — la croix du coin ne mène plus
  // à une page en chantier, et c'est tout ce qu'il avait besoin de savoir.
  if (!ferme) {
    loaderText.textContent = t('app.ready');
    loader.classList.add('is-ready');
    // Le clavier arrive sur la sortie plutôt qu'en tête d'un texte de trois
    // cents mots : l'écran couvre tout, et rien d'autre n'y est à faire.
    loaderClose.focus({ preventScroll: true });
  }
}

start().catch((error) => {
  console.error(error);
  loader.classList.add('is-error');
  loaderText.textContent = t('app.error');
});
