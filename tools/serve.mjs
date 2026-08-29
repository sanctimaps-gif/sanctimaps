/**
 * Serveur de l'application.
 *
 *   npm start                     → http://127.0.0.1:8080
 *   PORT=3000 npm start
 *   HOST=0.0.0.0 npm start        → ouvre l'accès au réseau local
 *
 * Il sert les fichiers statiques et, si une clé d'API est présente dans
 * l'environnement, expose « POST /api/ai/propose », par lequel l'assistant de
 * l'administrateur demande des fiches de saints au modèle. La clé reste ici :
 * elle n'est jamais transmise au navigateur.
 *
 * Sans clé, l'application fonctionne entièrement : l'assistant se rabat alors
 * sur son réservoir hors ligne.
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_COUNT, proposeSaints } from './ai.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
// Localhost par défaut : l'endpoint d'IA dépense la clé de qui lance le
// serveur, il n'a rien à faire sur le réseau local sans un choix explicite.
const HOST = process.env.HOST || '127.0.0.1';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

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

async function handleProposal(req, res) {
  if (!API_KEY) {
    sendJSON(res, 503, {
      error: 'no-key',
      message: 'ANTHROPIC_API_KEY absente : lancez le serveur avec la clé pour activer l’IA.',
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
    const result = await proposeSaints({
      count,
      countries,
      century,
      exclude,
      regionLabel: typeof body.regionLabel === 'string' ? body.regionLabel.slice(0, 80) : '',
      apiKey: API_KEY,
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
    sendJSON(res, 200, { available: Boolean(API_KEY), maxCount: MAX_COUNT });
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
  console.log(API_KEY
    ? '  IA : activée (clé lue dans ANTHROPIC_API_KEY, jamais transmise au navigateur)'
    : '  IA : inactive (définissez ANTHROPIC_API_KEY pour l’activer ; le réservoir hors ligne fonctionne sans)');
});
