/**
 * Les emblèmes : une petite image par fiche, tirée de ce qu'elle est.
 *
 * Aucune base ne donne un portrait libre de droits pour quatre mille saints, et
 * une image téléchargée par fiche alourdirait la carte d'autant. On dessine donc,
 * comme les peintres l'ont toujours fait, avec les **attributs** : la tiare du
 * pape, la palme du martyr, la mitre de l'évêque, le lys de la vierge, la
 * couronne du roi. Un regard suffit à les lire, et ils tiennent en quelques
 * traits.
 *
 * Chaque emblème est un dessin au trait sur une grille de 24, en `currentColor` :
 * il suit le thème, clair ou sombre, et la couleur de ce qui le porte — l'écusson
 * d'un repère, la pastille d'une liste. Il est décoratif (`aria-hidden`) : ce
 * qu'il dit, la fiche l'écrit en toutes lettres.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Le nimbe et la silhouette, qui servent à plusieurs dessins.
const NIMBE = ['path', { d: 'M7.5 5.2c0-1.3 2-2.2 4.5-2.2s4.5.9 4.5 2.2-2 2.2-4.5 2.2-4.5-.9-4.5-2.2z' }];
const COEUR = 'M12 20.5s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.5 2.4c0 5.8-7.5 10.4-7.5 10.4z';

/** Les dessins, chacun une suite de [balise, attributs]. */
export const EMBLEMS = {
  // Un saint sans attribut plus précis : le nimbe au-dessus d'une silhouette.
  nimbe: [
    NIMBE,
    ['circle', { cx: 12, cy: 11.5, r: 3 }],
    ['path', { d: 'M5.5 21c0-3.7 2.9-6.2 6.5-6.2s6.5 2.5 6.5 6.2' }],
  ],
  // Le pape : la tiare à trois couronnes, sommée d'une croix.
  tiare: [
    ['path', { d: 'M12 1.8v2.6M10.8 3h2.4' }],
    ['path', { d: 'M8.6 11.5C8.6 7.6 10 5.2 12 4.4c2 .8 3.4 3.2 3.4 7.1' }],
    ['path', { d: 'M8.6 11.5h6.8l.6 4H8l.6-4zM8 15.5h8l.7 4.5H7.3L8 15.5z' }],
  ],
  // Le martyr : la palme.
  palme: [
    ['path', { d: 'M7 21.5C9 15.5 12.5 9 18 3.5' }],
    ['path', { d: 'M8.3 17.3l-3.6 -0.7M8.3 17.3l3.2 1.3M9.8 13.6l-3.4 -0.7M9.8 13.6l3.1 1.2M11.8 10.2l-3.0 -0.6M11.8 10.2l2.7 1.0M14.2 7.2l-2.5 -0.5M14.2 7.2l2.2 0.9M16.6 4.8l-1.9 -0.4M16.6 4.8l1.7 0.7' }],
  ],
  // Le roi, la reine, le prince : la couronne.
  couronne: [
    ['path', { d: 'M4.5 18.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1.5 11z' }],
    ['path', { d: 'M4.5 21h15' }],
  ],
  // Le soldat : l'épée.
  epee: [
    ['path', { d: 'M12 2.2l1.6 12.3h-3.2L12 2.2z' }],
    ['path', { d: 'M7.5 14.5h9M12 14.5v5M10.4 21h3.2' }],
  ],
  // Le docteur de l'Église : le livre et la plume.
  livre: [
    ['path', { d: 'M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z' }],
    ['path', { d: 'M12 6.5v13' }],
  ],
  // L'apôtre, l'évangéliste, le prophète, le prédicateur : le rouleau.
  rouleau: [
    ['path', { d: 'M6 4h11a2 2 0 0 1 0 4H8M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8' }],
    ['path', { d: 'M8 11.5h7M8 14.5h7M8 17.5h4' }],
  ],
  // L'évêque, le cardinal : la mitre.
  mitre: [
    ['path', { d: 'M7 21V10.5L12 3l5 7.5V21z' }],
    ['path', { d: 'M12 3.5V21M7 14h10' }],
  ],
  // L'abbé, l'abbesse : la crosse.
  crosse: [
    ['path', { d: 'M10 21.5V8.5a4.5 4.5 0 1 1 9 0c0 2.3-1.7 3.7-3.6 3.7-1.4 0-2.4-.9-2.4-2.2' }],
    ['path', { d: 'M8 21.5h4' }],
  ],
  // La vierge, la moniale, la religieuse : le lys.
  lys: [
    ['path', { d: 'M12 21.5V11' }],
    ['path', { d: 'M12 11c-3.2 0-5.3-2.6-5.3-6.4 2.1 0 4.2 1.4 5.3 3.2 1.1-1.8 3.2-3.2 5.3-3.2 0 3.8-2.1 6.4-5.3 6.4zM12 7.8V2.5' }],
    ['path', { d: 'M12 18c-2.2 0-3.8-1.2-4.4-3.3 2.2 0 3.8 1.2 4.4 3.3zM12 16.5c2 0 3.4-1 3.9-2.9-2 0-3.4 1-3.9 2.9z' }],
  ],
  // Le moine, l'ermite, le religieux : le chapelet.
  chapelet: [
    ['circle', { cx: 12, cy: 8.5, r: 5.5, 'stroke-dasharray': '0.01 2.6', 'stroke-width': 2.6 }],
    ['path', { d: 'M12 14v7.5M9.8 18h4.4' }],
  ],
  // Le missionnaire, le pèlerin : la coquille.
  coquille: [
    ['path', { d: 'M12 20L3.8 9.2a9.4 9.4 0 0 1 16.4 0z' }],
    ['path', { d: 'M12 20L7.6 5.4M12 20V3.6M12 20l4.4-14.6M9.8 21.5h4.4' }],
  ],
  // Le prêtre, le diacre : le calice et l'hostie.
  calice: [
    ['circle', { cx: 12, cy: 4.2, r: 2.2 }],
    ['path', { d: 'M6.5 8h11c0 4.4-2.4 7-5.5 7s-5.5-2.6-5.5-7zM12 15v4.5M8.5 21h7' }],
  ],
  // Le mystique : le cœur enflammé.
  flamme: [
    ['path', { d: COEUR }],
    ['path', { d: 'M12 7.7c-.8-1.9-.2-3.7 1.5-5.2.1 1.4.9 2.2 1.4 3' }],
  ],
  // Le fondateur : l'église qu'il a bâtie.
  eglise: [
    ['path', { d: 'M3.5 21.5h17M6 21.5v-10l6-5 6 5v10M12 2v4.5M10.4 3.6h3.2M10 21.5V17.5h4v4' }],
  ],

  // --- Les apparitions ---------------------------------------------------
  // La Vierge : le monogramme marial, couronné.
  vierge: [
    ['path', { d: 'M8.5 8.5l.9-3.5 2.6 1.9 2.6-1.9.9 3.5z' }],
    ['path', { d: 'M5.5 20.5v-9l6.5 6.5 6.5-6.5v9' }],
  ],
  // Le Christ : le Sacré-Cœur, surmonté de la croix.
  christ: [
    ['path', { d: 'M12 22s-7-4.3-7-9.7a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2c0 5.4-7 9.7-7 9.7z' }],
    ['path', { d: 'M12 1.8v6M9.8 3.9h4.4' }],
  ],
  // Un ange : les ailes sous le nimbe.
  ange: [
    ['path', { d: 'M9 4.8c0-.9 1.3-1.6 3-1.6s3 .7 3 1.6-1.3 1.6-3 1.6-3-.7-3-1.6z' }],
    ['path', { d: 'M12 20.5c-1.5-4.4-5-7-9-7 .8-3.6 5-5.6 9-2.6 4-3 8.2-1 9 2.6-4 0-7.5 2.6-9 7z' }],
    ['path', { d: 'M12 10.9v9.6' }],
  ],

  // --- Les miracles eucharistiques ---------------------------------------
  // L'ostensoir : l'hostie rayonnante sur son pied.
  ostensoir: [
    ['circle', { cx: 12, cy: 9, r: 3.4 }],
    ['path', { d: 'M12 2v1.6M12 14.4V16M5 9h1.6M17.4 9H19M7 4l1.2 1.2M15.8 12.8L17 14M17 4l-1.2 1.2M8.2 12.8L7 14' }],
    ['path', { d: 'M12 16v3.5M8.5 21.5h7l-1.5-2h-4z' }],
  ],
  // Une accusation portée comme miracle : l'avertissement, non l'ostensoir.
  avertissement: [
    ['path', { d: 'M12 3L2.5 20h19z' }],
    ['path', { d: 'M12 9.5v5M12 17.2v.1' }],
  ],
};

/**
 * Le saint : l'attribut le plus parlant d'abord. Un pape est aussi évêque, un
 * martyr souvent prêtre ; c'est la tiare et la palme qu'on lui a toujours
 * données.
 */
const ORDRE = [
  ['pope', 'tiare'],
  ['martyr', 'palme'],
  ['king', 'couronne'], ['queen', 'couronne'], ['prince', 'couronne'],
  ['soldier', 'epee'],
  ['doctor', 'livre'],
  ['apostle', 'rouleau'], ['evangelist', 'rouleau'], ['prophet', 'rouleau'],
  ['bishop', 'mitre'], ['cardinal', 'mitre'],
  ['abbot', 'crosse'], ['abbess', 'crosse'],
  ['virgin', 'lys'], ['nun', 'lys'],
  ['mystic', 'flamme'],
  ['founder', 'eglise'],
  ['monk', 'chapelet'], ['hermit', 'chapelet'],
  ['missionary', 'coquille'], ['pilgrim', 'coquille'], ['preacher', 'rouleau'],
  ['priest', 'calice'], ['deacon', 'calice'],
];

/** Le nom de l'emblème d'une fiche, quel que soit son corpus. */
export function emblemOf(item) {
  if (!item) return 'nimbe';
  if (item.kind === 'miracle') return item.nature === 'calomnie' ? 'avertissement' : 'ostensoir';
  if (item.kind === 'apparition') {
    // Qui apparaît : la Vierge, quand la fiche ne dit rien — c'est le cas de
    // presque tout ce qu'importe Wikidata.
    const qui = item.qui || 'vierge';
    return qui === 'saint' ? 'nimbe' : EMBLEMS[qui] ? qui : 'vierge';
  }
  const titres = new Set(item.titles || []);
  for (const [titre, nom] of ORDRE) if (titres.has(titre)) return nom;
  // Une religieuse porte le lys, un religieux le chapelet.
  if (titres.has('religious')) return item.sex === 'f' ? 'lys' : 'chapelet';
  return 'nimbe';
}

/** Les pièces d'un emblème, à poser dans un `<svg>` ou un `<g>` déjà là. */
export function emblemParts(name) {
  return (EMBLEMS[name] || EMBLEMS.nimbe).map(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  });
}

/** Un emblème autonome, pour une liste ou une fiche. */
export function emblemSvg(item, className = 'emblem') {
  const name = emblemOf(item);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `${className} ${className}--${item?.kind || 'saint'}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.emblem = name;
  svg.append(...emblemParts(name));
  return svg;
}
