/**
 * Serveur statique minimal, sans dépendance :
 *
 *   npm start            → http://localhost:8080
 *   PORT=3000 npm start
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
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
}).listen(PORT, () => {
  console.log(`SanctiMaps → http://localhost:${PORT}`);
});
