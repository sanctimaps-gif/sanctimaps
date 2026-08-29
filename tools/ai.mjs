/**
 * Génération de fiches de saints par un modèle de langue.
 *
 * Ce module dit **quoi demander** — la consigne, le schéma de la réponse, les
 * règles que les fiches doivent respecter. À **qui** le demander ne le regarde
 * pas : c'est `providers.mjs` qui parle au service choisi, qu'il tourne sur la
 * machine ou chez un fournisseur. L'assistant n'est lié à aucune maison.
 *
 * Il tourne côté serveur, jamais dans le navigateur : c'est ce qui permet à la
 * clé — quand il en faut une — de rester sur la machine qui lance
 * l'application. Une page statique ne peut pas porter une clé sans l'exposer à
 * tous ses visiteurs, et c'est la seule raison pour laquelle l'assistant a
 * besoin d'un serveur pour cette fonction-là.
 *
 * Ce que le modèle renvoie n'est pas publié tel quel : l'application le fait
 * repasser par les mêmes contrôles que le réservoir hors ligne — pays connu,
 * point tombant dans ce pays, dates cohérentes, fête possible, absence de
 * doublon — avant de le proposer à l'administrateur, qui tranche. Cette
 * vérification vaut d'autant plus qu'un petit modèle local se trompe plus
 * souvent qu'un grand modèle distant.
 */

import { ask } from './providers.mjs';

/** Plafond de fiches par appel : au-delà, la qualité se dégrade. */
export const MAX_COUNT = 8;

/** Vocabulaire des qualités, identique à celui du corpus. */
const TITLES = [
  'abbess', 'abbot', 'apostle', 'bishop', 'cardinal', 'deacon', 'disciple', 'doctor',
  'evangelist', 'founder', 'hermit', 'king', 'layperson', 'martyr', 'missionary', 'monk',
  'mystic', 'nun', 'pilgrim', 'pope', 'preacher', 'priest', 'prince', 'prophet', 'queen',
  'religious', 'soldier', 'virgin', 'widow', 'youth',
];

// Le mode strict des services compatibles OpenAI exige que chaque objet
// interdise les propriétés surnuméraires et énumère tout ce qu'il requiert.
// Les autres fournisseurs l'acceptent sans y voir malice.
const text2 = (a, b) => ({
  type: 'object',
  additionalProperties: false,
  properties: { [a]: { type: 'string' }, [b]: { type: 'string' } },
  required: [a, b],
});

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    saints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'object',
            additionalProperties: false,
            properties: {
              fr: { type: 'string' },
              en: { type: 'string' },
              la: { type: 'string' },
            },
            required: ['fr', 'en', 'la'],
          },
          sex: { type: 'string', enum: ['m', 'f'] },
          born: { type: ['integer', 'null'] },
          died: { type: ['integer', 'null'] },
          circa: { type: 'boolean' },
          city: { type: 'string' },
          country: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          feast: { type: 'string' },
          titles: { type: 'array', items: { type: 'string', enum: TITLES } },
          desc: text2('fr', 'en'),
          patronage: text2('fr', 'en'),
          bio: text2('fr', 'en'),
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'sex', 'born', 'died', 'circa', 'city', 'country',
          'lat', 'lng', 'feast', 'titles', 'desc', 'patronage', 'bio', 'confidence'],
      },
    },
  },
  required: ['saints'],
};

const SYSTEM = `Tu remplis un atlas des saints de l'Église catholique.

Règles impératives :
- Ne propose que des saints réels, canonisés ou béatifiés, dont tu es sûr.
- Le lieu est celui de la NAISSANCE, rapporté au pays d'AUJOURD'HUI : Édith
  Stein est née à Breslau, donc en Pologne ; Ambroise de Milan à Trèves, donc
  en Allemagne.
- « country » est un code ISO 3166-1 alpha-3 pris dans la liste fournie.
- « lat » et « lng » sont les coordonnées de la ville de naissance, en degrés
  décimaux, et doivent tomber à l'intérieur du pays déclaré.
- « feast » est la date de fête au format MM-JJ.
- « born » et « died » sont des années ; un nombre négatif vaut avant
  Jésus-Christ ; « circa » vaut true quand la date est traditionnelle plutôt
  qu'établie. Une date inconnue vaut null, mais jamais les deux à la fois.
- « desc » tient en une phrase, en français et en anglais, qui apprend quelque
  chose de précis sur la personne.
- « patronage » énumère ce dont le saint est patron, en français et en anglais,
  séparé par des virgules — et seulement si le patronage est bien attesté. Une
  chaîne vide vaut mieux qu'un patronage inventé.
- « bio » raconte la vie en trois à six phrases, en français et en anglais :
  l'origine, le tournant, l'œuvre, la mort et le culte. Des faits, pas des
  formules pieuses.
- « confidence » dit ta propre certitude sur l'exactitude de la fiche :
  high, medium ou low.
- N'invente jamais pour remplir : mieux vaut rendre moins de fiches que le
  nombre demandé. Si tu n'es sûr de rien, rends une liste vide.
- Ne reprends aucun saint de la liste des noms déjà présents.`;

/** Construit la consigne d'un appel, selon la région et le siècle demandés. */
function buildPrompt({ count, countries, century, exclude, regionLabel }) {
  const lines = [
    `Propose ${count} saints ${regionLabel ? `nés en ${regionLabel}` : 'du monde entier'}`,
    century ? `dont la naissance tombe au ${century}e siècle.` : '.',
    '',
    'Codes de pays autorisés :',
    countries.join(' '),
    '',
    `Saints déjà présents dans l'atlas (${exclude.length}), à ne pas reprendre :`,
    exclude.join(' · '),
  ];
  return lines.join('\n');
}

/**
 * Demande des fiches au modèle en service.
 *
 * @param {object} config fournisseur résolu, tel que rendu par resolveConfig
 * @returns {Promise<{saints: Array, usage: object}>}
 * @throws {Error} avec `status`, que le serveur relaie.
 */
export async function proposeSaints(config, { count, countries, century, exclude, regionLabel }) {
  const { parsed, usage } = await ask(config, {
    system: SYSTEM,
    prompt: buildPrompt({ count, countries, century, exclude, regionLabel }),
    schema: SCHEMA,
  });

  if (!Array.isArray(parsed.saints)) {
    const error = new Error('réponse illisible');
    error.status = 502;
    throw error;
  }

  // Un modèle peut rendre des fiches à moitié remplies. Celles qui n'ont pas
  // de quoi être vérifiées sont écartées ici, avant même les contrôles :
  // sans nom ni pays, il n'y a rien à contrôler.
  const saints = parsed.saints.filter((s) => s && (s.name?.fr || s.name?.en) && s.country);
  return { saints, usage };
}
