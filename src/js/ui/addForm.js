import { collator, getLanguage, monthNames, t, titleLabel } from '../i18n.js';
import { field, fill, h, select } from './dom.js';

const TITLE_KEYS = [
  'abbess', 'abbot', 'apostle', 'bishop', 'cardinal', 'deacon', 'disciple', 'doctor',
  'evangelist', 'founder', 'hermit', 'king', 'layperson', 'martyr', 'missionary', 'monk',
  'mystic', 'nun', 'pilgrim', 'pope', 'preacher', 'priest', 'prince', 'prophet', 'queen',
  'religious', 'soldier', 'virgin', 'widow', 'youth',
];

const BLANK = {
  name: '', sex: 'm', born: '', died: '', city: '', country: '',
  lat: '', lng: '', month: '', day: '', desc: '', titles: [],
};

/** Formulaire d'ajout d'un saint, enregistré sur l'appareil de l'utilisateur. */
export class AddPanel {
  constructor(atlas, { onAdd, onPick, onCancelPick }) {
    this.atlas = atlas;
    this.onAdd = onAdd;
    this.onPick = onPick;
    this.onCancelPick = onCancelPick;
    this.values = { ...BLANK };
    this.message = null;
    this.root = h('form', { class: 'add', novalidate: true });
    this.render();
  }

  setCoordinates({ lat, lng, country }) {
    this.values.lat = String(lat);
    this.values.lng = String(lng);
    if (country) this.values.country = country;
    this.picking = false;
    this.render();
  }

  /** Sert de valeur par défaut au pays quand un pays est ouvert sur la carte. */
  suggestCountry(countryId) {
    if (!this.values.country && countryId) {
      this.values.country = countryId;
      this.render();
    }
  }

  bind(key) {
    return (event) => {
      this.values[key] = event.target.value;
    };
  }

  render() {
    const lang = getLanguage();
    const cmp = collator();
    const countries = this.atlas.countries
      .map((c) => ({ value: c.id, label: this.atlas.countryName(c.id, lang) }))
      .sort((a, b) => cmp.compare(a.label, b.label));
    const months = monthNames().map((label, i) => ({ value: String(i + 1), label }));
    const titles = TITLE_KEYS
      .map((key) => ({ value: key, label: titleLabel(key, this.values.sex) }))
      .sort((a, b) => cmp.compare(a.label, b.label));

    const titleBox = h('div', { class: 'checks' }, ...titles.map((option) => h('label', {
      class: 'check',
    },
    h('input', {
      type: 'checkbox',
      value: option.value,
      checked: this.values.titles.includes(option.value),
      onchange: (e) => {
        const set = new Set(this.values.titles);
        if (e.target.checked) set.add(option.value); else set.delete(option.value);
        this.values.titles = [...set];
      },
    }),
    h('span', { text: option.label }))));

    fill(this.root, [
      h('p', { class: 'add__intro', text: t('add.intro') }),
      this.message
        ? h('p', { class: `notice notice--${this.message.kind}`, text: this.message.text })
        : null,

      field(t('add.name'), h('input', {
        class: 'control', type: 'text', value: this.values.name, oninput: this.bind('name'),
      })),
      field(t('add.sex'), select(
        [{ value: 'm', label: t('add.male') }, { value: 'f', label: t('add.female') }],
        {
          value: this.values.sex,
          onchange: (e) => { this.values.sex = e.target.value; this.render(); },
        },
      )),

      h('div', { class: 'filters__row' },
        field(t('add.born'), h('input', {
          class: 'control', type: 'number', value: this.values.born, oninput: this.bind('born'),
        })),
        field(t('add.died'), h('input', {
          class: 'control', type: 'number', value: this.values.died, oninput: this.bind('died'),
        }))),
      h('p', { class: 'field__hint', text: t('add.yearHint') }),

      field(t('add.city'), h('input', {
        class: 'control', type: 'text', value: this.values.city, oninput: this.bind('city'),
      })),
      field(t('add.country'), select(
        [{ value: '', label: '—' }, ...countries],
        { value: this.values.country, onchange: this.bind('country') },
      )),

      h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.coords') }),
        h('div', { class: 'filters__row' },
          field(t('add.lat'), h('input', {
            class: 'control', type: 'number', step: 'any', value: this.values.lat,
            oninput: this.bind('lat'),
          })),
          field(t('add.lng'), h('input', {
            class: 'control', type: 'number', step: 'any', value: this.values.lng,
            oninput: this.bind('lng'),
          }))),
        h('button', {
          class: `btn btn--ghost${this.picking ? ' is-active' : ''}`,
          type: 'button',
          text: this.picking ? t('add.picking') : t('add.pick'),
          onclick: () => {
            if (this.picking) {
              this.picking = false;
              this.onCancelPick();
            } else {
              this.picking = true;
              this.onPick();
            }
            this.render();
          },
        })),

      h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.feast') }),
        h('div', { class: 'filters__row' },
          select([{ value: '', label: '—' }, ...months], {
            value: this.values.month, onchange: this.bind('month'), 'aria-label': t('search.feastMonth'),
          }),
          h('input', {
            class: 'control', type: 'number', min: '1', max: '31',
            value: this.values.day, oninput: this.bind('day'), 'aria-label': t('search.feastDay'),
          }))),

      h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.titles') }),
        titleBox),

      field(t('add.desc'), h('textarea', {
        class: 'control control--area',
        rows: '3',
        placeholder: t('add.descPlaceholder'),
        oninput: this.bind('desc'),
      }, this.values.desc)),

      h('button', { class: 'btn btn--primary', type: 'submit', text: t('add.save') }),
      h('p', { class: 'add__count', text: t('add.mineCount', { n: this.atlas.userSaints.length }) }),
      this.atlas.userSaints.length
        ? h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: t('add.export'),
          onclick: () => this.exportMine(),
        })
        : null,
    ]);

    this.root.onsubmit = (event) => {
      event.preventDefault();
      this.submit();
    };
  }

  validate() {
    const v = this.values;
    if (!v.name.trim()) return t('add.errName');
    if (!v.country) return t('add.errCountry');
    const lat = Number(v.lat);
    const lng = Number(v.lng);
    if (!v.lat || !v.lng || Number.isNaN(lat) || Number.isNaN(lng)
      || Math.abs(lat) > 85 || Math.abs(lng) > 180) return t('add.errCoords');
    if (!v.month || !v.day) return t('add.errFeast');
    const day = Number(v.day);
    if (!(day >= 1 && day <= 31)) return t('add.errFeast');
    const born = v.born === '' ? null : Number(v.born);
    const died = v.died === '' ? null : Number(v.died);
    if (born == null && died == null) return t('add.errYears');
    if (born != null && died != null && died < born) return t('add.errYears');
    return null;
  }

  submit() {
    const error = this.validate();
    if (error) {
      this.message = { kind: 'error', text: error };
      this.render();
      this.root.querySelector('.notice')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const v = this.values;
    const lang = getLanguage();
    const pad = (n) => String(n).padStart(2, '0');
    const saint = {
      name: { [lang]: v.name.trim() },
      sex: v.sex,
      born: v.born === '' ? null : Number(v.born),
      died: v.died === '' ? null : Number(v.died),
      city: v.city.trim() || '—',
      country: v.country,
      lat: Number(v.lat),
      lng: Number(v.lng),
      feast: `${pad(Number(v.month))}-${pad(Number(v.day))}`,
      titles: [...v.titles],
      desc: v.desc.trim() ? { [lang]: v.desc.trim() } : undefined,
    };
    this.values = { ...BLANK, country: v.country };
    this.message = { kind: 'ok', text: t('add.saved') };
    this.render();
    this.onAdd(saint);
  }

  exportMine() {
    const blob = new Blob([JSON.stringify({ saints: this.atlas.userSaints }, null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: 'mes-saints.json' });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
