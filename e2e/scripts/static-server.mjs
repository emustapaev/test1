// Минимальный статический сервер для apps/web/out (без зависимостей).
// Поведение как у S3 + CloudFront: /en/ → en/index.html, неизвестный путь → 404.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('../../apps/web/out', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function resolveFile(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(root, rel);
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url || '/', 'http://localhost');
  let file = await resolveFile(pathname);
  let status = 200;
  if (!file) {
    file = join(root, '404.html');
    status = 404;
  }
  try {
    const body = await readFile(file);
    const type = types[extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    // Как CloudFront: сжатие текстовых ответов и долгий кэш для хешированных ассетов.
    if (pathname.startsWith('/_next/static/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    const compressible = /^(text\/|application\/(json|xml)|image\/svg)|javascript/.test(type);
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      res.writeHead(status, headers);
      res.end(gzipSync(body));
      return;
    }
    res.writeHead(status, headers);
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Accepting connections at http://localhost:${port}`));
