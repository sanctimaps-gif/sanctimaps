import { formatYear, getLanguage, pickText, t } from '../i18n.js';
import { fold } from '../data.js';
import {
  CHAINES, MODES, NOTORIETES, PALIERS, ajouterPoints, auHasard, classerNotoriete, contexteQuiz,
  faireChaine, faireQuestion, interpreterIndice, lirePoints, palierDe, questionsQui, reponseJuste, voisins,
} from '../jeux.js';
import { portraitOf } from '../portrait.js';
import { buildCountryIndex } from '../query.js';
import { fill, h } from './dom.js';
import { emblemSvg } from '../emblems.js';

/** Questions par partie de quiz. */
const QUESTIONS_PAR_PARTIE = 10;

/**
 * La partie « Jeux » du tiroir : le quiz à trois niveaux de réponse et quatre de
 * notoriété, la chaîne de saints, « Qui est-ce ? », et le palier où les points
 * gagnés ont mené. Tout se joue sur le corpus de la carte, et les points se
 * gardent dans le navigateur.
 */
export class JeuxPanel {
  constructor(atlas, { onOpen }) {
    this.atlas = atlas;
    this.onOpen = onOpen;
    this.root = h('div', { class: 'jeux' });
    this.ecran = 'accueil';
    this.pret = false;
    this.render();
  }

  /**
   * Les jeux ont besoin des lieux (pour la notoriété et la chaîne) et des
   * textes (pour les patronages et les notices) : on les demande à la première
   * ouverture, et la notoriété se calcule une fois.
   */
  preparer() {
    if (this.preparation) return this.preparation;
    this.preparation = Promise.all([this.atlas.ensureLieux(), this.atlas.ensureTexts()]).then(() => {
      this.niveaux = classerNotoriete(this.atlas);
      this.pret = true;
      this.render();
    });
    return this.preparation;
  }

  aller(ecran, etat = {}) {
    this.ecran = ecran;
    Object.assign(this, etat);
    this.render();
    this.root.scrollIntoView?.({ block: 'start' });
  }

  render() {
    if (!this.pret) {
      this.preparer();
      fill(this.root, [h('p', { class: 'jeux__attente', text: t('jeux.chargement') })]);
      return;
    }
    const vues = {
      accueil: () => this.accueil(),
      quizChoix: () => this.quizChoix(),
      quiz: () => this.quizVue(),
      chaineChoix: () => this.chaineChoix(),
      chaine: () => this.chaineVue(),
      quiChoix: () => this.quiChoix(),
      qui: () => this.quiVue(),
    };
    fill(this.root, [(vues[this.ecran] || vues.accueil)()]);
  }

  // -- l'accueil : le palier, puis les trois jeux ------------------------------

  palierBloc() {
    const { points } = lirePoints();
    const p = palierDe(points);
    const avance = p.suivant ? (points - p.seuil) / (p.suivant.seuil - p.seuil) : 1;
    return h('div', { class: 'jeux__palier' },
      h('p', { class: 'jeux__palier-nom', text: p.nom }),
      h('p', { class: 'jeux__palier-points', text: t('jeux.points', { n: points }) }),
      h('div', { class: 'jeux__barre', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(avance * 100)) },
      h('span', { style: `width: ${Math.round(avance * 100)}%` })),
      h('p', { class: 'field__hint', text: p.suivant
        ? t('jeux.prochain', { nom: p.suivant.nom, n: p.suivant.seuil - points })
        : t('jeux.dernier') }));
  }

  accueil() {
    const jeu = (cle, glyphe, ecran) => h('button', {
      class: 'menu__item jeux__jeu', type: 'button', onclick: () => this.aller(ecran),
    },
    h('span', { class: 'menu__glyph', 'aria-hidden': 'true', text: glyphe }),
    h('span', { class: 'menu__label' },
      h('span', { class: 'menu__name', text: t(`jeux.${cle}.titre`) }),
      h('span', { class: 'menu__hint', text: t(`jeux.${cle}.hint`) })),
    h('span', { class: 'menu__chevron', 'aria-hidden': 'true', text: '›' }));
    return h('div', {},
      this.palierBloc(),
      h('nav', { class: 'menu' },
        jeu('quiz', '?', 'quizChoix'),
        jeu('chaine', '⛓', 'chaineChoix'),
        jeu('qui', '👤', 'quiChoix')),
      h('details', { class: 'jeux__paliers' },
        h('summary', { text: t('jeux.tousPaliers') }),
        h('ol', {}, ...PALIERS.map((p, i) => h('li', {
          text: `${p.nom || t('jeux.palier', { n: i + 1 })} — ${t('jeux.points', { n: p.seuil })}`,
        })))));
  }

  retour() {
    return h('button', { class: 'btn btn--ghost jeux__retour', type: 'button',
      text: `← ${t('jeux.retour')}`, onclick: () => this.aller('accueil') });
  }

  /** Une rangée de boutons pour choisir un niveau. */
  choix(titre, options, actif, onChoix) {
    return h('fieldset', { class: 'group' },
      h('legend', { class: 'group__legend', text: titre }),
      h('div', { class: 'jeux__options' }, ...options.map((o) => h('button', {
        class: `chip chip--scope${o.valeur === actif ? ' is-on' : ''}`,
        type: 'button',
        'aria-pressed': o.valeur === actif ? 'true' : 'false',
        text: o.libelle,
        title: o.aide || '',
        onclick: () => onChoix(o.valeur),
      }))));
  }

  notorieteChoix(actif, onChoix) {
    return this.choix(t('jeux.notoriete'), NOTORIETES.map((n) => ({
      valeur: n, libelle: t(`jeux.noto${n}`),
    })), actif, onChoix);
  }

  // -- le quiz ------------------------------------------------------------------

  quizChoix() {
    this.qMode = this.qMode || 'a';
    this.qNiveau = this.qNiveau || 1;
    return h('div', {},
      this.retour(),
      h('h2', { class: 'panel__section', text: t('jeux.quiz.titre') }),
      this.choix(t('jeux.reponse'), MODES.map((m) => ({
        valeur: m.cle, libelle: t(`jeux.mode.${m.cle}`), aide: t(`jeux.mode.${m.cle}Aide`),
      })), this.qMode, (v) => this.aller('quizChoix', { qMode: v })),
      h('p', { class: 'field__hint', text: t(`jeux.mode.${this.qMode}Aide`) }),
      this.notorieteChoix(this.qNiveau, (v) => this.aller('quizChoix', { qNiveau: v })),
      h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.commencer'),
        onclick: () => this.demarrerQuiz() }));
  }

  demarrerQuiz() {
    const lang = getLanguage();
    const ctx = contexteQuiz(this.atlas, this.niveaux, lang);
    const mode = MODES.find((m) => m.cle === this.qMode);
    const questions = [];
    const vus = new Set();
    for (let i = 0; i < QUESTIONS_PAR_PARTIE * 3 && questions.length < QUESTIONS_PAR_PARTIE; i += 1) {
      const q = faireQuestion(ctx, this.qNiveau, mode);
      if (q && !vus.has(q.question)) { vus.add(q.question); questions.push(q); }
    }
    this.aller('quiz', {
      partie: { mode, niveau: this.qNiveau, questions, i: 0, bonnes: 0, points: 0, repondu: null, vue: false },
    });
  }

  quizVue() {
    const p = this.partie;
    if (!p.questions.length) {
      return h('div', {}, this.retour(), h('p', { class: 'results__empty', text: t('jeux.vide') }));
    }
    if (p.i >= p.questions.length) return this.finQuiz();
    const q = p.questions[p.i];
    const lang = getLanguage();
    const suivant = () => { p.i += 1; p.repondu = null; p.vue = false; this.render(); };
    const valeur = p.mode.points * p.niveau;
    const repondre = (juste, saisie) => {
      p.repondu = { juste, saisie };
      if (juste) { p.bonnes += 1; if (!p.vue) p.points += valeur; }
      this.render();
    };

    const corps = [];
    if (p.mode.choix) {
      corps.push(h('div', { class: 'jeux__choix' }, ...q.choix.map((c) => {
        const etat = p.repondu
          ? (c === q.reponse ? ' is-juste' : c === p.repondu.saisie ? ' is-faux' : '')
          : '';
        return h('button', {
          class: `jeux__reponse${etat}`, type: 'button', text: c, disabled: !!p.repondu,
          onclick: () => repondre(c === q.reponse, c),
        });
      })));
    } else {
      const champ = h('input', { class: 'control', type: 'text', placeholder: t('jeux.ecrire'),
        disabled: !!p.repondu, 'aria-label': t('jeux.ecrire') });
      corps.push(h('form', {
        class: 'jeux__ecrire',
        onsubmit: (e) => { e.preventDefault(); if (!p.repondu && champ.value.trim()) repondre(reponseJuste(q, champ.value), champ.value); },
      }, champ, h('button', { class: 'btn btn--primary', type: 'submit', text: t('jeux.valider'), disabled: !!p.repondu })));
      setTimeout(() => { if (!p.repondu) champ.focus(); }, 0);
    }

    // Niveau 1 : on peut voir la réponse, et la question ne rapporte plus rien.
    // Niveau 2 : un lien mène à la fiche, où chercher la réponse.
    const aides = [];
    if (p.mode.cle === 'a' && !p.repondu) {
      aides.push(p.vue
        ? h('p', { class: 'jeux__revele', text: t('jeux.laReponse', { r: q.reponse }) })
        : h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.voir'),
          onclick: () => { p.vue = true; this.render(); } }));
    }
    if (p.mode.cle === 'b' && !p.repondu) {
      aides.push(h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.chercher'),
        onclick: () => this.onOpen?.(q.saint.id) }));
    }

    return h('div', { class: 'jeux__quiz' },
      this.retour(),
      h('p', { class: 'jeux__compteur', text: t('jeux.compteur', { i: p.i + 1, n: p.questions.length, pts: p.points }) }),
      h('p', { class: 'jeux__question', text: q.question }),
      ...corps,
      ...aides,
      p.repondu ? h('div', { class: `jeux__verdict ${p.repondu.juste ? 'is-juste' : 'is-faux'}` },
        h('p', { text: p.repondu.juste
          ? (p.vue ? t('jeux.justeSansPoints') : t('jeux.juste', { n: valeur }))
          : t('jeux.faux', { r: q.reponse }) }),
        h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.voirFiche', { nom: this.atlas.saintName(q.saint, lang) }),
          onclick: () => this.onOpen?.(q.saint.id) }),
        h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.suivante'), onclick: suivant })) : null);
  }

  finQuiz() {
    const p = this.partie;
    if (!p.compte) { p.compte = true; ajouterPoints(p.points); }
    return h('div', { class: 'jeux__fin' },
      h('p', { class: 'jeux__question', text: t('jeux.fin', { b: p.bonnes, n: p.questions.length }) }),
      h('p', { text: t('jeux.gagnes', { n: p.points }) }),
      this.palierBloc(),
      h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.rejouer'), onclick: () => this.demarrerQuiz() }),
      this.retour());
  }

  // -- la chaîne de saints ------------------------------------------------------

  chaineChoix() {
    this.cNiveau = this.cNiveau || 'facile';
    return h('div', {},
      this.retour(),
      h('h2', { class: 'panel__section', text: t('jeux.chaine.titre') }),
      h('p', { class: 'field__hint', text: t('jeux.chaine.regle') }),
      this.choix(t('jeux.longueur'), CHAINES.map((c) => ({
        valeur: c.cle, libelle: `${t(`jeux.ch.${c.cle}`)} · ${c.n}`,
      })), this.cNiveau, (v) => this.aller('chaineChoix', { cNiveau: v })),
      h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.commencer'),
        onclick: () => this.demarrerChaine() }));
  }

  demarrerChaine() {
    const { n } = CHAINES.find((c) => c.cle === this.cNiveau);
    const chaine = faireChaine(this.atlas, this.niveaux, n);
    this.aller('chaine', { chaine: chaine ? { ...chaine, n, courant: chaine.depart, pas: [chaine.depart], indices: 0, fini: null } : null });
  }

  chaineVue() {
    const c = this.chaine;
    const lang = getLanguage();
    if (!c) return h('div', {}, this.retour(), h('p', { class: 'results__empty', text: t('jeux.vide') }));
    const nom = (s) => this.atlas.saintName(s, lang);
    const carte = (s, cls) => h('button', { class: `jeux__carte ${cls}`, type: 'button', onclick: () => this.onOpen?.(s.id) },
      emblemSvg(s), h('span', { text: nom(s) }));
    const restants = c.n - (c.pas.length - 1);

    const finir = (gagne) => {
      c.fini = gagne ? 'gagne' : 'perdu';
      if (gagne) {
        const gain = Math.max(1, c.n * 2 + restants * 2 - c.indices * 3);
        c.gain = gain;
        ajouterPoints(gain);
      }
      this.render();
    };
    const avancer = (s) => {
      c.courant = s;
      c.pas.push(s);
      if (s.id === c.arrivee.id) return finir(true);
      if (c.n - (c.pas.length - 1) <= 0) return finir(false);
      return this.render();
    };

    const entete = [
      this.retour(),
      h('div', { class: 'jeux__trajet' },
        carte(c.depart, 'is-depart'), h('span', { class: 'jeux__fleche', text: '→' }), carte(c.arrivee, 'is-arrivee')),
      h('p', { class: 'jeux__compteur', text: t('jeux.maillons', { k: c.pas.length - 1, n: c.n }) }),
      h('ol', { class: 'jeux__pas' }, ...c.pas.map((s) => h('li', { text: nom(s) }))),
    ];

    if (c.fini) {
      return h('div', { class: 'jeux__chaine' }, ...entete,
        h('div', { class: `jeux__verdict ${c.fini === 'gagne' ? 'is-juste' : 'is-faux'}` },
          h('p', { text: c.fini === 'gagne' ? t('jeux.chaineGagne', { n: c.gain }) : t('jeux.chainePerdu') }),
          h('p', { class: 'field__hint', text: t('jeux.cheminPrevu', { c: c.chemin.map(nom).join(' → ') }) })),
        h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.rejouer'), onclick: () => this.demarrerChaine() }));
    }

    // L'indice : le pas suivant du chemin prévu, depuis le dernier saint du
    // chemin par lequel on est passé.
    const indice = () => {
      let i = c.chemin.length - 2;
      while (i > 0 && !c.pas.some((s) => s.id === c.chemin[i].id)) i -= 1;
      c.indices += 1;
      c.indiceVu = t('jeux.indiceChaine', { nom: nom(c.chemin[Math.min(i + 1, c.chemin.length - 1)]) });
      this.render();
    };

    const deja = new Set(c.pas.map((s) => s.id));
    // L'arrivée ne se rejoint qu'au dernier maillon : la chaîne doit avoir la
    // longueur choisie, ni plus ni moins.
    const options = voisins(this.atlas, c.courant.id).filter((v) => !deja.has(v.saint.id));
    const tropTot = (v) => v.saint.id === c.arrivee.id && restants > 1;
    return h('div', { class: 'jeux__chaine' }, ...entete,
      // Le saint où l'on se tient, comme si l'on avait ouvert sa fiche : on lit
      // sa vie, puis l'on choisit par quel lien continuer.
      this.ficheCourte(c.courant),
      h('p', { class: 'jeux__question', text: t('jeux.depuis', { nom: nom(c.courant) }) }),
      options.length
        ? h('div', { class: 'jeux__voisins' }, ...options.map((v) => h('button', {
          class: `jeux__voisin${v.saint.id === c.arrivee.id ? ' is-arrivee' : ''}`,
          type: 'button',
          disabled: tropTot(v),
          onclick: () => avancer(v.saint),
        },
        emblemSvg(v.saint),
        h('span', { class: 'jeux__voisin-nom', text: nom(v.saint) }),
        h('span', { class: 'jeux__voisin-lien', text: tropTot(v) ? t('jeux.tropTot', { n: restants })
          : v.lie ? t(`lies.${v.lie}`)
            : v.atteste ? t(`liens.${v.quoi}`) : t('croises.ici', { lieu: v.ou }) }),
        h('span', { class: 'jeux__voisin-resume', text: this.resume(v.saint) }))))
        : h('p', { class: 'results__empty', text: t('jeux.impasse') }),
      c.indiceVu ? h('p', { class: 'jeux__revele', text: c.indiceVu }) : null,
      h('div', { class: 'jeux__actions' },
        c.pas.length > 1 ? h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.reculer'),
          onclick: () => { c.pas.pop(); c.courant = c.pas.at(-1); this.render(); } }) : null,
        h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.indice'), onclick: indice }),
        h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.abandonner'), onclick: () => finir(false) })));
  }

  /**
   * Qui est ce saint, en une ligne : ses dates et sa notice, ou, à défaut, le
   * début de sa biographie — de quoi choisir un lien sans ouvrir chaque fiche.
   */
  resume(s) {
    const lang = getLanguage();
    const dates = [s.born, s.died].map((a) => (a == null ? '?' : formatYear(a, { circa: s.circa }))).join(' – ');
    let texte = pickText(s.desc, lang);
    if (!texte) {
      const bio = pickText(s.bio, lang) || '';
      texte = bio.split(/(?<=[.!?])\s/)[0] || '';
      // « Jean Marinoni, né le… et mort le… à Naples, est un prêtre… » : le nom
      // et les dates sont déjà dits, on garde ce qu'il était.
      const verbe = texte.match(/[,)]\s+(?:est|était|fut|is|was)\s+(.+)$/);
      if (verbe) texte = verbe[1];
    }
    if (texte.length > 120) texte = `${texte.slice(0, 117).replace(/\s+\S*$/, '')}…`;
    return texte ? `${dates} · ${texte.charAt(0).toUpperCase()}${texte.slice(1)}` : dates;
  }

  /**
   * Une fiche resserrée : le portrait, le nom, les dates et le lieu, la notice,
   * la biographie à déplier, et le chemin vers la carte.
   */
  ficheCourte(s) {
    const lang = getLanguage();
    const cadre = h('figure', { class: 'jeux__fiche-portrait', hidden: true });
    portraitOf(s).then((p) => {
      if (!p) return;
      const img = h('img', { src: p.src, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
      img.addEventListener('load', () => { cadre.hidden = false; }, { once: true });
      fill(cadre, [img]);
    });
    const dates = [s.born, s.died].map((a) => (a == null ? '?' : formatYear(a, { circa: s.circa }))).join(' – ');
    const bio = pickText(s.bio, lang);
    const desc = pickText(s.desc, lang);
    return h('div', { class: 'jeux__fiche' },
      cadre,
      h('div', { class: 'jeux__fiche-texte' },
        h('p', { class: 'jeux__fiche-nom', text: this.atlas.saintName(s, lang) }),
        h('p', { class: 'jeux__fiche-meta', text: `${dates} · ${s.city || ''} (${this.atlas.countryName(s.country, lang)})` }),
        desc ? h('p', { class: 'jeux__fiche-desc', text: desc }) : null,
        bio ? h('details', { class: 'jeux__fiche-bio' }, h('summary', { text: t('jeux.lireSuite') }), h('p', { text: bio })) : null,
        h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.voirCarte'), onclick: () => this.onOpen?.(s.id) })));
  }

  // -- qui est-ce ? -------------------------------------------------------------

  quiChoix() {
    this.wNiveau = this.wNiveau || 1;
    return h('div', {},
      this.retour(),
      h('h2', { class: 'panel__section', text: t('jeux.qui.titre') }),
      h('p', { class: 'field__hint', text: t('jeux.qui.regle') }),
      this.notorieteChoix(this.wNiveau, (v) => this.aller('quiChoix', { wNiveau: v })),
      h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.commencer'),
        onclick: () => this.demarrerQui() }));
  }

  demarrerQui() {
    const pool = this.atlas.saints.filter((s) => this.niveaux.get(s.id) === this.wNiveau
      && (s.born != null || s.died != null));
    const saint = auHasard(pool);
    this.aller('qui', { qui: saint
      ? { saint, restants: pool, historique: [], posees: new Set(), essais: 0, fini: null, saisie: '', rate: null }
      : null });
  }

  /** Les points en jeu : moins on a posé de questions et raté de noms, plus il y en a. */
  valeurQui(q) {
    return Math.max(this.wNiveau, 20 * this.wNiveau - 2 * q.historique.length - 5 * q.essais);
  }

  quiVue() {
    const q = this.qui;
    const lang = getLanguage();
    if (!q) return h('div', {}, this.retour(), h('p', { class: 'results__empty', text: t('jeux.vide') }));
    const nom = (s) => this.atlas.saintName(s, lang);
    const valeur = this.valeurQui(q);

    const finir = (gagne) => {
      q.fini = gagne ? 'gagne' : 'perdu';
      if (gagne) { q.gain = valeur; ajouterPoints(valeur); }
      this.render();
    };
    // Une question : la réponse vient du saint secret, et l'on garde les
    // saints qui répondent comme lui.
    const poser = (question) => {
      const oui = question.test(q.saint);
      q.historique.push({ libelle: question.libelle, oui });
      q.posees.add(question.cle);
      q.restants = q.restants.filter((s) => question.test(s) === oui);
      q.rate = null;
      q.indice = '';
      this.render();
    };
    // L'indice tapé : compris, il devient une question ; incompris, on le dit
    // avec des exemples.
    const demander = (texte) => {
      if (!this.paysIndex || this.paysLang !== lang) {
        this.paysIndex = buildCountryIndex(this.atlas, lang);
        this.paysLang = lang;
      }
      const question = interpreterIndice(this.atlas, texte, lang, this.paysIndex);
      if (!question) { q.rate = t('jeux.incompris', { i: texte }); this.render(); return; }
      if (q.posees.has(question.cle)) { q.rate = t('jeux.dejaPose', { i: question.libelle }); this.render(); return; }
      poser(question);
    };
    // Tenter un nom : juste, c'est gagné ; faux, ce saint est écarté.
    const tenter = (s) => {
      if (s.id === q.saint.id) return finir(true);
      q.essais += 1;
      q.restants = q.restants.filter((x) => x.id !== s.id);
      q.rate = t('jeux.pasLui', { nom: nom(s) });
      return this.render();
    };

    const historique = q.historique.length
      ? h('ol', { class: 'jeux__historique' }, ...q.historique.map((e) => h('li', { class: e.oui ? 'is-oui' : 'is-non' },
        h('span', { text: e.libelle }), h('strong', { text: e.oui ? t('jeux.oui') : t('jeux.non') }))))
      : null;

    if (q.fini) {
      return h('div', { class: 'jeux__qui' }, this.retour(), historique,
        h('div', { class: `jeux__verdict ${q.fini === 'gagne' ? 'is-juste' : 'is-faux'}` },
          h('p', { text: q.fini === 'gagne' ? t('jeux.quiGagne', { nom: nom(q.saint), n: q.gain }) : t('jeux.quiPerdu', { nom: nom(q.saint) }) }),
          h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.voirFiche', { nom: nom(q.saint) }), onclick: () => this.onOpen?.(q.saint.id) })),
        h('button', { class: 'btn btn--primary', type: 'button', text: t('jeux.rejouer'), onclick: () => this.demarrerQui() }));
    }

    // On tape un indice ; le jeu répond, et la liste se resserre.
    const champIndice = h('input', { class: 'control', type: 'text', value: q.indice || '',
      placeholder: t('jeux.indicePlaceholder'), 'aria-label': t('jeux.indicePlaceholder'),
      oninput: (e) => { q.indice = e.target.value; } });
    const formIndice = h('form', { class: 'jeux__ecrire', onsubmit: (e) => {
      e.preventDefault();
      if (champIndice.value.trim()) demander(champIndice.value);
    } }, champIndice, h('button', { class: 'btn btn--primary', type: 'submit', text: t('jeux.demander') }));
    setTimeout(() => champIndice.focus(), 0);

    // Des idées, pour qui ne sait que demander : les questions qui apprennent
    // encore quelque chose sur les saints qui restent.
    const familles = questionsQui(this.atlas, q.restants, lang, q.posees);
    const questions = h('details', { class: 'jeux__idees' }, h('summary', { text: t('jeux.idees') }),
      h('div', { class: 'jeux__familles' }, ...familles.map((f) => h('div', { class: 'jeux__famille' },
      h('p', { class: 'jeux__famille-titre', text: t(`jeux.qg.${f.cle}`) }),
      h('div', { class: 'jeux__options' }, ...f.questions.map((question) => h('button', {
        class: 'chip chip--scope', type: 'button', text: question.libelle, onclick: () => poser(question),
      })))))));

    // Tenter un nom : parmi les saints qui restent, par la recherche, ou dans la
    // liste entière quand elle est assez courte pour se lire.
    const suggestions = h('div', { class: 'lies-edit__suggestions' });
    const remplir = () => {
      const g = fold(q.saisie).trim();
      const trouves = g.length < 2 ? [] : q.restants.filter((s) => fold(nom(s)).includes(g)).slice(0, 8);
      fill(suggestions, trouves.map((s) => h('button', { class: 'lies-edit__choix', type: 'button', onclick: () => tenter(s) },
        emblemSvg(s), h('span', { text: nom(s) }), h('span', { class: 'lies-edit__lieu', text: s.city || '' }))));
    };
    const champ = h('input', { class: 'control', type: 'search', value: q.saisie, placeholder: t('jeux.quiSaisie'),
      oninput: (e) => { q.saisie = e.target.value; remplir(); } });
    remplir();
    // La liste des saints possibles, toujours sous les yeux : elle se resserre à
    // chaque réponse, et l'on y tente un nom d'un appui.
    const tries = [...q.restants].sort((a, b) => nom(a).localeCompare(nom(b), lang));
    const liste = h('div', { class: 'jeux__restants' },
      ...tries.slice(0, 60).map((s) => h('button', { class: 'jeux__carte', type: 'button', onclick: () => tenter(s) },
        emblemSvg(s), h('span', { text: nom(s) }))),
      tries.length > 60 ? h('span', { class: 'field__hint', text: t('jeux.etAutres', { n: tries.length - 60 }) }) : null);

    return h('div', { class: 'jeux__qui' },
      this.retour(),
      h('p', { class: 'jeux__compteur', text: t('jeux.questions', { n: q.historique.length, pts: valeur }) }),
      h('p', { class: 'jeux__question', text: t('jeux.restants', { n: q.restants.length }) }),
      formIndice,
      q.rate ? h('p', { class: 'jeux__revele', text: q.rate }) : null,
      historique,
      questions,
      h('p', { class: 'jeux__famille-titre', text: t('jeux.tenter') }),
      champ, suggestions, liste,
      h('div', { class: 'jeux__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', text: t('jeux.abandonner'), onclick: () => finir(false) })));
  }
}
