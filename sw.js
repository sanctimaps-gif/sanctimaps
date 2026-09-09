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
const CACHE = 'sanctimaps-v1';

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
