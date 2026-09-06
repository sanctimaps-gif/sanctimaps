/**
 * Fabrique les icônes du site à partir du logo.
 *
 *   node tools/make-icons.mjs                     # depuis data/brand/logo.png
 *   node tools/make-icons.mjs --source autre.png
 *   node tools/make-icons.mjs --preview           # une planche pour juger à l'œil
 *
 * ## Pourquoi trois recadrages et non un seul
 *
 * Le logo est une carte de visite : un planisphère, une silhouette auréolée,
 * puis « SAINTS » et « CARTE MONDIALE DE L'ÉGLISE CATHOLIQUE ». C'est très
 * bien à deux cents pixels, et illisible à seize — à cette taille, le mot
 * SAINTS fait deux pixels de haut et le planisphère devient du bruit turquoise.
 *
 * Réduire bêtement le logo entier donnerait donc une tache. On en tire trois
 * cadrages, du plus complet au plus resserré, et chaque taille prend celui
 * qu'elle peut porter :
 *
 *   512, 192, 180  la carte entière, texte compris — l'icône d'application
 *    64,  48       l'emblème seul : planisphère et silhouette, sans le texte
 *    32,  16       la silhouette auréolée, la seule forme qui survive à seize
 *
 * Les trois viennent de la même image et gardent la même crème et le même bleu
 * de nuit : on reconnaît la marque à toutes les tailles, sans jamais lire un
 * texte qui ne se lit pas.
 *
 * ## Pourquoi pas une bibliothèque
 *
 * Le projet ne dépend de rien pour fonctionner, et six icônes ne valent pas
 * vingt mégaoctets de binaire natif. `tools/lib/png.mjs` lit et écrit le PNG
 * avec le seul `zlib` de Node ; l'ICO n'est qu'un sommaire suivi de PNG.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  crop, decodePNG, encodeICO, encodePNG, resize,
} from './lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  source: join(ROOT, 'data', 'brand', 'logo.png'),
  out: join(ROOT, 'icons'),
  preview: false,
};

/**
 * Les trois cadrages, en pixels de l'image d'origine (1254 × 1254).
 *
 * Ils sont écrits ici plutôt que devinés à l'exécution : une détection
 * automatique se tromperait dès que le logo changerait d'un cheveu, et se
 * tromperait en silence. Un chiffre faux se voit et se corrige ; une heuristique
 * fausse s'explique.
 */
const CADRAGES = {
  // La carte entière, bord doré compris, ramenée au carré.
  carte: { x: 36, y: 42, size: 1181 },
  // L'emblème : le planisphère et la silhouette, coupés juste au-dessus du mot
  // SAINTS. Plus large que haut — le fond crème comble la différence.
  embleme: { x: 152, y: 96, width: 950, height: 730 },
  // La silhouette auréolée, calée sur l'auréole (centre 626, 362). Le cadre
  // est serré à dessein : plus large, la silhouette ne faisait plus que le
  // tiers de la hauteur et se perdait à seize pixels ; plus serré, la crosse
  // et l'auréole sortaient du cadre.
  silhouette: { x: 390, y: 285, size: 470 },
};

/**
 * L'icône « maskable » d'Android, qui n'est pas une icône comme les autres.
 *
 * Le système la rogne à sa guise — cercle, goutte, carré arrondi — et ne
 * garantit que les quatre cinquièmes du centre. Y mettre la carte entière
 * reviendrait à laisser le système couper le bord doré et le bas du texte. On
 * pose donc l'emblème seul au milieu d'un grand carré crème, assez petit pour
 * qu'aucune découpe ne l'entame.
 */
const MASQUABLE = { cadrage: 'embleme', taille: 512, part: 0.62 };

/** Les tailles produites, et le cadrage que chacune peut porter. */
const TAILLES = [
  [512, 'carte'], [192, 'carte'], [180, 'carte'],
  [64, 'embleme'], [48, 'embleme'],
  [32, 'silhouette'], [16, 'silhouette'],
];

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--preview') options.preview = true;
    else if (arg === '--source') options.source = argv[i += 1];
    else if (arg === '--out') options.out = argv[i += 1];
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/** Le fond crème du logo, relevé sur l'image plutôt que recopié de mémoire. */
function fondCreme(image) {
  const p = ((image.height >> 3) * image.width + (image.width >> 3)) * 4;
  return [image.data[p], image.data[p + 1], image.data[p + 2]];
}

/** Pose un rectangle au centre d'un carré de couleur unie. */
function surCarre(piece, side, [r, g, b]) {
  const data = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  const dx = (side - piece.width) >> 1;
  const dy = (side - piece.height) >> 1;
  for (let y = 0; y < piece.height; y += 1) {
    piece.data.copy(data, ((y + dy) * side + dx) * 4, y * piece.width * 4, (y + 1) * piece.width * 4);
  }
  return { width: side, height: side, data };
}

/** Un carré prêt à réduire, pour chacun des trois cadrages. */
function carreDe(source, nom) {
  const c = CADRAGES[nom];
  if (c.size) return crop(source, c.x, c.y, c.size, c.size);
  const piece = crop(source, c.x, c.y, c.width, c.height);
  return surCarre(piece, Math.max(c.width, c.height), fondCreme(source));
}

/** Une planche pour juger à l'œil : chaque taille, grossie au pixel près. */
function planche(images, zoom = 8) {
  const gap = 8;
  const width = images.reduce((n, i) => n + i.width * zoom + gap, gap);
  const height = Math.max(...images.map((i) => i.height)) * zoom + 2 * gap;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 240; data[i * 4 + 1] = 240; data[i * 4 + 2] = 240; data[i * 4 + 3] = 255;
  }
  let dx = gap;
  for (const image of images) {
    for (let y = 0; y < image.height * zoom; y += 1) {
      for (let x = 0; x < image.width * zoom; x += 1) {
        const from = (Math.floor(y / zoom) * image.width + Math.floor(x / zoom)) * 4;
        const to = ((y + gap) * width + x + dx) * 4;
        image.data.copy(data, to, from, from + 4);
      }
    }
    dx += image.width * zoom + gap;
  }
  return { width, height, data };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = decodePNG(readFileSync(options.source));
  console.log(`Source : ${options.source} — ${source.width} × ${source.height}`);

  mkdirSync(options.out, { recursive: true });
  const carres = new Map();
  const produites = [];

  for (const [taille, cadrage] of TAILLES) {
    if (!carres.has(cadrage)) carres.set(cadrage, carreDe(source, cadrage));
    const image = resize(carres.get(cadrage), taille);
    const nom = taille === 180 ? 'apple-touch-icon.png' : `icon-${taille}.png`;
    const png = encodePNG(image);
    writeFileSync(join(options.out, nom), png);
    produites.push({ taille, cadrage, nom, image, poids: png.length });
  }

  // L'icône masquable : l'emblème réduit puis posé au centre d'un carré crème.
  const dedans = resize(carres.get(MASQUABLE.cadrage),
    Math.round(MASQUABLE.taille * MASQUABLE.part));
  const masquable = surCarre(dedans, MASQUABLE.taille, fondCreme(source));
  const pngMasquable = encodePNG(masquable);
  writeFileSync(join(options.out, 'icon-maskable-512.png'), pngMasquable);
  produites.push({
    taille: MASQUABLE.taille, cadrage: 'masquable', nom: 'icon-maskable-512.png',
    image: masquable, poids: pngMasquable.length,
  });

  // Le fichier ICO reste demandé par les vieux navigateurs et par certains
  // agrégateurs, qui vont le chercher à la racine sans lire le HTML.
  const ico = encodeICO(produites.filter((p) => [16, 32, 48].includes(p.taille)).map((p) => p.image));
  writeFileSync(join(ROOT, 'favicon.ico'), ico);

  for (const p of produites) {
    console.log(`  ${String(p.taille).padStart(3)}  ${p.cadrage.padEnd(11)} ${p.nom.padEnd(22)} ${String(p.poids).padStart(6)} o`);
  }
  console.log(`   ico  16+32+48   favicon.ico            ${String(ico.length).padStart(6)} o`);

  if (options.preview) {
    const petites = produites.filter((p) => p.taille <= 64).map((p) => p.image).reverse();
    writeFileSync(join(options.out, 'planche.png'), encodePNG(planche(petites)));
    console.log(`\nPlanche de contrôle : ${join(options.out, 'planche.png')}`);
  }
}

main();
