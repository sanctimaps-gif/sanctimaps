/**
 * Fabrique d'éléments HTML.
 *
 *   h('button', { class: 'btn', onclick: fn, text: 'Fermer' })
 *   h('ul', {}, h('li', { text: 'un' }), h('li', { text: 'deux' }))
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

/**
 * Remplace le contenu d'un élément en écartant les enfants absents.
 * `replaceChildren` insérerait sinon le texte « null » pour un enfant nul.
 */
export function fill(node, children) {
  node.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

/** Champ étiqueté, rendu avec le contrôle déjà construit. */
export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field__label', text: label }),
    control,
    hint ? h('span', { class: 'field__hint', text: hint }) : null);
}

/** Liste déroulante ; `options` est une suite de { value, label }. */
export function select(options, { value, onchange, ...attrs } = {}) {
  const node = h('select', { class: 'control', ...attrs });
  for (const option of options) {
    node.append(h('option', { value: option.value, text: option.label,
      selected: option.value === value }));
  }
  if (onchange) node.addEventListener('change', onchange);
  return node;
}
