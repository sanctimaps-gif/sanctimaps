/**
 * Le service worker de SanctiMaps : le réseau d'abord, le cache en secours.
 *
 * Il est là pour deux raisons, et il faut nommer les deux.
 *
 * La première est technique : Chrome ne propose l'installation d'un site sur
 * l'écran d'accueil que si ce site sait répondre hors ligne. Sans ce fichier,
 * le bouton « Ajouter à l'écran d'accueil » des réglages ne s'afficherait
 * jamais, faute d'un `beforeinstallprompt` à retenir.
 *
 * La seconde est un vrai service : une carte des saints se consulte volontiers
 * dans une église, un cloître ou un train — c'est-à-dire là où le réseau
 * manque. Ce qu'on a déjà regardé reste alors lisible.
 *
 * ## Le réseau d'abord, et pourquoi
 *
 * Un service worker mal réglé est pire que pas de service worker : il fige une
 * ancienne version du site chez le lecteur, parfois pour des mois, et rien de
 * ce qu'on publie ensuite ne l'atteint. Le corpus, lui, change à chaque import.
 *
 * On ne sert donc jamais le cache en premier. Chaque requête part sur le
 * réseau ; si elle aboutit, la réponse est servie *et* rangée pour plus tard ;
 * si elle échoue — hors ligne, tunnel, avion —, on rend ce qu'on avait. Le
 * lecteur connecté voit toujours la dernière version ; le lecteur coupé du
 * réseau voit la dernière qu'il a vue. Aucun des deux ne voit du figé.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne précharge rien d'autre que la coquille. Le site pèse une cinquantaine
 * de mégaoctets — cinq mille pages, cent treize mille localités — et télécharger
 * cela derrière le dos du lecteur serait un abus. Ne se garde que ce qu'il a
 * lui-même ouvert.
 */

/**
 * Le nom du cache porte une version.
 *
 * En changer efface l'ancien à l'activation : c'est la seule façon sûre de se
 * débarrasser d'un cache dont on soupçonne le contenu.
 */
const CACHE = 'sanctimaps-v2';

/** La coquille : de quoi ouvrir la carte quand le réseau manque dès l'abord. */
const COQUILLE = [
  './',
  './index.html',
  './src/css/app.css',
  './site.webmanifest',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  // Le préchargement ne doit pas faire échouer l'installation : une icône
  // introuvable ne vaut pas qu'on renonce à tout le reste.
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(COQUILLE))
    .catch(() => undefined)
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// ---------------------------------------------------------------------------
// Le réveil quotidien
// ---------------------------------------------------------------------------

/**
 * La seule façon, pour un site sans serveur, de prévenir quand il est fermé.
 *
 * Une page web ne tourne pas en arrière-plan : l'onglet fermé, rien ne
 * s'exécute. Deux mécanismes seulement peuvent réveiller du code, et ils ne se
 * valent pas.
 *
 * Le premier, **Web Push**, atteint un appareil éteint — mais il exige un
 * serveur qui garde les abonnements et qui pousse les messages. Ce site est
 * fait de fichiers posés sur un hébergement statique : il n'a pas de serveur, et
 * en ajouter un pour cela seul serait une machine à entretenir, avec des clés,
 * une base d'abonnés et tout ce que cela suppose.
 *
 * Le second, **la synchronisation périodique**, ne demande rien de tel : le
 * navigateur réveille lui-même ce fichier, à peu près une fois par jour, et lui
 * laisse le temps d'écrire une notification. C'est celui-ci qu'on emploie.
 *
 * Il a ses conditions, et les réglages les disent : Chrome et les navigateurs
 * qui en dérivent, l'application posée sur l'écran d'accueil, et le navigateur
 * seul juge du moment — « une fois par jour » veut dire une fois par jour
 * environ, pas à huit heures précises. Qui veut l'heure exacte prend le
 * calendrier du téléphone, qui, lui, ne dépend de personne.
 */
const TAG_QUOTIDIEN = 'saint-du-jour';

/** « 09-17 » pour aujourd'hui, la clef du calendrier. */
function clefDuJour(date = new Date()) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Annonce les saints du jour.
 *
 * Le calendrier abrégé pèse trois cent soixante-quinze kilooctets et ne porte
 * que ce qu'il faut : un nom, une ville, un pays, une adresse. Le corpus entier
 * en pèse cinq mille, et l'on ne réveille pas un téléphone pour lui faire
 * télécharger cela.
 */
async function annoncerLeJour() {
  if (self.Notification?.permission !== 'granted') return;

  let calendrier;
  try {
    const reponse = await fetch('./data/generated/calendar.json', { cache: 'no-cache' });
    if (!reponse.ok) return;
    calendrier = await reponse.json();
  } catch {
    // Réveillé sans réseau : on se tait plutôt que d'annoncer un jour au hasard.
    return;
  }

  const jour = clefDuJour();
  const entree = calendrier[jour];
  const saints = entree?.s || [];
  if (!saints.length) return;

  const noms = saints.slice(0, 3).map((s) => s.n).join(', ');
  const reste = saints.length - 3;
  await self.registration.showNotification('Saint du jour', {
    body: reste > 0 ? `${noms} — et ${reste} autres` : noms,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: `${TAG_QUOTIDIEN}-${jour}`,
    // Le même jour ne se réannonce pas : le navigateur peut réveiller deux
    // fois, et l'étiquette datée fait que la seconde remplace la première.
    renotify: false,
    data: { url: `./calendrier/${entree.u}.html`, jour },
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== TAG_QUOTIDIEN) return;
  event.waitUntil(annoncerLeJour());
});

// Une notification se clique : elle doit ouvrir le jour qu'elle annonce, et
// réutiliser l'onglet déjà ouvert plutôt que d'en empiler un de plus.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = new URL(event.notification.data?.url || './', self.location.href).href;
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const fenetre of fenetres) {
      if (!fenetre.url.startsWith(self.location.origin)) continue;

      // On navigue avant de ramener la fenêtre au premier plan, et non
      // l'inverse : `focus` refuse quand le navigateur ne tient pas le clic
      // pour une action de l'utilisateur, et l'on perdrait alors le jour
      // annoncé pour une fenêtre qu'on n'aurait même pas montrée.
      const apres = 'navigate' in fenetre ? await fenetre.navigate(cible).catch(() => null) : null;
      const vue = apres || fenetre;
      if ('focus' in vue) await vue.focus().catch(() => undefined);
      if (apres) return;
      // La navigation n'a pas pris : plutôt qu'une fenêtre restée sur
      // l'accueil, on ouvre le jour annoncé.
      break;
    }
    await self.clients.openWindow(cible);
  })());
});

// L'application peut demander l'annonce tout de suite, pour montrer à quoi
// elle ressemblera : c'est le bouton « Voir ce que ça donne » des réglages.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'annoncer') event.waitUntil(annoncerLeJour());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne se mêle que des lectures de notre propre site. Les tuiles
  // d'OpenStreetMap et les requêtes vers Wikidata regardent leurs serveurs, pas
  // le nôtre — et une carte du monde entière remplirait le cache pour rien.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const reponse = await fetch(request);
      if (reponse && reponse.ok && reponse.type === 'basic') {
        const copie = reponse.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copie)).catch(() => undefined);
      }
      return reponse;
    } catch (erreur) {
      const garde = await caches.match(request);
      if (garde) return garde;
      // Une page jamais visitée, demandée hors ligne : plutôt que l'écran
      // d'erreur du navigateur, on rend l'accueil, qui sait au moins se
      // présenter et mène au reste.
      if (request.mode === 'navigate') {
        const accueil = await caches.match('./index.html');
        if (accueil) return accueil;
      }
      throw erreur;
    }
  })());
});
