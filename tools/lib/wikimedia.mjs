/**
 * Ce que les deux outils Wikimedia ont en commun.
 *
 * `import-saints.mjs` fabrique des fiches à partir de rien ; `enrich-bios.mjs`
 * ajoute une biographie à des fiches qui existent déjà. Les deux parlent aux
 * mêmes services, avec les mêmes précautions — un service public qui rend un
 * 429 quand on le presse, une API d'extraits qui renomme les titres qu'on lui
 * donne, une introduction d'article qu'il faut réduire sans couper un mot en
 * deux. Ces précautions vivent ici plutôt qu'en deux exemplaires : une règle
 * écrite deux fois finit par diverger.
 */

/** Wikimedia demande qu'un outil se nomme et laisse une adresse de contact. */
export const AGENT = 'SanctiMaps/1.0 (https://github.com/sanctimaps-gif/sanctimaps)';

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * L'avancement, effacé au fur et à mesure sur un terminal.
 *
 * Hors terminal — un atelier de GitHub, une redirection vers un fichier — le
 * retour chariot n'efface rien : il colle les deux cents étapes sur une seule
 * ligne illisible, qui finit dans le message de commit. On n'y écrit donc
 * qu'une ligne de temps en temps.
 */
export function progress(text, { done = false } = {}) {
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${text}`);
    if (done) process.stdout.write('\n');
  } else if (done) {
    process.stdout.write(`${text}\n`);
  }
}

/**
 * Interroge le service SPARQL.
 *
 * Le point d'entrée public rend un 429 quand on le presse : on attend et l'on
 * recommence, trois fois, plutôt que de perdre une heure de collecte.
 */
export async function sparql(endpoint, query, { pause = 300 } = {}) {
  const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': AGENT },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (![429, 502, 503, 504].includes(res.status)) {
      throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`);
    }
    await sleep(pause * (attempt + 2) * 5);
  }
  throw new Error('service surchargé après trois tentatives');
}

/** Titres demandés par appel : la limite de l'API d'extraits pour un anonyme. */
export const EXTRACT_BATCH = 20;

/**
 * Réduit une introduction d'article à une petite biographie.
 *
 * Trois phrases au plus, six cents caractères au plus, et la coupe se fait
 * toujours en fin de phrase : une biographie tronquée au milieu d'un mot se
 * remarque, et discrédite le reste de la fiche.
 */
export function shorten(text, { sentences = 3, maxChars = 600 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const part of parts.slice(0, sentences)) {
    const next = out ? `${out} ${part}` : part;
    if (out && next.length > maxChars) break;
    out = next;
  }
  if (!out) out = parts[0].slice(0, maxChars);
  return out.length > maxChars
    ? `${out.slice(0, maxChars).replace(/\s+\S*$/, '')}…`
    : out;
}

/**
 * Les introductions d'articles, par lots de vingt titres.
 *
 * L'API d'extraits rend le texte déjà débarrassé du balisage, ce qui évite
 * d'avoir à démêler du wiki-texte. Les redirections et les normalisations de
 * titres sont suivies, faute de quoi un article rendu sous son vrai nom ne se
 * rattacherait à rien — ou, pire, se rattacherait au mauvais saint.
 */
export async function extracts(lang, titles, { wikipedia, pause = 300, label = 'biographies' }) {
  const found = new Map();
  const base = wikipedia.replace('{lang}', lang);
  for (let i = 0; i < titles.length; i += EXTRACT_BATCH) {
    const batch = titles.slice(i, i + EXTRACT_BATCH);
    const url = new URL(`${base}/w/api.php`);
    for (const [key, value] of Object.entries({
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exlimit: 'max',
      redirects: '1',
      format: 'json',
      formatversion: '2',
      titles: batch.join('|'),
    })) url.searchParams.set(key, value);

    let data;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch (error) {
      console.warn(`  ${label} ${lang} : ${error.message}`);
      await sleep(pause);
      continue;
    }

    // Le titre demandé n'est pas toujours celui qui revient : on refait le
    // chemin, normalisation puis redirection.
    const moved = new Map();
    for (const step of [data?.query?.normalized, data?.query?.redirects]) {
      for (const { from, to } of step || []) moved.set(from, to);
    }
    const resolve = (title) => {
      let current = title;
      for (let hop = 0; hop < 4 && moved.has(current); hop += 1) current = moved.get(current);
      return current;
    };
    const byTitle = new Map();
    for (const page of data?.query?.pages || []) {
      if (page.extract) byTitle.set(page.title, page.extract);
    }
    for (const title of batch) {
      const extract = byTitle.get(resolve(title));
      if (extract) found.set(title, extract);
    }
    progress(`  ${label} ${lang} : ${found.size}/${titles.length}`,
      { done: i + EXTRACT_BATCH >= titles.length });
    await sleep(pause);
  }
  return found;
}
