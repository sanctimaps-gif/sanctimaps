/**
 * Lire et écrire un PNG, sans rien installer.
 *
 * Le projet ne dépend d'aucune bibliothèque pour fonctionner, et l'on n'allait
 * pas ajouter un binaire natif de vingt mégaoctets pour fabriquer six icônes.
 * Un PNG n'est pourtant qu'un en-tête, des lignes filtrées et un flux zlib —
 * et zlib est dans Node depuis toujours.
 *
 * Ce module ne couvre que ce dont les icônes ont besoin : huit bits par
 * composante, RVB ou RVBA, non entrelacé. Tout le reste est refusé bruyamment
 * plutôt que rendu de travers.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Le CRC-32 que la norme PNG exige au bout de chaque bloc. */
const TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * PNG -> { width, height, data } où `data` est du RVBA, quatre octets par pixel.
 *
 * Les cinq filtres de ligne sont défaits ici : ils ne servent qu'à rendre le
 * flux plus compressible, et chacun se lit à partir du pixel de gauche, de
 * celui du dessus, ou des deux.
 */
export function decodePNG(buffer) {
  if (!buffer.slice(0, 8).equals(SIGNATURE)) throw new Error('ce n’est pas un PNG');

  let width = 0;
  let height = 0;
  let channels = 0;
  const parts = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colorType = body[9];
      const interlace = body[12];
      if (depth !== 8) throw new Error(`profondeur ${depth} non gérée : huit bits seulement`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`type de couleur ${colorType} non géré : RVB ou RVBA`);
      if (interlace !== 0) throw new Error('image entrelacée non gérée');
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4, 255);
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth : on garde celui des trois voisins dont l'estimation s'écarte
        // le moins de leur somme.
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`filtre ${filter} inconnu`);
      line[i] = value & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = line[from];
      out[to + 1] = line[from + 1];
      out[to + 2] = line[from + 2];
      out[to + 3] = channels === 4 ? line[from + 3] : 255;
    }

    line.copy(previous);
  }

  return { width, height, data: out };
}

/** { width, height, data } RVBA -> PNG. */
export function encodePNG({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Filtre « aucun » : sur des images de quelques dizaines de pixels, le
    // gain d'un filtre plus savant ne vaut pas le code qu'il demande.
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RVBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Réduction par moyenne de surface.
 *
 * Chaque pixel d'arrivée est la moyenne de tous ceux qu'il recouvre au départ.
 * C'est ce qu'il faut pour descendre de mille pixels à seize : un simple
 * échantillonnage n'y prendrait qu'un pixel sur soixante, et les traits fins —
 * la crosse, l'auréole — disparaîtraient ou scintilleraient au hasard.
 */
export function resize(image, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = image.width / size;
  const sy = image.height / size;

  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let j = y0; j < y1; j += 1) {
        for (let i = x0; i < x1; i += 1) {
          const p = (j * image.width + i) * 4;
          const alpha = image.data[p + 3];
          r += image.data[p] * alpha;
          g += image.data[p + 1] * alpha;
          b += image.data[p + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }
      const to = (y * size + x) * 4;
      // Les couleurs sont moyennées pondérées par l'opacité : sans cela, un
      // bord transparent tirerait la teinte vers le noir.
      out[to] = a ? Math.round(r / a) : 0;
      out[to + 1] = a ? Math.round(g / a) : 0;
      out[to + 2] = a ? Math.round(b / a) : 0;
      out[to + 3] = Math.round(a / n);
    }
  }

  return { width: size, height: size, data: out };
}

/** Découpe un rectangle, en coordonnées de pixels. */
export function crop(image, x, y, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let j = 0; j < height; j += 1) {
    const from = ((y + j) * image.width + x) * 4;
    image.data.copy(out, j * width * 4, from, from + width * 4);
  }
  return { width, height, data: out };
}

/**
 * Un fichier ICO, qui n'est qu'un sommaire suivi d'images.
 *
 * Depuis Vista, une entrée peut porter un PNG tel quel plutôt qu'un bitmap :
 * on écrit donc les mêmes images que pour le reste, sans second encodeur.
 */
export function encodeICO(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // 1 = icône
  head.writeUInt16LE(images.length, 4);

  const entries = [];
  const bodies = [];
  let offset = 6 + images.length * 16;

  for (const image of images) {
    const png = encodePNG(image);
    const entry = Buffer.alloc(16);
    entry[0] = image.width >= 256 ? 0 : image.width; // 0 veut dire 256
    entry[1] = image.height >= 256 ? 0 : image.height;
    entry[2] = 0; // palette : aucune
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // plans
    entry.writeUInt16LE(32, 6); // bits par pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(png);
    offset += png.length;
  }

  return Buffer.concat([head, ...entries, ...bodies]);
}
