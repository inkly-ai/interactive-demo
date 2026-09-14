#!/usr/bin/env node
// A stand-in for "your website": serves a built demo folder plus a host page
// that embeds it inline, opens it in the pop-up, logs the runtime events the
// framed player relays, and receives form submissions.
//
//   node testbed/host/serve.mjs [--dist <dir>] [--port 4321]
//
// <dir> is the output of `interactive-demo build` (the folder that holds one
// subfolder per demo and embed.js). Defaults to examples/getting-started/dist.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const distDir = resolve(repoRoot, flag('dist', 'examples/getting-started/dist'));
const port = Number(flag('port', '4321'));

if (!existsSync(distDir)) {
  process.stderr.write(
    `testbed host: no build at ${distDir}\n` +
      `Run \`node packages/cli/dist/cli.js build\` inside a project first, or pass --dist <dir>.\n`,
  );
  process.exit(1);
}

const demos = readdirSync(distDir)
  .filter((name) => statSync(join(distDir, name)).isDirectory())
  .filter((name) => existsSync(join(distDir, name, 'index.html')))
  .map((slug) => {
    let title = slug;
    let width = 1440;
    let height = 900;
    try {
      const html = readFileSync(join(distDir, slug, 'index.html'), 'utf8');
      const raw = /<script[^>]*id="demo-config"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
      const config = raw ? JSON.parse(raw) : null;
      if (config?.title) title = config.title;
      const screen = config?.steps?.find((step) => step?.background?.naturalWidth);
      if (screen) {
        width = screen.background.naturalWidth;
        height = screen.background.naturalHeight;
      }
    } catch {
      /* a demo we can't read still gets listed by slug */
    }
    return { slug, title, width, height };
  });

/** Everything a form widget has POSTed to this server, newest first. */
const submissions = [];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

function sendJson(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(body);
}

function sendFile(res, path) {
  if (!existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(path));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (path === '/api/form' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
    const entry = { at: new Date().toISOString(), payload };
    submissions.unshift(entry);
    process.stdout.write(`\n  form submission → ${JSON.stringify(payload)}\n`);
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/api/submissions') return sendJson(res, 200, { submissions });
  if (path === '/api/demos') return sendJson(res, 200, { demos });

  if (path === '/' || path === '/index.html') {
    const html = readFileSync(join(here, 'index.html'), 'utf8').replace(
      '/* __TESTBED_DEMOS__ */',
      `window.__testbed = ${JSON.stringify({ demos, dist: distDir })};`,
    );
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }

  if (path.startsWith('/demo/')) {
    const rel = normalize(path.slice('/demo/'.length)).replace(/^(\.\.[/\\])+/, '');
    const target = join(distDir, rel);
    return sendFile(res, rel.endsWith('/') || rel === '' ? join(target, 'index.html') : target);
  }

  if (path === '/embed.js') return sendFile(res, join(distDir, 'embed.js'));

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(port, () => {
  process.stdout.write(
    `\n  testbed host running at http://localhost:${port}/\n` +
      `  serving: ${distDir}\n` +
      `  demos:   ${demos.map((d) => d.slug).join(', ') || '(none)'}\n` +
      `  form endpoint: http://localhost:${port}/api/form\n\n`,
  );
});
