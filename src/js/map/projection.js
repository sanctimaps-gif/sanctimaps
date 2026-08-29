/**
 * Projection Mercator sphérique partagée entre le script de génération
 * (Node) et l'application (navigateur).
 *
 * Toutes les géométries sont projetées une seule fois, à la génération, dans
 * un espace « monde » carré de WORLD_SIZE unités de côté. L'application ne
 * fait ensuite que translater / mettre à l'échelle ce même espace, ce qui
 * évite de reprojeter des milliers de points à chaque image.
 */

/** Côté du carré Mercator, en unités monde (~40 m de précision au sol). */
export const WORLD_SIZE = 1000000;

/** Latitude au-delà de laquelle Mercator diverge : on la borne. */
export const MAX_LAT = 84;

const DEG = Math.PI / 180;

export function clampLat(lat) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/** [lon, lat] en degrés -> [x, y] en unités monde. */
export function project(lon, lat) {
  const x = ((lon + 180) / 360) * WORLD_SIZE;
  const phi = clampLat(lat) * DEG;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * WORLD_SIZE;
  return [x, y];
}

/** [x, y] en unités monde -> [lon, lat] en degrés. */
export function unproject(x, y) {
  const lon = (x / WORLD_SIZE) * 360 - 180;
  const t = Math.PI * (1 - 2 * (y / WORLD_SIZE));
  const lat = (2 * Math.atan(Math.exp(t)) - Math.PI / 2) / DEG;
  return [lon, lat];
}
