/**
 * Le portrait d'une fiche : l'icône, la fresque ou le tableau qui la montre.
 *
 * Presque chaque saint de la carte porte un identifiant Wikidata, et Wikidata
 * donne pour la plupart une image (propriété P18) hébergée sur Wikimedia
 * Commons — le plus souvent une icône ou une peinture ancienne. On la demande
 * **depuis le navigateur, à l'ouverture de la fiche**, et à ce moment-là
 * seulement : quatre mille images embarquées alourdiraient la carte pour des
 * portraits que personne n'aurait demandés.
 *
 * Deux requêtes, sans clé ni serveur, comme le fait déjà l'assistant d'ajout :
 * Wikidata pour le nom du fichier, Commons pour une vignette, l'auteur et la
 * licence. Une image de Commons n'est pas libre de toute condition : beaucoup
 * sont sous CC BY-SA, et le crédit voyage avec elle — auteur, licence, lien vers
 * la page du fichier.
 *
 * Ce qui a été trouvé se garde dans le navigateur : rouvrir une fiche ne
 * redemande rien. Ce qui échoue — pas d'image, réseau coupé — se tait, et la
 * fiche garde son emblème.
 */

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const LARGEUR = 480;
const TIMEOUT = 12000;
const CLE = 'sanctimaps-portraits-v1';
/** Au-delà, les plus anciens s'en vont : le cache ne doit pas grossir sans fin. */
const MAX_GARDES = 600;

const enCours = new Map();
let garde = null;

function lireGarde() {
  if (garde) return garde;
  try {
    garde = JSON.parse(localStorage.getItem(CLE) || '{}') || {};
  } catch {
    garde = {};
  }
  return garde;
}

function ecrireGarde(qid, valeur) {
  const g = lireGarde();
  g[qid] = valeur;
  const cles = Object.keys(g);
  if (cles.length > MAX_GARDES) for (const k of cles.slice(0, cles.length - MAX_GARDES)) delete g[k];
  try { localStorage.setItem(CLE, JSON.stringify(g)); } catch { /* navigation privée, quota : tant pis */ }
}

async function json(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** L'élément Wikidata d'une fiche : dans son identifiant, ou dans ses sources. */
export function qidOf(item) {
  const dansId = /-q(\d+)$/.exec(item?.id || '');
  if (dansId) return `Q${dansId[1]}`;
  for (const source of item?.sources || []) {
    const m = /wikidata\.org\/wiki\/(Q\d+)/.exec(source.url || '');
    if (m) return m[1];
  }
  return null;
}

/** Le texte d'un champ de métadonnées, débarrassé de son HTML. */
function texte(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, ' ').trim();
}

async function chercher(qid) {
  const claims = await json(`${WIKIDATA}?action=wbgetclaims&format=json&origin=*`
    + `&entity=${qid}&property=P18`);
  const liste = claims?.claims?.P18 || [];
  // Le rang « préféré » d'abord : c'est celui que Wikidata désigne quand un
  // saint a plusieurs images.
  const choisie = liste.find((c) => c.rank === 'preferred') || liste.find((c) => c.rank !== 'deprecated');
  const fichier = choisie?.mainsnak?.datavalue?.value;
  if (!fichier) return null;

  const info = await json(`${COMMONS}?action=query&format=json&origin=*&prop=imageinfo`
    + `&iiprop=url|extmetadata&iiurlwidth=${LARGEUR}&titles=${encodeURIComponent(`File:${fichier}`)}`);
  const page = Object.values(info?.query?.pages || {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const meta = ii.extmetadata || {};
  return {
    src: ii.thumburl,
    page: ii.descriptionurl,
    auteur: texte(meta.Artist?.value).slice(0, 120),
    licence: texte(meta.LicenseShortName?.value),
  };
}

/**
 * Le portrait d'une fiche, ou `null`. Une seule requête par élément, même si la
 * fiche est ouverte deux fois pendant qu'elle court.
 */
export function portraitOf(item) {
  // Relevé d'avance par import-portraits : rien à demander à personne.
  if (item?.portrait?.src) return Promise.resolve(item.portrait);
  const qid = qidOf(item);
  if (!qid) return Promise.resolve(null);
  const g = lireGarde();
  if (qid in g) return Promise.resolve(g[qid]);
  if (!enCours.has(qid)) {
    enCours.set(qid, chercher(qid)
      .then((trouve) => { ecrireGarde(qid, trouve); return trouve; })
      // Un échec réseau ne se garde pas : la prochaine ouverture réessaiera.
      .catch(() => null)
      .finally(() => enCours.delete(qid)));
  }
  return enCours.get(qid);
}
