/**
 * Poser la carte sur l'écran d'accueil, comme une application.
 *
 * Le manifeste — `site.webmanifest` — dit au navigateur ce qu'il faut savoir :
 * le nom, les icônes, la couleur de fond, le fait que la fenêtre s'ouvre sans
 * barre d'adresse. Reste à proposer l'installation, et c'est là que les
 * navigateurs cessent de se ressembler.
 *
 * **Chrome, Edge, et les navigateurs d'Android** émettent `beforeinstallprompt`
 * quand ils jugent le site installable. On le retient — au lieu de laisser le
 * navigateur poser sa propre bannière — pour l'offrir dans les réglages, où le
 * lecteur le trouvera quand il le voudra plutôt que quand le navigateur l'aura
 * décidé.
 *
 * **Safari, sur iPhone et sur Mac, n'a pas cette API du tout.** Aucun bouton ne
 * peut y installer quoi que ce soit : l'installation passe par le menu de
 * partage, et la seule chose honnête à faire est de dire lequel. Un bouton qui
 * ne ferait rien vaudrait moins qu'une phrase qui explique.
 *
 * **Firefox** ne l'installe pas non plus sur ordinateur ; sur Android, il le
 * propose depuis son propre menu.
 *
 * L'événement arrive souvent avant que la barre latérale existe : on l'écoute
 * donc dès le chargement du module, et la partie Réglages vient demander plus
 * tard ce qui a été retenu.
 */

/** Le `beforeinstallprompt` retenu, tant qu'il n'a pas servi. */
let differe = null;

/** Ceux qui veulent être prévenus quand l'état change. */
const ecouteurs = new Set();

function prevenir() {
  for (const fn of ecouteurs) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sans cela, le navigateur pose sa propre bannière au moment qui lui
    // plaît. On préfère un bouton que le lecteur trouve quand il le cherche.
    event.preventDefault();
    differe = event;
    prevenir();
  });

  // L'installation faite, le bouton n'a plus lieu d'être.
  window.addEventListener('appinstalled', () => {
    differe = null;
    prevenir();
  });
}

/**
 * Enregistre le service worker, qui rend l'installation possible.
 *
 * Chrome ne propose l'installation d'un site que s'il sait répondre hors
 * ligne : sans ce fichier, aucun `beforeinstallprompt` ne serait émis et le
 * bouton des réglages ne paraîtrait jamais. Voir `sw.js`, qui va au réseau
 * d'abord et ne garde que ce que le lecteur a lui-même ouvert.
 *
 * L'échec n'a aucune conséquence visible : sur un navigateur qui n'en veut pas
 * — ou depuis un fichier local, où l'API n'existe pas —, la carte fonctionne
 * exactement comme avant, et les réglages disent alors la marche à suivre à la
 * main.
 */
export function enregistrerServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost'
    && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    // La portée est celle du dossier du fichier : posé à la racine, il couvre
    // la carte et les cinq mille pages.
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

export function onInstallChange(fn) {
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
}

/** La carte tourne-t-elle déjà comme une application installée ? */
export function estInstallee() {
  if (typeof window === 'undefined') return false;
  // Deux façons de le savoir, parce que Safari ne connaît que la seconde.
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

/**
 * Le chemin d'installation offert par ce navigateur.
 *
 *   'installee'  c'est déjà fait
 *   'bouton'     le navigateur a proposé : un vrai bouton installe
 *   'ios'        iPhone ou iPad : par le menu de partage
 *   'safari'     Safari sur Mac : par le menu Fichier
 *   'firefox'    Firefox : par son propre menu, et pas sur ordinateur
 *   'aucun'      rien à proposer, ou pas encore
 */
export function cheminInstallation() {
  if (estInstallee()) return 'installee';
  if (differe) return 'bouton';

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  // Un iPad récent se présente comme un Mac : le tactile le trahit.
  const tactile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || (/iPad|Macintosh/.test(ua) && tactile && /Safari/.test(ua))) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'safari';
  return 'aucun';
}

/**
 * Demande l'installation, et rend ce que le lecteur a répondu.
 *
 * Le navigateur ne donne l'invite qu'une fois : refusée, elle n'est pas
 * rejouable, et l'on oublie donc l'événement plutôt que de laisser un bouton
 * qui ne ferait plus rien.
 */
export async function installer() {
  if (!differe) return 'indisponible';
  const invite = differe;
  differe = null;
  try {
    invite.prompt();
    const { outcome } = await invite.userChoice;
    prevenir();
    return outcome === 'accepted' ? 'acceptee' : 'refusee';
  } catch {
    prevenir();
    return 'indisponible';
  }
}
