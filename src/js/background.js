/**
 * Le réveil quotidien, quand l'application est fermée.
 *
 * ## Ce qu'une page web peut, et ce qu'elle ne peut pas
 *
 * Elle ne peut pas « tourner en arrière-plan » : l'onglet fermé, plus rien ne
 * s'exécute, et aucune ligne de JavaScript n'y changera quoi que ce soit. Deux
 * mécanismes seulement peuvent réveiller du code, et il faut les distinguer.
 *
 * **Web Push** atteint un appareil éteint, et c'est le seul qui y parvienne.
 * Mais il suppose un serveur : quelqu'un doit garder la liste des abonnés, et
 * quelqu'un doit pousser le message chaque matin. Ce site est fait de fichiers
 * posés sur un hébergement statique. Lui adjoindre un serveur pour cela seul,
 * ce serait une machine de plus à tenir, avec ses clés et sa base d'abonnés.
 *
 * **La synchronisation périodique** ne demande rien de tel : le navigateur
 * réveille lui-même le service worker, environ une fois par jour, et lui laisse
 * le temps d'écrire une notification. Aucun serveur, aucune donnée personnelle
 * qui sorte de l'appareil. C'est celle-ci qu'on emploie — et il faut dire ses
 * conditions plutôt que de les taire :
 *
 * - **Chrome, Edge et leurs dérivés** seulement. Ni Safari, ni Firefox.
 * - **L'application doit être posée sur l'écran d'accueil.** Un simple onglet
 *   ne suffit pas : le navigateur ne réveille que ce qu'on a installé.
 * - **Le navigateur choisit l'heure.** « Une fois par jour » veut dire une fois
 *   par jour environ, selon qu'il juge le site fréquenté et l'appareil
 *   disponible. Qui veut huit heures pile prend le calendrier du téléphone,
 *   qui ne dépend de personne.
 */

/** L'étiquette que le service worker reconnaît ; la même des deux côtés. */
const TAG = 'saint-du-jour';

/** Un jour, à la seconde près — le navigateur ne fera pas mieux de toute façon. */
const INTERVALLE = 24 * 60 * 60 * 1000;

const ecouteurs = new Set();
const prevenir = () => { for (const fn of ecouteurs) fn(); };

export function onArrierePlanChange(fn) {
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
}

/** Ce navigateur connaît-il la synchronisation périodique ? */
export function arrierePlanConnu() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof ServiceWorkerRegistration !== 'undefined'
    && 'periodicSync' in ServiceWorkerRegistration.prototype;
}

/** L'application tourne-t-elle installée, seule condition du réveil ? */
function installee() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

/**
 * Où en est le réveil quotidien.
 *
 *   'inconnu'      le navigateur ignore la synchronisation périodique
 *   'aInstaller'   il la connaît, mais l'application n'est pas posée
 *   'refuse'       les notifications sont refusées pour ce site
 *   'actif'        le réveil est en place
 *   'possible'     tout est réuni, il n'attend qu'un clic
 */
export async function etatArrierePlan() {
  if (!arrierePlanConnu()) return 'inconnu';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'refuse';
  if (!installee()) return 'aInstaller';
  try {
    const registration = await navigator.serviceWorker.ready;
    const etiquettes = await registration.periodicSync.getTags();
    return etiquettes.includes(TAG) ? 'actif' : 'possible';
  } catch {
    return 'possible';
  }
}

/**
 * Met le réveil en place, ou dit pourquoi il ne s'est pas mis.
 *
 * Deux permissions se demandent, dans cet ordre : celle d'afficher une
 * notification — sans quoi le réveil n'aurait rien à faire —, puis celle de
 * réveiller le service worker, que Chrome accorde sans rien demander à
 * personne mais refuse si le site ne lui paraît pas assez fréquenté.
 */
export async function activerArrierePlan() {
  if (!arrierePlanConnu()) return 'inconnu';

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    const reponse = await Notification.requestPermission();
    if (reponse !== 'granted') { prevenir(); return 'refuse'; }
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.periodicSync.register(TAG, { minInterval: INTERVALLE });
    prevenir();
    return 'actif';
  } catch {
    // Chrome refuse sans se justifier quand le site lui paraît peu fréquenté,
    // ou quand l'application n'est pas installée. On ne devine pas à sa place.
    prevenir();
    return 'refuse';
  }
}

export async function desactiverArrierePlan() {
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.periodicSync.unregister(TAG);
  } catch {
    // Rien à retirer : le résultat est celui qu'on voulait.
  }
  prevenir();
}

/**
 * Montre tout de suite la notification du jour.
 *
 * Le réveil, lui, viendra quand le navigateur le décidera — demain, ou après-
 * demain. Sans cet aperçu, on ne saurait pas si le réglage a pris, et l'on
 * attendrait un jour pour l'apprendre.
 */
export async function apercuDuJour() {
  if (typeof Notification === 'undefined') return 'inconnu';
  if (Notification.permission !== 'granted') {
    const reponse = await Notification.requestPermission();
    if (reponse !== 'granted') return 'refuse';
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'annoncer' });
    return 'envoye';
  } catch {
    return 'inconnu';
  }
}
