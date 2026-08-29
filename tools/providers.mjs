/**
 * Fournisseurs de modèle.
 *
 * L'assistant ne dépend d'aucune maison en particulier. Trois façons de parler
 * à un modèle sont prévues, et elles couvrent à peu près tout ce qui existe :
 *
 *   openai     tout service parlant le dialecte « chat completions » — OpenAI,
 *              Mistral, Groq, Together, DeepSeek, OpenRouter, mais aussi un
 *              serveur que vous hébergez : vLLM, LM Studio, llama.cpp, LocalAI.
 *   ollama     un modèle tournant sur votre propre machine. Aucune clé, aucun
 *              compte, aucun appel sortant.
 *   anthropic  l'API de Claude.
 *
 * Chaque adaptateur reçoit le même travail — une consigne, un schéma JSON, un
 * nombre de fiches — et rend la même chose : un objet analysé. Ce qui change
 * d'un fournisseur à l'autre — l'adresse, l'en-tête d'authentification, la
 * façon de réclamer du JSON structuré, l'endroit où lire la réponse — est
 * confiné ici. Le reste de l'application ignore lequel est en service.
 *
 * Se règle par l'environnement :
 *
 *   AI_PROVIDER   openai | ollama | anthropic   (déduit si absent)
 *   AI_BASE_URL   adresse du service            (défaut selon le fournisseur)
 *   AI_MODEL      identifiant du modèle         (défaut selon le fournisseur)
 *   AI_API_KEY    clé, si le service en demande une
 *
 * Les variables usuelles sont reconnues en second rang : OPENAI_API_KEY,
 * ANTHROPIC_API_KEY, OLLAMA_HOST.
 */

/** Au-delà, la réponse est probablement partie en boucle. */
const MAX_OUTPUT_TOKENS = 16000;

/** Délai avant d'abandonner un appel : un modèle local peut être lent. */
const TIMEOUT = 180000;

/**
 * Un service compatible « chat completions ».
 *
 * C'est le dialecte le plus répandu : l'écrire une fois suffit pour une
 * douzaine de fournisseurs et pour tout serveur local qui l'imite.
 */
const openai = {
  id: 'openai',
  label: 'OpenAI-compatible',
  needsKey: true,
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',

  request({ baseUrl, model, apiKey, system, prompt, schema }) {
    return {
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      body: {
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        // Le mode strict oblige le service à respecter le schéma plutôt qu'à
        // rendre du JSON approximatif. Les serveurs qui l'ignorent rendent tout
        // de même du JSON, que l'analyse ci-dessous accepte.
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'saints', strict: true, schema },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
    };
  },

  read(body) {
    const choice = body.choices?.[0];
    if (choice?.finish_reason === 'content_filter') {
      return { refused: true };
    }
    return { text: choice?.message?.content, usage: body.usage };
  },
};

/**
 * Un modèle local servi par Ollama.
 *
 * C'est l'option sans fournisseur du tout : le modèle tourne sur la machine,
 * rien ne sort, rien n'est facturé. En contrepartie la qualité dépend de ce
 * que la machine peut faire tourner, et les petites tailles se trompent sur
 * les dates et les lieux — la vérification n'en est que plus utile.
 */
const ollama = {
  id: 'ollama',
  label: 'Ollama (local)',
  needsKey: false,
  defaultBaseUrl: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  defaultModel: 'llama3.1',

  request({ baseUrl, model, system, prompt, schema }) {
    return {
      url: `${baseUrl.replace(/\/$/, '')}/api/chat`,
      headers: {},
      body: {
        model,
        stream: false,
        // Ollama contraint la sortie au schéma qu'on lui passe tel quel.
        format: schema,
        options: { num_predict: MAX_OUTPUT_TOKENS },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
    };
  },

  read(body) {
    return {
      text: body.message?.content,
      usage: body.eval_count
        ? { output_tokens: body.eval_count, input_tokens: body.prompt_eval_count }
        : {},
    };
  },
};

/** L'API de Claude. */
const anthropic = {
  id: 'anthropic',
  label: 'Anthropic',
  needsKey: true,
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  defaultModel: 'claude-opus-5',

  request({ baseUrl, model, apiKey, system, prompt, schema }) {
    return {
      url: `${baseUrl.replace(/\/$/, '')}/messages`,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: prompt }],
      },
    };
  },

  read(body) {
    // Un refus de sécurité arrive en HTTP 200 : il faut lire stop_reason
    // avant d'aller chercher le contenu.
    if (body.stop_reason === 'refusal') return { refused: true };
    if (body.parsed_output) return { parsed: body.parsed_output, usage: body.usage };
    const text = (body.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return { text, usage: body.usage };
  },
};

const PROVIDERS = { openai, ollama, anthropic };

/**
 * Quel fournisseur, à quelle adresse, avec quel modèle.
 *
 * Sans `AI_PROVIDER`, on déduit du reste de l'environnement, en allant du plus
 * explicite au plus général. Aucune valeur par défaut ne fait sortir un appel
 * de la machine sans qu'une clé ait été posée pour cela.
 */
export function resolveConfig(env = process.env) {
  const named = env.AI_PROVIDER?.trim().toLowerCase();
  const key = env.AI_API_KEY || '';

  let id = named;
  if (!id) {
    if (env.OPENAI_API_KEY || (key && env.AI_BASE_URL)) id = 'openai';
    else if (env.ANTHROPIC_API_KEY) id = 'anthropic';
    else if (env.AI_BASE_URL || env.OLLAMA_HOST) id = 'ollama';
  }
  if (!id) return { ok: false, reason: 'unset' };

  const provider = PROVIDERS[id];
  if (!provider) return { ok: false, reason: 'unknown', id };

  const apiKey = key
    || (id === 'anthropic' ? env.ANTHROPIC_API_KEY : '')
    || (id === 'openai' ? env.OPENAI_API_KEY : '')
    || '';
  if (provider.needsKey && !apiKey) return { ok: false, reason: 'nokey', id };

  return {
    ok: true,
    id,
    label: provider.label,
    baseUrl: env.AI_BASE_URL || provider.defaultBaseUrl,
    model: env.AI_MODEL || provider.defaultModel,
    apiKey,
  };
}

export function providerNames() {
  return Object.keys(PROVIDERS);
}

/** Analyse une sortie de modèle, qu'elle soit déjà structurée ou en texte. */
function parse(read) {
  if (read.parsed) return read.parsed;
  const text = String(read.text ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Certains services glissent le JSON dans un bloc de code, ou le font
    // précéder d'une phrase. On récupère le premier objet complet.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Envoie le travail au fournisseur en service et rend l'objet analysé.
 *
 * @throws {Error} portant `status`, pour que le serveur sache quoi répondre.
 */
export async function ask(config, { system, prompt, schema }) {
  const provider = PROVIDERS[config.id];
  const { url, headers, body } = provider.request({ ...config, system, prompt, schema });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (cause) {
    // Un service local éteint se manifeste ici, et le message doit le dire
    // clairement plutôt que de laisser croire à une panne du modèle.
    const error = new Error(`${provider.label} injoignable (${config.baseUrl})`);
    error.status = 503;
    error.cause = cause;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
    const error = new Error(typeof message === 'string' ? message : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const read = provider.read(payload);
  if (read.refused) {
    const error = new Error('refus du modèle');
    error.status = 422;
    throw error;
  }

  const parsed = parse(read);
  if (!parsed) {
    const error = new Error('réponse illisible');
    error.status = 502;
    throw error;
  }
  return { parsed, usage: read.usage || {} };
}
