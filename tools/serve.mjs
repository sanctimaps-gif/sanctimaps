/**
 * Serveur de l'application.
 *
 *   npm start                     → http://127.0.0.1:8080
 *   PORT=3000 npm start
 *   HOST=0.0.0.0 npm start        → ouvre l'accès au réseau local
 *
 * Il sert les fichiers statiques et, si un fournisseur de modèle est configuré
 * dans l'environnement, expose « POST /api/ai/propose », par lequel l'assistant
 * de l'administrateur demande des fiches de saints. La clé — quand le
 * fournisseur en demande une — reste ici : elle n'est jamais transmise au
 * navigateur.
 *
 * Le fournisseur se choisit par AI_PROVIDER (openai | ollama | anthropic) ;
 * voir providers.mjs pour les variables reconnues. Un modèle local via Ollama
 * ne demande ni clé ni compte :
 *
 *   AI_PROVIDER=ollama AI_MODEL=llama3.1 npm start
 *   AI_PROVIDER=openai AI_BASE_URL=http://127.0.0.1:1234/v1 AI_API_KEY=x npm start
 *
 * Sans fournisseur, l'application fonctionne entièrement : l'assistant se
 * rabat alors sur son réservoir hors ligne.
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_COUNT, proposeSaints } from './ai.mjs';
import { providerNames, resolveConfig } from './providers.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
// Localhost par défaut : l'endpoint d'IA dépense la clé de qui lance le
// serveur, il n'a rien à faire sur le réseau local sans un choix explicite.
const HOST = process.env.HOST || '127.0.0.1';

// Résolu une fois au démarrage : changer de fournisseur, c'est relancer.
const AI = resolveConfig();

/** Taille maximale d'un corps de requête, pour ne pas se laisser inonder. */
const MAX_BODY = 512 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((ok, ko) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        ko(Object.assign(new Error('corps trop volumineux'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        ko(Object.assign(new Error('JSON invalide'), { status: 400 }));
      }
    });
    req.on('error', ko);
  });
}

/** Ce que le navigateur a besoin de savoir : pas la clé, seulement le service. */
function aiStatus() {
  return AI.ok
    ? { available: true, maxCount: MAX_COUNT, provider: AI.label, model: AI.model, local: AI.id === 'ollama' }
    : { available: false, maxCount: MAX_COUNT, reason: AI.reason };
}

async function handleProposal(req, res) {
  if (!AI.ok) {
    sendJSON(res, 503, {
      error: 'no-provider',
      message: `aucun fournisseur configuré : posez AI_PROVIDER (${providerNames().join(' | ')})`,
    });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: 'bad-request', message: error.message });
    return;
  }

  const count = Math.min(MAX_COUNT, Math.max(1, Number(body.count) || 5));
  const countries = Array.isArray(body.countries) ? body.countries.slice(0, 300) : [];
  const exclude = Array.isArray(body.exclude) ? body.exclude.slice(0, 600) : [];
  const century = Number.isInteger(body.century) ? body.century : null;

  if (!countries.length) {
    sendJSON(res, 400, { error: 'bad-request', message: 'aucun pays autorisé fourni' });
    return;
  }

  try {
    const result = await proposeSaints(AI, {
      count,
      countries,
      century,
      exclude,
      regionLabel: typeof body.regionLabel === 'string' ? body.regionLabel.slice(0, 80) : '',
    });
    sendJSON(res, 200, result);
  } catch (error) {
    console.error('IA :', error.message);
    sendJSON(res, error.status && error.status < 600 ? error.status : 502, {
      error: 'upstream',
      message: error.message,
    });
  }
}

function serveFile(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  // `normalize` neutralise les remontées « ../ » avant la comparaison au ROOT.
  const target = join(ROOT, normalize(requested === '/' ? '/index.html' : requested));

  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = statSync(target);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(target)] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-cache',
  });
  createReadStream(target).pipe(res);
}

createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (path === '/api/ai/status') {
    sendJSON(res, 200, aiStatus());
    return;
  }
  if (path === '/api/ai/propose') {
    if (req.method !== 'POST') {
      sendJSON(res, 405, { error: 'method', message: 'POST attendu' });
      return;
    }
    handleProposal(req, res);
    return;
  }
  serveFile(req, res);
}).listen(PORT, HOST, () => {
  console.log(`SanctiMaps → http://${HOST}:${PORT}`);
  if (AI.ok) {
    console.log(`  IA : ${AI.label} — ${AI.model} sur ${AI.baseUrl}`);
    if (AI.apiKey) console.log('        la clé reste ici, elle n’est jamais transmise au navigateur');
  } else {
    const raison = { nokey: 'clé absente pour ce fournisseur', unknown: `fournisseur inconnu : ${AI.id}` };
    console.log(`  IA : inactive — ${raison[AI.reason] || 'aucun fournisseur configuré'}`);
    console.log(`        posez AI_PROVIDER parmi ${providerNames().join(' | ')} ;`
      + ' le réservoir hors ligne fonctionne sans');
  }
});
