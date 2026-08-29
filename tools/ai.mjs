/**
 * Génération de fiches de saints par l'API Claude.
 *
 * Ce module tourne **côté serveur**, jamais dans le navigateur : c'est ce qui
 * permet à la clé d'API de rester sur la machine qui lance l'application. Une
 * page statique ne peut pas porter cette clé sans l'exposer à tous ses
 * visiteurs, et c'est la seule raison pour laquelle l'assistant a besoin d'un
 * serveur pour cette fonction-là.
 *
 * Ce que le modèle renvoie n'est pas publié tel quel : l'application le fait
 * repasser par les mêmes contrôles que le réservoir hors ligne — pays connu,
 * point tombant dans ce pays, dates cohérentes, fête possible, absence de
 * doublon — avant de le proposer à l'administrateur, qui tranche.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5';
const API_VERSION = '2023-06-01';

/** Plafond de fiches par appel : au-delà, la qualité se dégrade. */
export const MAX_COUNT = 8;

/** Vocabulaire des qualités, identique à celui du corpus. */
const TITLES = [
  'abbess', 'abbot', 'apostle', 'bishop', 'cardinal', 'deacon', 'disciple', 'doctor',
  'evangelist', 'founder', 'hermit', 'king', 'layperson', 'martyr', 'missionary', 'monk',
  'mystic', 'nun', 'pilgrim', 'pope', 'preacher', 'priest', 'prince', 'prophet', 'queen',
  'religious', 'soldier', 'virgin', 'widow', 'youth',
];

const SCHEMA = {
  type: 'object',
  properties: {
    saints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'object',
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
          desc: {
            type: 'object',
            properties: { fr: { type: 'string' }, en: { type: 'string' } },
            required: ['fr', 'en'],
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'sex', 'born', 'died', 'circa', 'city', 'country',
          'lat', 'lng', 'feast', 'titles', 'desc', 'confidence'],
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

/** Extrait le JSON de la réponse, que l'API le pré-analyse ou non. */
function extractPayload(body) {
  if (body.parsed_output) return body.parsed_output;
  const text = (body.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Demande des fiches au modèle.
 *
 * @returns {Promise<{saints: Array, usage: object}>}
 * @throws {Error} avec `status` quand l'API refuse la requête.
 */
export async function proposeSaints({ count, countries, century, exclude, regionLabel, apiKey }) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: buildPrompt({ count, countries, century, exclude, regionLabel }),
      }],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // Un refus de sécurité renvoie 200 : il faut lire stop_reason avant content.
  if (body.stop_reason === 'refusal') {
    const error = new Error('refus du modèle');
    error.status = 422;
    throw error;
  }

  const payload = extractPayload(body);
  if (!payload || !Array.isArray(payload.saints)) {
    const error = new Error('réponse illisible');
    error.status = 502;
    throw error;
  }

  return { saints: payload.saints, usage: body.usage || {} };
}
