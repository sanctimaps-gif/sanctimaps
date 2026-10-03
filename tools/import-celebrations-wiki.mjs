/**
 * Une page provisoire pour chaque célébration de l'AELF que rien ne couvre.
 *
 *   node tools/import-celebrations-wiki.mjs
 *
 * Les pages des célébrations sans fiche s'écrivent à la main, dans
 * `data/aelf/celebrations.json`. Mais le calendrier se relève chaque mois, et
 * une fête nouvelle — une mémoire ajoutée au calendrier romain, un intitulé qui
 * change — peut arriver avant qu'on l'ait écrite. Plutôt que de la laisser sans
 * rien, on cherche son article sur Wikipédia en français et l'on en garde le
 * résumé, avec le lien : `data/aelf/celebrations-auto.json`, que la carte lit
 * après les pages écrites à la main.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sansFiche } from './aelf-sans-fiche.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'aelf', 'celebrations-auto.json');
const AGENT = 'SanctiMaps/1.0 (https://github.com/sanctimaps-gif/sanctimaps)';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** « S. Denis, évêque, et ses compagnons » → « saint Denis ». */
function requete(titre) {
  return titre.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/^(?:Ss?|Sts?)\.?\s+/i, 'saint ')
    .replace(/^Stes?\.?\s+/i, 'sainte ')
    .split(/,|\. M[ée]moire/)[0]
    .trim();
}

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
  return res.ok ? res.json() : null;
}

async function main() {
  const manquent = sansFiche({ sansAuto: true });
  console.log(`${manquent.length} célébrations sans fiche ni page écrite.`);
  const celebrations = {};
  for (const c of manquent) {
    const q = requete(c.titre);
    const recherche = await json(`https://fr.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query', list: 'search', srsearch: q, srlimit: '1', format: 'json',
    })}`);
    const titre = recherche?.query?.search?.[0]?.title;
    if (!titre) { console.log(`  ${c.titre} : rien trouvé`); continue; }
    const resume = await json(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre)}`);
    const extrait = resume?.extract?.trim();
    if (!extrait) continue;
    celebrations[c.cle] = {
      page: {
        titre: c.titre.split(/\. M[ée]moire/)[0],
        texte: [extrait],
        sources: [{ titre: `Wikipédia — ${resume.title}`, url: resume.content_urls?.desktop?.page
          || `https://fr.wikipedia.org/wiki/${encodeURIComponent(titre)}` }],
        auto: true,
      },
    };
    console.log(`  ${c.titre} → ${resume.title}`);
    await sleep(300);
  }
  writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikipédia en français, résumés des articles (CC BY-SA)',
    note: 'Écrit par tools/import-celebrations-wiki.mjs. Pages provisoires : une page écrite'
      + ' dans celebrations.json passe toujours avant.',
    celebrations,
  }, null, 1)}\n`, 'utf8');
  console.log(`Pages provisoires : ${Object.keys(celebrations).length}`);
}

await main();
