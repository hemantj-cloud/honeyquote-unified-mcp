/**
 * Serves bundled widget HTML so hosts that resolve dev URLs like /widgets/greeting
 * to http://127.0.0.1:3001/widgets/greeting do not get "connection refused".
 *
 * Also serves /_next/static/... from the export output so un-inlined HTML can load
 * scripts and styles (e.g. before post-build inlining).
 *
 * Requires: npm run build (produces src/widgets/out)
 * Usage: npm run widgets:serve
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'src', 'widgets', 'out');
const port = Number(process.env.WIDGETS_DEV_PORT || process.env.PORT || 3001);
const host = process.env.WIDGETS_BIND || '127.0.0.1';

const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/_next\//, '_next/');
  const filePath = path.resolve(outDir, rel);
  if (!filePath.startsWith(path.resolve(outDir)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const ct = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': ct,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0];

  if (pathname.startsWith('/_next/')) {
    sendStatic(req, res, pathname);
    return;
  }

  const match = /^\/widgets\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Widget dev helper — use /widgets/<route> (e.g. /widgets/greeting) or /_next/static/.... Run npm run build first.',
    );
    return;
  }

  const route = path.basename(match[1]);
  if (!/^[a-zA-Z0-9_-]+$/.test(route)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid route');
    return;
  }

  const filePath = path.resolve(outDir, `${route}.html`);
  if (!filePath.startsWith(path.resolve(outDir))) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      `Missing ${path.relative(projectRoot, filePath)}. From repo root run: npm run build`,
    );
    return;
  }

  const html = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
});

server.listen(port, host, () => {
  console.error(
    `[widgets:serve] http://${host}:${port}/widgets/<route>  e.g. /widgets/greeting`,
  );
  console.error(`[widgets:serve] static assets: http://${host}:${port}/_next/static/...`);
});

server.on('error', (err) => {
  console.error('[widgets:serve]', err.message);
  process.exit(1);
});
