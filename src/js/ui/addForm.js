import { can, getSession } from '../auth.js';
import { PENDING, PUBLISHED } from '../data.js';
import { collator, getLanguage, monthNames, t, titleLabel } from '../i18n.js';
import { field, fill, h, select } from './dom.js';

/** Vocabulaire des qualités, partagé avec l'atelier de l'assistant expert. */
export const TITLE_KEYS = [
  'abbess', 'abbot', 'apostle', 'bishop', 'cardinal', 'deacon', 'disciple', 'doctor',
  'evangelist', 'founder', 'hermit', 'king', 'layperson', 'martyr', 'missionary', 'monk',
  'mystic', 'nun', 'pilgrim', 'pope', 'preacher', 'priest', 'prince', 'prophet', 'queen',
  'religious', 'soldier', 'virgin', 'widow', 'youth',
];

const BLANK = {
  name: '', sex: 'm', born: '', died: '', city: '', country: '',
  lat: '', lng: '', month: '', day: '', desc: '', bio: '', patronage: '', titles: [],
  // Le second corpus : une apparition a eu lieu une année, parfois sur
  // plusieurs, et l'Église s'est prononcée ou non.
  annee: '', anneeFin: '', approbation: '',
};

/** Les trois degrés d'approbation, plus le silence — qui est le cas ordinaire. */
const APPROBATIONS = ['reconnue', 'en-cours', 'non-reconnue'];

/**
 * Formulaire d'ajout — et de modification, quand l'administrateur reprend une
 * fiche existante. Un utilisateur soumet une proposition ; un administrateur
 * publie directement.
 */
export class AddPanel {
  constructor(atlas, { onSubmit, onPick, onCancelPick }) {
    this.atlas = atlas;
    this.onSubmit = onSubmit;
    this.onPick = onPick;
    this.onCancelPick = onCancelPick;
    this.values = { ...BLANK };
    this.editing = null;
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
    if (!this.editing && !this.values.country && countryId) {
      this.values.country = countryId;
      this.render();
    }
  }

  /**
   * Quel corpus le formulaire sert.
   *
   * En modification, celui de la fiche ouverte — on ne change pas un saint en
   * apparition d'un coup de bascule. En ajout, celui que la carte montre : on
   * ajoute ce qu'on est en train de regarder.
   */
  get kind() {
    return this.editingKind || (this.atlas.corpus === 'apparitions' ? 'apparition' : 'saint');
  }

  /** Charge une fiche existante dans le formulaire. */
  edit(saint) {
    const lang = getLanguage();
    const [month, day] = String(saint.feast || '').split('-');
    this.editing = saint.id;
    this.editingKind = saint.kind === 'apparition' ? 'apparition' : 'saint';
    // Les champs par langue de la fiche d'origine : le formulaire n'en montre
    // qu'une, et corriger une ville en français ne doit pas effacer le nom
    // anglais ni le récit latin.
    this.editingBase = {
      name: saint.name, desc: saint.desc, bio: saint.bio, patronage: saint.patronage,
    };
    this.message = null;
    this.values = {
      ...BLANK,
      annee: saint.annee == null ? '' : String(saint.annee),
      anneeFin: saint.anneeFin == null ? '' : String(saint.anneeFin),
      approbation: saint.approbation || '',
      name: this.atlas.saintName(saint, lang),
      sex: saint.sex || 'm',
      born: saint.born == null ? '' : String(saint.born),
      died: saint.died == null ? '' : String(saint.died),
      city: saint.city || '',
      country: saint.country || '',
      lat: String(saint.lat),
      lng: String(saint.lng),
      month: month ? String(Number(month)) : '',
      day: day ? String(Number(day)) : '',
      desc: typeof saint.desc === 'string' ? saint.desc : saint.desc?.[lang] || '',
      bio: typeof saint.bio === 'string' ? saint.bio : saint.bio?.[lang] || '',
      patronage: typeof saint.patronage === 'string'
        ? saint.patronage : saint.patronage?.[lang] || '',
      titles: [...(saint.titles || [])],
    };
    this.render();
  }

  cancelEdit() {
    this.editing = null;
    this.editingKind = null;
    this.editingBase = null;
    this.values = { ...BLANK };
    this.message = null;
    this.render();
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

    if (!can('propose')) {
      fill(this.root, [h('p', { class: 'notice notice--error', text: t('perm.needUser') })]);
      this.root.onsubmit = (event) => event.preventDefault();
      return;
    }

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

    const appa = this.kind === 'apparition';
    const mienne = appa ? this.atlas.store.apparitions : this.atlas.store;

    fill(this.root, [
      this.editing
        ? h('h2', { class: 'panel__section', text: t(appa ? 'add.editTitleAppa' : 'add.editTitle') })
        : h('p', { class: 'add__intro', text: t(appa ? 'add.introAppa' : 'add.intro') }),
      this.editing
        ? null
        : h('p', { class: 'add__intro', text: can('publish') ? t('add.introAdmin') : t('add.introUser') }),
      this.message
        ? h('p', { class: `notice notice--${this.message.kind}`, text: this.message.text })
        : null,

      field(t('add.name'), h('input', {
        class: 'control', type: 'text', value: this.values.name,
        placeholder: t(appa ? 'add.namePlaceholderAppa' : 'add.namePlaceholder'),
        oninput: this.bind('name'),
      })),
      // Le genre ne sert qu'à accorder « saint » et « sainte » : une apparition
      // ne s'accorde pas, et la ligne n'aurait rien à dire.
      appa ? null : field(t('add.sex'), select(
        [{ value: 'm', label: t('add.male') }, { value: 'f', label: t('add.female') }],
        {
          value: this.values.sex,
          onchange: (e) => { this.values.sex = e.target.value; this.render(); },
        },
      )),

      // Une apparition n'est pas née et n'est pas morte : elle a eu lieu une
      // année, parfois sur plusieurs — Le Laus a duré cinquante-quatre ans.
      appa
        ? [
          h('div', { class: 'filters__row' },
            field(t('add.annee'), h('input', {
              class: 'control', type: 'number', placeholder: '1858',
              value: this.values.annee, oninput: this.bind('annee'),
            })),
            field(t('add.anneeFin'), h('input', {
              class: 'control', type: 'number', placeholder: '1858',
              value: this.values.anneeFin, oninput: this.bind('anneeFin'),
            }))),
          h('p', { class: 'field__hint', text: t('add.anneeHint') }),
          field(t('add.approbation'), select(
            [{ value: '', label: t('add.approbationMuette') },
              ...APPROBATIONS.map((v) => ({ value: v, label: t(`approbation.${v}`) }))],
            { value: this.values.approbation, onchange: this.bind('approbation') },
          ), t('add.approbationHint')),
        ]
        : [
          h('div', { class: 'filters__row' },
            field(t('add.born'), h('input', {
              class: 'control', type: 'number', placeholder: '1182',
              value: this.values.born, oninput: this.bind('born'),
            })),
            field(t('add.died'), h('input', {
              class: 'control', type: 'number', placeholder: '1226',
              value: this.values.died, oninput: this.bind('died'),
            }))),
          h('p', { class: 'field__hint', text: t('add.yearHint') }),
        ],

      field(t(appa ? 'detail.place' : 'add.city'), h('input', {
        class: 'control', type: 'text', value: this.values.city,
        placeholder: t(appa ? 'add.cityPlaceholderAppa' : 'add.cityPlaceholder'),
        oninput: this.bind('city'),
      })),
      field(t('add.country'), select(
        [{ value: '', label: '—' }, ...countries],
        { value: this.values.country, onchange: this.bind('country') },
      )),

      h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.coords') }),
        h('div', { class: 'filters__row' },
          field(t('add.lat'), h('input', {
            class: 'control', type: 'number', step: 'any', placeholder: '43.0707',
            value: this.values.lat, oninput: this.bind('lat'),
          })),
          field(t('add.lng'), h('input', {
            class: 'control', type: 'number', step: 'any', placeholder: '12.6196',
            value: this.values.lng, oninput: this.bind('lng'),
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
        h('legend', { class: 'group__legend', text: t(appa ? 'add.feastAppa' : 'add.feast') }),
        h('div', { class: 'filters__row' },
          select([{ value: '', label: '—' }, ...months], {
            value: this.values.month, onchange: this.bind('month'), 'aria-label': t('add.month'),
          }),
          h('input', {
            class: 'control', type: 'number', min: '1', max: '31',
            value: this.values.day, oninput: this.bind('day'), 'aria-label': t('add.day'),
          }))),

      // Les qualités et le patronage disent ce qu'un saint était et de quoi il
      // protège : ni l'un ni l'autre ne se dit d'une apparition.
      appa ? null : h('fieldset', { class: 'group' },
        h('legend', { class: 'group__legend', text: t('add.titles') }),
        titleBox),

      appa ? null : field(t('add.patronage'), h('input', {
        class: 'control', type: 'text', value: this.values.patronage,
        placeholder: t('add.patronagePlaceholder'), oninput: this.bind('patronage'),
      })),

      field(t('add.desc'), h('textarea', {
        class: 'control control--area',
        rows: '2',
        placeholder: t('add.descPlaceholder'),
        oninput: this.bind('desc'),
      }, this.values.desc)),

      field(t('add.bio'), h('textarea', {
        class: 'control control--area',
        rows: '5',
        placeholder: t('add.bioPlaceholder'),
        oninput: this.bind('bio'),
      }, this.values.bio)),

      h('button', {
        class: 'btn btn--primary',
        type: 'submit',
        text: this.editing ? t('add.update') : t('add.save'),
      }),
      this.editing
        ? h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: t('add.cancel'),
          onclick: () => this.cancelEdit(),
        })
        : null,
      h('p', {
        class: 'add__count',
        text: t(appa ? 'add.mineCountAppa' : 'add.mineCount', { n: mienne.added.length }),
      }),
      // L'export ne paraît que s'il y a quelque chose à verser : un bouton qui
      // téléchargerait un fichier vide n'apprend rien.
      appa && this.atlas.hasLocalApparitions()
        ? [
          h('button', {
            class: 'btn btn--ghost',
            type: 'button',
            text: t('add.exportAppa'),
            onclick: () => this.exportApparitions(),
          }),
          h('p', { class: 'field__hint', text: t('add.exportAppaHint') }),
        ]
        : null,
      !appa && mienne.added.length
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

  /**
   * Un champ par langue, fondu avec ce que la fiche disait déjà.
   *
   * Le formulaire ne montre qu'une langue. Sans cette fusion, corriger la ville
   * d'une fiche en français effacerait son nom anglais — le champ entier étant
   * remplacé par le seul français.
   */
  multilingue(champ, valeur) {
    const lang = getLanguage();
    const base = this.editingBase?.[champ];
    const fondu = typeof base === 'string' ? { [lang]: base } : { ...base };
    if (valeur) fondu[lang] = valeur; else delete fondu[lang];
    return Object.keys(fondu).length ? fondu : undefined;
  }

  validate() {
    const v = this.values;
    const appa = this.kind === 'apparition';
    if (!v.name.trim()) return t('add.errName');
    if (!v.country) return t('add.errCountry');
    const lat = Number(v.lat);
    const lng = Number(v.lng);
    if (!v.lat || !v.lng || Number.isNaN(lat) || Number.isNaN(lng)
      || Math.abs(lat) > 85 || Math.abs(lng) > 180) return t('add.errCoords');

    if (appa) {
      // Une apparition se situe : sans localité, la fiche dirait « — » et la
      // carte ne saurait pas quoi écrire sous la croix.
      if (!v.city.trim()) return t('add.errCity');
      const annee = v.annee === '' ? null : Number(v.annee);
      if (annee == null || Number.isNaN(annee)) return t('add.errAnnee');
      const fin = v.anneeFin === '' ? null : Number(v.anneeFin);
      if (fin != null && (Number.isNaN(fin) || fin < annee)) return t('add.errAnneeFin');
      // La fête est facultative ; donnée à moitié, elle est fautive.
      if ((v.month && !v.day) || (!v.month && v.day)) return t('add.errFeast');
      if (v.day && !(Number(v.day) >= 1 && Number(v.day) <= 31)) return t('add.errFeast');
      return null;
    }

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
    const kind = this.kind;
    const pad = (n) => String(n).padStart(2, '0');
    const fete = v.month && v.day ? `${pad(Number(v.month))}-${pad(Number(v.day))}` : undefined;

    // Une apparition ne porte ni sexe, ni naissance, ni mort, ni qualités, ni
    // patronage : sa fiche ne dit que ce qui la concerne.
    const draft = kind === 'apparition' ? {
      name: this.multilingue('name', v.name.trim()),
      city: v.city.trim(),
      country: v.country,
      lat: Number(v.lat),
      lng: Number(v.lng),
      annee: Number(v.annee),
      anneeFin: v.anneeFin === '' ? undefined : Number(v.anneeFin),
      approbation: v.approbation || undefined,
      feast: fete,
      desc: this.multilingue('desc', v.desc.trim()),
      bio: this.multilingue('bio', v.bio.trim()),
    } : {
      name: this.multilingue('name', v.name.trim()),
      sex: v.sex,
      born: v.born === '' ? null : Number(v.born),
      died: v.died === '' ? null : Number(v.died),
      city: v.city.trim() || '—',
      country: v.country,
      lat: Number(v.lat),
      lng: Number(v.lng),
      feast: `${pad(Number(v.month))}-${pad(Number(v.day))}`,
      titles: [...v.titles],
      desc: this.multilingue('desc', v.desc.trim()),
      bio: this.multilingue('bio', v.bio.trim()),
      patronage: this.multilingue('patronage', v.patronage.trim()),
    };

    const editing = this.editing;
    const status = can('publish') ? PUBLISHED : PENDING;
    this.editing = null;
    this.editingKind = null;
    this.editingBase = null;
    this.values = { ...BLANK, country: v.country };
    this.message = {
      kind: 'ok',
      text: editing ? t('add.updated') : t(status === PUBLISHED ? 'add.savedPublished' : 'add.savedPending'),
    };
    this.render();
    this.onSubmit({ draft, editing, status, kind, author: getSession().name });
  }

  exportMine() {
    this.telecharger('mes-saints.json', { saints: this.atlas.store.added });
  }

  /**
   * Les deux fichiers qui rendent le travail durable.
   *
   * Ce qui est ajouté, retouché ou retiré vit dans le navigateur : cela ne sort
   * pas de cette machine, et la prochaine collecte l'ignore. Ces deux fichiers
   * se versent dans `data/apparitions/` et le corpus devient celui du site.
   */
  exportApparitions() {
    const { apparitions, corrections } = this.atlas.exportApparitions();
    if (apparitions.apparitions.length) this.telecharger('apparitions.json', apparitions);
    if (Object.keys(corrections.corrections).length || corrections.retirees.length) {
      this.telecharger('corrections.json', corrections);
    }
  }

  telecharger(nom, contenu) {
    const blob = new Blob([`${JSON.stringify(contenu, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: nom });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
