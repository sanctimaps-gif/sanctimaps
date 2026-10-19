/**
 * Relève l'ordre des saints de chaque jour, d'après saintsdujour.fr.
 *
 *   node tools/import-saintsdujour.mjs
 *
 * Le site publie un calendrier par mois (`/?m=10`) : chaque jour y porte son
 * saint principal, puis la liste des autres saints du jour, où les saints
 * « majeurs » sont signalés. C'est cet ordre — le principal, les majeurs, puis
 * les autres — que le saint du jour de la carte reprend pour classer les
 * fiches. On ne garde que les noms, dans l'ordre, par date : rien d'autre du
 * site n'est recopié.
 *
 * Il ne touche qu'un fichier, `data/saintsdujour/ordre.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'saintsdujour', 'ordre.json');
const AGENT = 'SanctiMaps/1.0 (https://github.com/sanctimaps-gif/sanctimaps)';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Les entités HTML d'un nom (« Thérèse de l&#039;Enfant-Jésus »). */
function texte(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function page(mois) {
  for (let essai = 0; essai < 4; essai += 1) {
    try {
      const res = await fetch(`https://saintsdujour.fr/?m=${mois}`, { headers: { 'User-Agent': AGENT } });
      if (res.ok) return await res.text();
    } catch { /* on recommence */ }
    await sleep(1500 * (essai + 1));
  }
  throw new Error(`saintsdujour.fr : mois ${mois} illisible`);
}

/** Les jours d'un mois : « 10-02 » → [principal, majeurs…, autres…]. */
function jours(html, mois) {
  const sortie = {};
  for (const bloc of html.split('<div class="calendar-day').slice(1)) {
    const jour = /class="day-number">\s*(\d{1,2})\s*</.exec(bloc)?.[1];
    if (!jour) continue;
    const cle = `${String(mois).padStart(2, '0')}-${jour.padStart(2, '0')}`;
    const principal = texte(/class="saint-name"[^>]*>([\s\S]*?)<\/a>/.exec(bloc)?.[1]);
    let autres = [];
    const brut = /data-saints='([^']*)'/.exec(bloc)?.[1];
    if (brut) {
      try {
        const liste = JSON.parse(texte(brut).replace(/\s+/g, ' '));
        autres = [...liste.filter((s) => String(s.is_majeur) === '1'), ...liste.filter((s) => String(s.is_majeur) !== '1')]
          .map((s) => texte(s.name));
      } catch { /* liste illisible : le principal suffit */ }
    }
    const noms = [principal, ...autres].filter((n, i, a) => n && a.indexOf(n) === i);
    if (noms.length) sortie[cle] = noms;
  }
  return sortie;
}

async function main() {
  const tous = {};
  for (let mois = 1; mois <= 12; mois += 1) {
    const j = jours(await page(mois), mois);
    Object.assign(tous, j);
    console.log(`  mois ${mois} : ${Object.keys(j).length} jours`);
    await sleep(500);
  }
  const n = Object.keys(tous).length;
  console.log(`Jours relevés : ${n}`);
  for (const d of ['10-01', '10-02', '09-29', '10-07']) if (tous[d]) console.log(`  ${d} : ${tous[d].slice(0, 4).join(' · ')}`);
  if (n < 300) throw new Error(`trop peu de jours relevés (${n}) : la page a sans doute changé, rien n'est écrit.`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({
    source: 'saintsdujour.fr — calendrier des saints (ordre des saints de chaque jour)',
    note: 'Écrit par tools/import-saintsdujour.mjs. Pour chaque jour : le saint principal, les saints majeurs, puis les autres.',
    jours: Object.fromEntries(Object.entries(tous).sort()),
  }, null, 1)}\n`, 'utf8');
  console.log(`Écrit ${OUT}`);
}

await main();
