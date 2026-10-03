/**
 * Relève, jour par jour, ce que la liturgie célèbre, d'après l'AELF.
 *
 *   node tools/import-aelf.mjs
 *   node tools/import-aelf.mjs --depuis 2026-01-01 --jours 800 --zone france
 *
 * Le corpus range chaque saint à une date fixe, et cela ne suffit pas à dire ce
 * que l'Église fête un jour donné : le 2 octobre, ce sont les saints Anges
 * gardiens, qui n'ont pas de fiche ; le 1er octobre, sainte Thérèse de
 * l'Enfant-Jésus passe avant les quinze autres saints de la date ; l'Ascension,
 * le Sacré-Cœur ou le Christ-Roi changent de jour chaque année. L'Association
 * épiscopale liturgique pour les pays francophones publie ce calendrier, jour
 * par jour, pour la France : c'est lui qu'on relève, pour l'année en cours et
 * la suivante.
 *
 * Il ne touche qu'un fichier, `data/aelf/calendrier.json`, que la carte lit
 * telle quelle.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'aelf', 'calendrier.json');
const API = 'https://api.aelf.org/v1/informations';
const AGENT = 'SanctiMaps/1.0 (https://github.com/sanctimaps-gif/sanctimaps)';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function option(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const iso = (d) => d.toISOString().slice(0, 10);

/** Les champs utiles d'une journée, sans les vides. */
const CHAMPS = ['fete', 'jour_liturgique_nom', 'degre', 'couleur', 'temps_liturgique', 'semaine',
  'jour', 'ligne1', 'ligne2', 'ligne3', 'annee'];

async function journee(date, zone) {
  for (let essai = 0; essai < 4; essai += 1) {
    try {
      const res = await fetch(`${API}/${date}/${zone}`, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const info = data.informations || data;
        const garde = {};
        for (const cle of CHAMPS) {
          const v = info?.[cle];
          if (typeof v === 'string' && v.trim()) garde[cle] = v.trim();
        }
        return garde;
      }
      if (res.status === 404) return null;
    } catch { /* réseau : on recommence */ }
    await sleep(1000 * (essai + 1));
  }
  return null;
}

async function main() {
  const zone = option('zone', 'france');
  const debut = new Date(`${option('depuis', `${new Date().getUTCFullYear()}-01-01`)}T12:00:00Z`);
  const jours = Number(option('jours', '760'));
  const sortie = {};
  let manques = 0;
  for (let i = 0; i < jours; i += 1) {
    const d = new Date(debut);
    d.setUTCDate(d.getUTCDate() + i);
    const date = iso(d);
    const j = await journee(date, zone);
    if (j && Object.keys(j).length) sortie[date] = j; else manques += 1;
    if (i === 0) console.log(`Premier jour, ${date} :`, JSON.stringify(j));
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1} / ${jours}`);
    await sleep(120);
  }
  console.log(`Jours relevés : ${Object.keys(sortie).length} (${manques} sans réponse)`);
  if (!Object.keys(sortie).length) throw new Error('L’AELF n’a rien rendu : rien n’est écrit.');
  for (const date of ['2026-10-01', '2026-10-02', '2026-09-29']) {
    if (sortie[date]) console.log(date, JSON.stringify(sortie[date]));
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({
    source: 'AELF — Association épiscopale liturgique pour les pays francophones (aelf.org)',
    zone,
    note: 'Écrit par tools/import-aelf.mjs. Ne pas modifier à la main.',
    jours: sortie,
  }, null, 1)}\n`, 'utf8');
  console.log(`Écrit ${OUT}`);
}

await main();
