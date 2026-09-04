import { createReadStream, existsSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The local editor is a prebuilt single-page app (packages/editor) that the
 * CLI ships under `dist/editor/`. `dev` serves it at `/__demo/editor/`; any
 * extension-less path under that prefix gets `index.html` so the app's own
 * hash routing takes over, while a missing file with an extension is a 404.
 */

export const EDITOR_STATIC_PREFIX = '/__demo/editor';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Locate the built editor. In the published package it sits next to
 * `cli.js` (`dist/editor`); in the workspace it is `packages/editor/dist`.
 */
export function resolveEditorDir(): string | null {
  const candidates = [
    join(__dirname, 'editor'),
    join(__dirname, '..', '..', 'editor', 'dist'),
    join(__dirname, '..', '..', '..', 'editor', 'dist'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export const EDITOR_MISSING_MSG =
  'The local editor is not built. Run `npm run build -w @inkly-org/interactive-demo-editor` in the workspace, ' +
  'or reinstall the CLI package.\n';

/**
 * Serve one request under the editor prefix. Returns `false` when the path
 * is outside the prefix.
 */
export function serveEditorStatic(
  res: ServerResponse,
  pathname: string,
  editorDir: string | null,
): boolean {
  if (pathname !== EDITOR_STATIC_PREFIX && !pathname.startsWith(`${EDITOR_STATIC_PREFIX}/`)) {
    return false;
  }
  if (!editorDir) {
    res.statusCode = 503;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(EDITOR_MISSING_MSG);
    return true;
  }
  if (pathname === EDITOR_STATIC_PREFIX) {
    res.statusCode = 302;
    res.setHeader('location', `${EDITOR_STATIC_PREFIX}/`);
    res.end();
    return true;
  }
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice(EDITOR_STATIC_PREFIX.length + 1));
  } catch {
    rel = '';
  }
  const root = resolve(editorDir);
  let file = resolve(root, rel || 'index.html');
  if (file !== root && !file.startsWith(root + sep)) {
    res.statusCode = 400;
    res.end('Invalid path');
    return true;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // Only extension-less paths are app routes; a missing built asset is a
    // real 404, not the SPA shell.
    if (extname(file)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return true;
    }
    file = join(root, 'index.html');
  }
  res.statusCode = 200;
  res.setHeader('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  createReadStream(file).pipe(res);
  return true;
}
