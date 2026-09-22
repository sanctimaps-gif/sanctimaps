import {
  activerArrierePlan, apercuDuJour, arrierePlanConnu, desactiverArrierePlan,
  etatArrierePlan, onArrierePlanChange,
} from '../background.js';
import { buildDailyReminders, downloadCalendar } from '../calendar.js';
import { formatDay, getLanguage, t } from '../i18n.js';
import { field, fill, h, select } from './dom.js';

/**
 * Rappel quotidien du saint du jour.
 *
 * Deux chemins, et ils ne valent pas la même chose — autant le dire plutôt que
 * de laisser croire à une notification qui n'arriverait jamais :
 *
 * - **Le calendrier du téléphone.** C'est celui qui marche vraiment. Le
 *   fichier produit ici contient un événement par jour pourvu, répété tous les
 *   ans, avec une alarme à l'heure choisie ; une fois ajouté, c'est le
 *   téléphone qui prévient, hors ligne, sans compte et sans que l'application
 *   soit ouverte.
 * - **Le réveil en arrière-plan.** Le navigateur réveille lui-même le service
 *   worker, à peu près une fois par jour, et celui-ci écrit la notification —
 *   sans serveur et sans que rien sorte de l'appareil. Il y faut Chrome et
 *   l'application posée sur l'écran d'accueil, et c'est le navigateur qui
 *   choisit l'heure.
 * - **La notification du navigateur.** Elle ne peut se produire que si la page
 *   tourne. C'est le dernier recours, et le moins fiable.
 */

const KEY = 'sanctimaps.reminder.v1';
const HOURS = [6, 7, 8, 9, 10, 12, 18, 20, 21];

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      hour: HOURS.includes(raw.hour) ? raw.hour : 8,
      notify: Boolean(raw.notify),
      lastShown: typeof raw.lastShown === 'string' ? raw.lastShown : '',
    };
  } catch {
    return { hour: 8, notify: false, lastShown: '' };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sans stockage, le réglage vaut pour la session et disparaît ensuite.
  }
}

export class ReminderPanel {
  constructor(atlas) {
    this.atlas = atlas;
    this.state = read();
    this.root = h('div', { class: 'reminder' });
    /** Où en est le réveil quotidien ; connu de façon asynchrone. */
    this.fond = 'inconnu';
    this.message = '';
    this.render();
    this.watch();
    this.suivreArrierePlan();
  }

  /**
   * L'état du réveil se demande au navigateur, donc il arrive après coup.
   *
   * La partie se dessine d'abord sans lui — on n'attend pas pour montrer le
   * reste des réglages — puis se redessine quand la réponse vient, et chaque
   * fois qu'elle change.
   */
  suivreArrierePlan() {
    const relire = async () => {
      const etat = await etatArrierePlan();
      if (etat === this.fond) return;
      this.fond = etat;
      this.render();
    };
    relire();
    this.stopArrierePlan = onArrierePlanChange(relire);
  }

  async basculerArrierePlan(voulu) {
    if (!voulu) {
      await desactiverArrierePlan();
      this.message = '';
      this.fond = await etatArrierePlan();
      this.render();
      return;
    }
    const reponse = await activerArrierePlan();
    this.message = reponse === 'refuse' ? t('reminder.backgroundRefused') : '';
    this.fond = await etatArrierePlan();
    this.render();
  }

  async apercu() {
    const reponse = await apercuDuJour();
    this.message = reponse === 'envoye' ? '' : t('reminder.backgroundRefused');
    this.render();
  }

  save() {
    write(this.state);
  }

  /** Les fêtes du corpus, rangées par jour. */
  byDay() {
    const map = new Map();
    for (const saint of this.atlas.saints) {
      if (!saint.feast) continue;
      const list = map.get(saint.feast);
      if (list) list.push(saint);
      else map.set(saint.feast, [saint]);
    }
    return map;
  }

  names(saints) {
    const lang = getLanguage();
    return saints.map((s) => this.atlas.saintName(s, lang)).join(', ');
  }

  /** Le fichier d'agenda, que le téléphone gardera. */
  download() {
    const lang = getLanguage();
    const content = buildDailyReminders(this.byDay(), {
      hour: this.state.hour,
      title: t('reminder.calendarName'),
      summary: (saints) => t('reminder.summary', { names: this.names(saints) }),
      describe: (saints) => saints
        .map((s) => `${this.atlas.saintName(s, lang)} — ${s.city}, `
          + `${this.atlas.countryName(s.country, lang)}`)
        .join('\n'),
    });
    downloadCalendar(content, 'saint-du-jour.ics');
  }

  // -------------------------------------------------------------------------
  // Notification du navigateur, tant que la page est ouverte
  // -------------------------------------------------------------------------

  supported() {
    return typeof Notification !== 'undefined';
  }

  async toggleNotify(wanted) {
    if (!wanted) {
      this.state.notify = false;
      this.save();
      this.render();
      return;
    }
    if (!this.supported()) return;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    this.state.notify = permission === 'granted';
    this.save();
    this.render();
    if (this.state.notify) this.maybeShow();
  }

  /** Une minute suffit : on ne cherche pas la seconde exacte. */
  watch() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.maybeShow(), 60000);
    this.maybeShow();
  }

  /**
   * Montre la notification du jour, une fois par jour et pas avant l'heure.
   *
   * Le repère du dernier jour montré est gardé : rouvrir l'onglet dix fois
   * dans l'après-midi ne doit pas rejouer dix fois la même annonce.
   */
  maybeShow() {
    if (!this.state.notify || !this.supported()) return;
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    if (now.getHours() < this.state.hour) return;
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (this.state.lastShown === key) return;

    const day = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const saints = this.byDay().get(day) || [];
    this.state.lastShown = key;
    this.save();
    if (!saints.length) return;
    try {
      // eslint-disable-next-line no-new
      new Notification(t('reminder.summary', { names: this.names(saints) }), {
        body: formatDay(now),
        tag: 'sanctimaps-jour',
      });
    } catch {
      // Certains navigateurs réservent le constructeur aux service workers.
    }
  }

  render() {
    const hours = HOURS.map((n) => ({
      value: String(n), label: `${String(n).padStart(2, '0')}:00`,
    }));
    const permission = this.supported() ? Notification.permission : 'unsupported';

    fill(this.root, [
      h('h2', { class: 'panel__section', text: t('reminder.title') }),
      h('p', { class: 'field__hint', text: t('reminder.intro') }),

      field(t('reminder.hour'), select(hours, {
        value: String(this.state.hour),
        onchange: (e) => {
          this.state.hour = Number(e.target.value);
          this.state.lastShown = '';
          this.save();
        },
      })),

      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: t('reminder.calendar'),
        onclick: () => this.download(),
      }),
      h('p', { class: 'field__hint', text: t('reminder.calendarHint') }),

      // Le réveil en arrière-plan : pas de serveur, mais des conditions, et
      // elles se disent toutes plutôt que de laisser croire à une promesse.
      h('h3', { class: 'field__label', text: t('reminder.background') }),
      this.fond === 'actif' || this.fond === 'possible'
        ? h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: this.fond === 'actif',
            onchange: (e) => this.basculerArrierePlan(e.target.checked),
          }),
          h('span', { text: t('reminder.backgroundOn') }))
        : null,
      h('p', { class: 'field__hint', text: t(`reminder.background.${this.fond}`) }),
      this.fond === 'actif'
        ? h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: t('reminder.backgroundPreview'),
          onclick: () => this.apercu(),
        })
        : null,
      this.message ? h('p', { class: 'notice notice--pending', text: this.message }) : null,

      // La notification du navigateur ne vaut que page ouverte : le dire est
      // la moitié du réglage.
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: this.state.notify,
          disabled: permission === 'denied' || permission === 'unsupported',
          onchange: (e) => this.toggleNotify(e.target.checked),
        }),
        h('span', { text: t('reminder.browser') })),
      h('p', { class: 'field__hint', text: t('reminder.browserHint') }),
      permission === 'denied'
        ? h('p', { class: 'notice notice--error', text: t('reminder.denied') })
        : null,
      permission === 'unsupported'
        ? h('p', { class: 'notice notice--error', text: t('reminder.unsupported') })
        : null,

      // Le quatrième chemin, et le seul qui ne dépende ni du navigateur ni de
      // l'appareil : la lettre est un fichier réécrit chaque matin, dont
      // chacun s'abonne où il veut. La page dit comment.
      h('h3', { class: 'field__label', text: t('reminder.letter') }),
      h('p', { class: 'field__hint', text: t('reminder.letterHint') }),
      h('a', {
        class: 'btn btn--ghost',
        href: new URL('lettre/', document.baseURI).href,
        text: t('reminder.letter'),
      }),
    ]);
  }
}
