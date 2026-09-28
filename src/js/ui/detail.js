import { PENDING, PUBLISHED, REJECTED } from '../data.js';
import { can } from '../auth.js';
import { degreLabel, formatFeast, formatYear, getLanguage, languePhrase, pickText, t, titleLabel } from '../i18n.js';
import { fill, h } from './dom.js';
import { emblemSvg } from '../emblems.js';
import { portraitOf } from '../portrait.js';

/**
 * Ce qui s'est passé en un lieu, dit à partir du motif seul. La date ne se pose
 * que quand elle est celle du motif — l'année de la mort pour le lieu de mort —,
 * et la phrase ne prétend rien de plus.
 */
function phraseLieu(lieu, saint) {
  const sex = saint.sex;
  // Une date approximative ne se glisse pas dans la phrase : « morte en vers
  // 1930 » ne se dit pas. La phrase se passe alors de l'année.
  const exacte = (prec) => !saint.circa && (prec == null || prec >= 9);
  if (lieu.quoi === 'mort' && saint.died != null && exacte(saint.diedPrec)) {
    return t('lieuDit.mortAn', { sex, y: formatYear(saint.died) });
  }
  if (lieu.quoi === 'naissance' && saint.born != null && exacte(saint.bornPrec)) {
    return t('lieuDit.naissanceAn', { sex, y: formatYear(saint.born) });
  }
  const cle = `lieuDit.${lieu.quoi}`;
  const phrase = t(cle, { sex });
  return phrase === cle ? '' : phrase;
}

function row(label, value) {
  if (!value) return null;
  return h('div', { class: 'sheet__row' },
    h('dt', { class: 'sheet__key', text: label }),
    h('dd', { class: 'sheet__value', text: value }));
}

/** Fiche détaillée d'un saint, avec les actions permises au rôle courant. */
export class DetailPanel {
  constructor(atlas, { onBack, onLocate, onEdit, onRemove, onStatus, onLieux, onCroises, onOpen }) {
    this.atlas = atlas;
    this.onBack = onBack;
    this.onLocate = onLocate;
    this.onEdit = onEdit;
    this.onRemove = onRemove;
    this.onStatus = onStatus;
    this.onLieux = onLieux;
    this.onCroises = onCroises;
    this.onOpen = onOpen;
    this.saint = null;
    // Les lieux sont-ils montrés sur la carte ? Le bouton dit l'un ou l'autre,
    // et c'est la fiche qui s'en souvient — la carte, elle, ne fait qu'obéir.
    this.lieuxOuverts = false;
    this.croisesOuverts = false;
    this.root = h('div', { class: 'detail' });
  }

  show(saint) {
    const change = saint?.id !== this.saint?.id;
    this.saint = saint;
    // Une autre fiche : ses lieux ne sont pas ceux d'avant, et rien n'est
    // encore montré.
    if (change) { this.lieuxOuverts = false; this.croisesOuverts = false; }
    this.render();
  }

  /** Reprend la fiche à jour après une modification ou un changement d'état. */
  refresh() {
    if (this.saint) this.saint = this.atlas.pointById(this.saint.id) || null;
    this.render();
  }

  /**
   * L'icône ou le tableau de la fiche, venu de Wikimedia Commons. Le cadre se
   * pose vide et caché ; il ne paraît qu'une fois l'image arrivée, et seulement
   * si la fiche ouverte est toujours la même.
   */
  portrait(saint, lang) {
    const figure = h('figure', { class: 'detail__portrait', hidden: true });
    portraitOf(saint).then((p) => {
      if (!p || this.saint?.id !== saint.id) return;
      const img = h('img', {
        src: p.src,
        alt: this.atlas.saintName(saint, lang),
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
      });
      img.addEventListener('load', () => { figure.hidden = false; }, { once: true });
      img.addEventListener('error', () => figure.remove(), { once: true });
      // Le crédit n'est pas une politesse : une image sous CC BY-SA ne se
      // reprend qu'avec son auteur, sa licence et le chemin vers l'original.
      const credit = [p.auteur, p.licence].filter(Boolean).join(' · ');
      fill(figure, [
        img,
        h('figcaption', {},
          credit ? h('span', { text: `${credit} · ` }) : null,
          h('a', { href: p.page, target: '_blank', rel: 'noreferrer noopener', text: 'Wikimedia Commons' })),
      ]);
    });
    return figure;
  }

  render() {
    const saint = this.saint;
    if (!saint) {
      fill(this.root, []);
      return;
    }
    const lang = getLanguage();
    // Une apparition n'est pas un saint : elle n'est pas née et n'est pas morte,
    // elle a eu lieu. Sa fiche dit donc une année, un lieu et un degré
    // d'approbation là où celle d'un saint dit deux dates, un lieu de naissance
    // et un degré de reconnaissance.
    const appa = saint.kind === 'apparition';
    // Un miracle eucharistique se lit comme une apparition — une année, un lieu,
    // un récit — et ajoute ce qu'on en garde : une chair, un corporal, une
    // procession, ou rien. Pour un fait du XIIIe siècle, c'est souvent ce qui
    // décide qu'on y aille.
    const mir = saint.kind === 'miracle';
    const date = appa || mir;
    // Les lieux marqués par ce saint, quand la table est descendue. Une
    // apparition n'en a pas : elle *est* un lieu.
    const lieux = date ? [] : this.atlas.lieuxDe(saint.id);
    // Et ceux qu'il a pu croiser : les liens attestés d'abord, les voisinages
    // ensuite. La table descend avec les lieux ; avant elle, il n'y a rien à
    // proposer, et le bouton ne paraît pas.
    const croises = date ? [] : this.atlas.rencontresDe(saint.id);
    const description = pickText(saint.desc, lang);
    const patronage = pickText(saint.patronage, lang);
    const biography = pickText(saint.bio, lang);

    const otherNames = typeof saint.name === 'object'
      ? Object.entries(saint.name)
        .filter(([code, value]) => code !== lang && value)
        .map(([code, value]) => `${value} (${code})`)
        .join(' · ')
      : '';

    fill(this.root, [
      h('button', {
        class: 'btn btn--ghost detail__back',
        type: 'button',
        text: `← ${t('detail.back')}`,
        onclick: () => this.onBack(),
      }),
      h('div', { class: 'detail__head' },
        emblemSvg(saint, 'emblem emblem--large'),
        h('h2', { class: 'detail__name', text: this.atlas.saintName(saint, lang) })),
      this.portrait(saint, lang),
      otherNames ? h('p', { class: 'detail__aka', text: otherNames }) : null,
      saint.status !== PUBLISHED
        ? h('p', { class: `notice notice--${saint.status}`, text: t(`status.${saint.status}`) })
        : null,
      saint.local ? h('p', { class: 'notice notice--mine', text: t('detail.mine') }) : null,

      // Les lieux qu'il a marqués : le bouton se pose au-dessus du récit, à
      // droite, et ne paraît que s'il y a quelque chose à montrer. Un bouton
      // qui ouvrirait une liste vide ne propose rien, il déçoit.
      lieux.length || croises.length
        ? h('p', { class: 'detail__lieux' },
          lieux.length ? h('button', {
            class: `btn btn--ghost detail__lieux-btn${this.lieuxOuverts ? ' is-on' : ''}`,
            type: 'button',
            'aria-pressed': this.lieuxOuverts ? 'true' : 'false',
            // Le genre suit la fiche : Thérèse de Lisieux ne s'entend pas dire
            // « les lieux qu'il a marqués ».
            text: this.lieuxOuverts
              ? t('lieux.hide')
              : t(lieux.length === 1 ? 'lieux.showOne' : 'lieux.show',
                { n: lieux.length, sex: saint.sex }),
            onclick: () => {
              this.lieuxOuverts = !this.lieuxOuverts;
              this.onLieux?.(this.lieuxOuverts ? lieux : []);
              this.render();
            },
          }) : null,
          // Le second bouton : qui vivait à côté. Il est à part du premier
          // parce qu'on peut vouloir l'un sans l'autre — les lieux d'une vie,
          // ou le monde autour d'elle.
          croises.length ? h('button', {
            class: `btn btn--ghost detail__croises-btn${this.croisesOuverts ? ' is-on' : ''}`,
            type: 'button',
            'aria-pressed': this.croisesOuverts ? 'true' : 'false',
            text: this.croisesOuverts
              ? t('croises.hide')
              : t(croises.length === 1 ? 'croises.showOne' : 'croises.show',
                { n: croises.length, sex: saint.sex }),
            onclick: () => {
              this.croisesOuverts = !this.croisesOuverts;
              this.onCroises?.(this.croisesOuverts ? croises.map((c) => c.saint) : []);
              this.render();
            },
          }) : null)
        : null,
      // Ce qu'ils sont, une fois montrés : un point sur la carte ne dit pas
      // qu'il est une sépulture. Un lieu qui est deux choses les dit toutes
      // deux — la chapelle de la rue du Bac est une apparition et un tombeau.
      this.lieuxOuverts && lieux.length
        ? h('ul', { class: 'detail__lieux-liste' },
          ...lieux.map((lieu) => {
            // Ce qui s'y est passé, quand on le sait. Un motif dit la
            // catégorie, non le fait : « Rouen, lieu de mort » ne dit rien du
            // bûcher de la place du Vieux-Marché.
            const dit = pickText(lieu.dit, lang);
            // Faute de phrase écrite à la main, une phrase construite du motif
            // et de la date, qui ne dit que ce qu'on sait : « Elle y est morte
            // en 1431 ». Et, dessous, ce qu'est le lieu d'après Wikidata.
            const phrase = dit || phraseLieu(lieu, saint);
            const nature = pickText(lieu.desc, lang);
            return h('li', { class: dit ? 'is-dit' : '' },
              h('p', { class: 'detail__lieu-tete' },
                h('span', {
                  class: 'detail__lieu-quoi',
                  text: [lieu.quoi, ...(lieu.aussi || [])].map((q) => t(`lieux.${q}`)).join(' · '),
                }),
                h('span', { class: 'detail__lieu-nom', text: lieu.nom })),
              phrase ? h('p', { class: 'detail__lieu-dit', text: phrase }) : null,
              nature ? h('p', { class: 'detail__lieu-nature', text: nature }) : null);
          }))
        : null,
      // Les voisins, avec ce qui les rapproche : un lien écrit — « sa sœur »,
      // « son maître » — ou, faute de mieux, le lieu qu'ils ont en commun. La
      // nuance n'est pas un détail : l'un est attesté, l'autre est possible.
      this.croisesOuverts && croises.length
        ? h('ul', { class: 'detail__croises-liste' },
          ...croises.map((c) => h('li', {},
            h('button', {
              class: 'detail__croise',
              type: 'button',
              onclick: () => this.onOpen?.(c.saint.id),
            },
            h('span', { class: 'detail__croise-nom', text: this.atlas.saintName(c.saint, lang) }),
            h('span', {
              class: `detail__croise-quoi${c.atteste ? ' is-atteste' : ''}`,
              text: c.atteste ? t(`liens.${c.quoi}`) : t('croises.ici', { lieu: c.ou }),
            }))))) : null,

      // Les qualités étaient ici, en pastilles, et de nouveau plus bas dans le
      // relevé : deux fois la même chose à trois centimètres d'écart, dans un
      // panneau qui n'a qu'une demi-hauteur d'écran. Elles ne sont plus qu'en
      // bas, avec les autres repères — c'est là qu'on lit une fiche.
      description ? h('p', { class: 'detail__desc', text: description }) : null,
      biography ? h('p', { class: 'detail__bio', text: biography }) : null,
      // La licence de Wikipédia demande qu'une modification soit signalée, et
      // une traduction en est une. Le lecteur, lui, sait ainsi que la tournure
      // française n'est pas celle d'une source française.
      biography && saint.traduit && lang === 'fr'
        ? h('p', {
          class: 'detail__traduit',
          text: t('detail.translated', { langue: languePhrase(saint.traduit) }),
        })
        : null,
      h('dl', { class: 'sheet' },
        // Le degré de reconnaissance, quand le corpus le sait : tout le monde
        // n'est pas saint, et la ligne ne s'écrit pas quand on l'ignore. Une
        // apparition, elle, est reconnue par l'Église ou ne l'est pas — Lourdes
        // et Fátima le sont, Medjugorje non —, ce qui n'est pas le même mot.
        appa
          ? row(t('detail.approval'), saint.approbation ? t(`approbation.${saint.approbation}`) : '')
          : mir ? null : row(t('detail.degre'), degreLabel(saint.statut, saint.sex)),
        row(t('detail.patronage'), patronage),
        date
          // Une apparition qui s'étale sur plusieurs années porte les deux
          // bornes ; celle d'un seul jour n'en porte qu'une. Un miracle tient
          // dans une seule.
          ? row(t('detail.year'), saint.anneeFin && saint.anneeFin !== saint.annee
            ? `${formatYear(saint.annee)} – ${formatYear(saint.anneeFin)}`
            : formatYear(saint.annee))
          : [
            row(t('detail.birth'), saint.born != null
              ? formatYear(saint.born, { circa: saint.circa, precision: saint.bornPrec })
              : t('misc.unknown')),
            row(t('detail.death'), saint.died != null
              ? formatYear(saint.died, { circa: saint.circa, precision: saint.diedPrec })
              : t('misc.unknown')),
          ],
        // Le point porté sur la carte est presque toujours une naissance ;
        // quand c'est une mort, dire « lieu de naissance » serait une erreur.
        // Une apparition n'est ni l'une ni l'autre : c'est un lieu, sans plus.
        row(t(date ? 'detail.place'
          : saint.placeKind === 'died' ? 'detail.deathplace' : 'detail.birthplace'),
        `${saint.city} — ${this.atlas.countryName(saint.country, lang)}`),
        // Ce qu'on en garde, et où : le champ propre au troisième corpus. Il
        // vient après l'année et le lieu — on situe d'abord, on va voir ensuite.
        mir ? row(t('detail.garde'), pickText(saint.garde, lang)) : null,
        row(t('detail.feast'), formatFeast(saint.feast)),
        // Ce que le saint était : moine, évêque, martyre, docteur de l'Église.
        //
        // Cette ligne disait « État : Publiée ». C'était l'état de modération de
        // la fiche, qui ne regarde que l'administrateur — et qui vaut « Publiée »
        // pour les quatre mille cinq cent quatre-vingt-neuf fiches de la carte :
        // une ligne sur sept ne disait rien. Ce qui n'est *pas* publié se signale
        // déjà en tête, par un bandeau qu'on ne peut pas manquer.
        row(t('detail.titles'), (saint.titles || [])
          .map((key) => titleLabel(key, saint.sex)).join(', '))),

      // D'où vient la fiche, quand elle vient d'ailleurs. Pour un texte repris
      // de Wikipédia, l'attribution n'est pas facultative : elle est la
      // condition de la licence sous laquelle il est publié.
      saint.sources?.length
        ? h('p', { class: 'detail__sources' },
          h('span', { text: `${t('detail.sources')} ` }),
          ...saint.sources.flatMap((source, i) => [
            i ? h('span', { text: ' · ' }) : null,
            h('a', {
              href: source.url,
              target: '_blank',
              rel: 'noreferrer noopener',
              text: source.label,
            }),
          ].filter(Boolean)))
        : null,
      h('div', { class: 'detail__actions' },
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('detail.locate'),
          onclick: () => this.onLocate(saint),
        }),
        can('edit') ? h('button', {
          class: 'btn',
          type: 'button',
          text: t('detail.edit'),
          onclick: () => this.onEdit(saint),
        }) : null,
        can('moderate') && saint.status === PENDING ? h('button', {
          class: 'btn btn--go',
          type: 'button',
          text: t('detail.approve'),
          onclick: () => this.onStatus(saint, PUBLISHED),
        }) : null,
        can('moderate') && saint.status === PENDING ? h('button', {
          class: 'btn btn--danger',
          type: 'button',
          text: t('detail.reject'),
          onclick: () => this.onStatus(saint, REJECTED),
        }) : null,
        can('remove') ? h('button', {
          class: 'btn btn--danger',
          type: 'button',
          text: t('detail.remove'),
          onclick: () => {
            // eslint-disable-next-line no-alert
            if (window.confirm(t('detail.confirmRemove'))) this.onRemove(saint);
          },
        }) : null),
    ]);
  }
}
