/**
 * Recherche d'un saint sur Internet.
 *
 * L'assistant interroge deux services de la fondation Wikimedia, directement
 * depuis le navigateur : **Wikidata** pour les faits — dates, lieu de
 * naissance, lieu de mort, coordonnées, jour de fête, patronage, qualités — et
 * **Wikipédia** pour le récit. Aucun serveur intermédiaire, aucune clé, aucun
 * compte : les deux acceptent les requêtes d'origine tierce, ce qui laisse
 * l'application entièrement statique.
 *
 * Le choix de la source n'est pas indifférent. Un modèle de langue restitue
 * ses souvenirs et se trompe avec assurance ; Wikidata rend des champs
 * structurés, datés, et *sourcés* — chaque fiche composée ici garde l'adresse
 * de ce qui l'a nourrie, ce qui permet à l'administrateur de vérifier et au
 * lecteur de remonter. C'est aussi une obligation : le texte de Wikipédia est
 * sous licence CC BY-SA, et l'attribution voyage avec lui.
 *
 * Ce que ces services ignorent, l'assistant le laisse vide.
 */

/** Point d'entrée de l'API MediaWiki de Wikidata. */
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

/** Langues où chercher un article, dans l'ordre de préférence. */
const ARTICLE_LANGS = ['fr', 'en'];

/** Délai au-delà duquel on renonce : mieux vaut un échec qu'une attente muette. */
const TIMEOUT = 15000;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Qualités reconnues, par le libellé anglais de la profession ou de la
 * fonction. On compare des mots plutôt que des identifiants : les libellés de
 * Wikidata sont stables et lisibles, là où une liste de « Q12345 » recopiée de
 * mémoire serait invérifiable — et fausse sans qu'on le voie.
 */
const TITLE_BY_LABEL = [
  [/\bpope\b/, 'pope'],
  [/\bcardinal\b/, 'cardinal'],
  [/\b(arch)?bishop\b/, 'bishop'],
  [/\babbess\b/, 'abbess'],
  [/\babbot\b/, 'abbot'],
  [/\bdeacon\b/, 'deacon'],
  [/\bpriest\b|\bpresbyter\b/, 'priest'],
  [/\bnun\b|\bsister\b/, 'nun'],
  [/\bmonk\b|\bfriar\b/, 'monk'],
  [/\bhermit\b|\banchorite\b/, 'hermit'],
  [/\bmartyr\b/, 'martyr'],
  [/\bmissionary\b/, 'missionary'],
  [/\bmystic\b/, 'mystic'],
  [/\bpreacher\b/, 'preacher'],
  [/\bfounder\b/, 'founder'],
  [/\btheologian\b|\bdoctor of the church\b/, 'doctor'],
  [/\bapostle\b/, 'apostle'],
  [/\bevangelist\b/, 'evangelist'],
  [/\bprophet\b/, 'prophet'],
  [/\bqueen\b|\bempress\b/, 'queen'],
  [/\bking\b|\bemperor\b/, 'king'],
  [/\bprince\b|\bduke\b/, 'prince'],
  [/\bsoldier\b|\bknight\b/, 'soldier'],
  [/\bvirgin\b/, 'virgin'],
  [/\bwidow\b/, 'widow'],
  [/\bpilgrim\b/, 'pilgrim'],
  [/\breligious\b/, 'religious'],
];

async function json(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function api(params) {
  const url = new URL(WIKIDATA);
  // `origin=*` obtient les en-têtes qui autorisent la requête d'origine tierce.
  for (const [key, value] of Object.entries({ format: 'json', origin: '*', ...params })) {
    url.searchParams.set(key, String(value));
  }
  return json(url.toString());
}

/** Valeurs d'une propriété, snaks vides écartés. */
function claims(entity, property) {
  return (entity?.claims?.[property] || [])
    .filter((c) => c.mainsnak?.snaktype === 'value')
    .map((c) => c.mainsnak.datavalue?.value)
    .filter(Boolean);
}

function firstId(entity, property) {
  return claims(entity, property)[0]?.id || null;
}

function label(entity, lang) {
  return entity?.labels?.[lang]?.value || entity?.labels?.en?.value
    || entity?.labels?.fr?.value || '';
}

/**
 * Année d'un instant Wikidata.
 *
 * Le format porte un signe et une précision : « +1381-00-00T00:00:00Z » ne dit
 * que l'année, « -0044-03-15T… » dit un jour avant Jésus-Christ. On ne retient
 * que l'année, seule chose que le corpus enregistre, et l'on renvoie `null`
 * quand la précision est plus grossière qu'un siècle.
 */
function yearOf(value) {
  if (!value?.time) return null;
  if (value.precision != null && value.precision < 7) return null;
  const match = /^([+-])(\d{4,})/.exec(value.time);
  if (!match) return null;
  const year = Number(match[2]);
  if (!year) return null;
  return match[1] === '-' ? -year : year;
}

/** « March 6 » ou « 6 March » -> « 03-06 ». */
function feastOf(dayLabel) {
  const text = String(dayLabel || '').toLowerCase();
  const month = MONTHS.findIndex((name) => text.includes(name));
  if (month < 0) return '';
  const day = /(\d{1,2})/.exec(text);
  if (!day) return '';
  const n = Number(day[1]);
  if (n < 1 || n > 31) return '';
  return `${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

async function entities(ids, languages) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const out = {};
  // L'API accepte cinquante identifiants par appel ; au-delà elle refuse tout.
  for (let i = 0; i < unique.length; i += 50) {
    const data = await api({
      action: 'wbgetentities',
      ids: unique.slice(i, i + 50).join('|'),
      props: 'labels|claims|sitelinks|descriptions',
      languages: languages.join('|'),
    });
    Object.assign(out, data.entities || {});
  }
  return out;
}

/**
 * Cherche des personnes portant ce nom.
 *
 * Wikidata rend aussi bien l'église Sainte-Colette que la sainte elle-même :
 * on ne garde donc que les êtres humains, et l'on écarte ceux dont on ne sait
 * ni la naissance ni la mort, qui ne pourraient de toute façon pas entrer au
 * corpus.
 */
export async function searchSaints(query, lang) {
  const found = await api({
    action: 'wbsearchentities',
    search: String(query || '').trim(),
    language: lang,
    uselang: lang,
    type: 'item',
    limit: 20,
  });
  const ids = (found.search || []).map((r) => r.id);
  if (!ids.length) return [];

  const langs = [...new Set([lang, 'fr', 'en'])];
  const items = await entities(ids, langs);

  const out = [];
  for (const id of ids) {
    const entity = items[id];
    if (!entity) continue;
    if (!claims(entity, 'P31').some((v) => v.id === 'Q5')) continue;
    const born = yearOf(claims(entity, 'P569')[0]);
    const died = yearOf(claims(entity, 'P570')[0]);
    if (born == null && died == null) continue;
    out.push({
      id,
      label: label(entity, lang),
      description: entity.descriptions?.[lang]?.value
        || entity.descriptions?.en?.value || '',
      born,
      died,
      entity,
    });
  }
  return out;
}

/**
 * Complète un résultat : lieux, coordonnées, pays, fête, patronage, récit.
 *
 * Ce second temps n'a lieu que pour le candidat retenu. Résoudre les lieux des
 * vingt réponses d'une recherche ferait vingt fois le travail pour dix-neuf
 * fiches qu'on ne veut pas.
 */
export async function detailSaint(found, lang) {
  const entity = found.entity;
  const langs = [...new Set([lang, 'fr', 'en'])];

  const birthId = firstId(entity, 'P19');
  const deathId = firstId(entity, 'P20');
  const feastIds = claims(entity, 'P841').map((v) => v.id);
  const patronIds = claims(entity, 'P2925').map((v) => v.id);
  const jobIds = [...claims(entity, 'P106'), ...claims(entity, 'P39')].map((v) => v.id);

  const related = await entities(
    [birthId, deathId, ...feastIds, ...patronIds, ...jobIds], langs,
  );

  // Les pays des deux lieux, pour obtenir leur code à trois lettres.
  const countryIds = [birthId, deathId]
    .map((id) => (id ? firstId(related[id], 'P17') : null));
  const countries = await entities(countryIds, langs);

  const place = (id, index) => {
    const item = id ? related[id] : null;
    if (!item) return null;
    const point = claims(item, 'P625')[0];
    const iso = countryIds[index] ? claims(countries[countryIds[index]], 'P298')[0] : null;
    return {
      city: label(item, lang),
      country: typeof iso === 'string' ? iso : '',
      lat: point ? Number(point.latitude) : null,
      lng: point ? Number(point.longitude) : null,
    };
  };

  const titles = [];
  for (const id of jobIds) {
    const text = (related[id]?.labels?.en?.value || '').toLowerCase();
    for (const [pattern, key] of TITLE_BY_LABEL) {
      if (pattern.test(text) && !titles.includes(key)) titles.push(key);
    }
  }

  const feast = feastIds
    .map((id) => feastOf(related[id]?.labels?.en?.value))
    .find(Boolean) || '';

  const patronage = patronIds
    .map((id) => label(related[id], lang))
    .filter(Boolean)
    .join(', ');

  const sex = claims(entity, 'P21').some((v) => v.id === 'Q6581072') ? 'f' : 'm';

  const article = await summary(entity, lang);

  return {
    id: found.id,
    name: label(entity, lang) || found.label,
    sex,
    born: found.born,
    died: found.died,
    feast,
    titles,
    patronage,
    desc: found.description,
    bio: article?.extract || '',
    birth: place(birthId, 0),
    death: place(deathId, 1),
    sources: [
      { label: 'Wikidata', url: `https://www.wikidata.org/wiki/${found.id}` },
      ...(article ? [{ label: `Wikipédia (${article.lang})`, url: article.url }] : []),
    ],
  };
}

/**
 * Le début de l'article, dans la langue de lecture si elle existe.
 *
 * Le texte est repris tel quel et reste sous licence CC BY-SA : c'est
 * précisément pourquoi l'adresse de l'article accompagne la fiche.
 */
async function summary(entity, lang) {
  const wanted = [...new Set([lang, ...ARTICLE_LANGS])];
  for (const code of wanted) {
    const title = entity?.sitelinks?.[`${code}wiki`]?.title;
    if (!title) continue;
    try {
      const data = await json(
        `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      if (data?.extract) {
        return {
          lang: code,
          extract: data.extract,
          url: data.content_urls?.desktop?.page
            || `https://${code}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        };
      }
    } catch {
      // Un article manquant n'empêche pas le reste : on essaie la langue suivante.
    }
  }
  return null;
}
