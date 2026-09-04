import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { LocalFsWorkspace, type WorkspaceProvider } from '../workspace.js';

/**
 * Internal HTTP API the local editor uses to read and write a demo. Mounted
 * by `dev` under `/__demo/editor/`; never part of `build` output.
 *
 *   GET  /__demo/editor/demos/:slug/files
 *        → { files: { "<path>": "<text>", … } } for every text file in the
 *          demo folder (demo.config.json, assets.json, …). Binary assets are
 *          listed by path only under `binary: string[]`.
 *   PUT  /__demo/editor/demos/:slug/files
 *        body { files: { "<path>": "<text>" } }  — writes each file.
 *        body { delete: ["<path>", …] }          — removes each file.
 *        → { ok: true }
 *   POST /__demo/editor/demos/:slug/assets?name=<file>
 *        raw request body = the asset bytes; written to `assets/<file>`.
 *        → { ok: true, file: "<file>" }
 *
 * All paths are forward-slash and relative to the demo folder; anything that
 * escapes it is rejected with 400.
 */

export const EDITOR_API_PREFIX = '/__demo/editor/';

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.svg', '.css', '.html', '.js']);
const MAX_JSON_BODY = 20_000_000;
const MAX_ASSET_BODY = 500_000_000;

export interface EditorApiDemo {
  slug: string;
  configPath: string;
}

export interface EditorApiDeps {
  /** Resolve a slug to its demo folder, or `null`. */
  findDemo: (slug: string) => EditorApiDemo | null;
  /** Called after a successful write so the server can refresh its state. */
  onChanged?: () => void;
  workspace?: WorkspaceProvider;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isTextPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function safeAssetName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

/**
 * Handle one request. Returns `false` when the URL is not an editor route so
 * the caller can fall through to the next middleware.
 */
export async function handleEditorApi(
  req: IncomingMessage,
  res: ServerResponse,
  deps: EditorApiDeps,
): Promise<boolean> {
  const rawUrl = req.url ?? '';
  const [pathname, query = ''] = rawUrl.split('?') as [string, string?];
  if (!pathname.startsWith(`${EDITOR_API_PREFIX}demos/`)) return false;

  const rest = pathname.slice(`${EDITOR_API_PREFIX}demos/`.length);
  const match = /^(.+)\/(files|assets)$/.exec(rest);
  if (!match) {
    sendJson(res, 404, { error: 'not found' });
    return true;
  }
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]!);
  } catch {
    sendJson(res, 400, { error: 'bad slug' });
    return true;
  }
  const resource = match[2] as 'files' | 'assets';
  const demo = deps.findDemo(slug);
  if (!demo) {
    sendJson(res, 404, { error: `No such demo: ${slug}` });
    return true;
  }
  const demoDir = dirname(demo.configPath);
  const workspace = deps.workspace ?? new LocalFsWorkspace();

  try {
    if (resource === 'files' && req.method === 'GET') {
      const paths = await workspace.listFiles(demoDir);
      const files: Record<string, string> = {};
      const binary: string[] = [];
      for (const path of paths) {
        if (!isTextPath(path)) {
          binary.push(path);
          continue;
        }
        const text = await workspace.readFile(demoDir, path);
        if (text != null) files[path] = text;
      }
      sendJson(res, 200, { files, binary });
      return true;
    }
    if (resource === 'files' && req.method === 'PUT') {
      const body = JSON.parse((await readBody(req, MAX_JSON_BODY)).toString('utf8') || '{}') as {
        files?: Record<string, unknown>;
        delete?: unknown;
      };
      const files = body.files && typeof body.files === 'object' ? body.files : {};
      for (const [path, content] of Object.entries(files)) {
        if (typeof content !== 'string') {
          sendJson(res, 400, { error: `File content for ${path} must be a string` });
          return true;
        }
        await workspace.writeFile(demoDir, path, content);
      }
      const deletions = Array.isArray(body.delete) ? body.delete : [];
      for (const path of deletions) {
        if (typeof path === 'string') await workspace.deleteFile(demoDir, path);
      }
      deps.onChanged?.();
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (resource === 'assets' && req.method === 'POST') {
      const name = new URLSearchParams(query).get('name') ?? '';
      if (!safeAssetName(name)) {
        sendJson(res, 400, { error: 'Missing or invalid ?name=<file>' });
        return true;
      }
      const bytes = await readBody(req, MAX_ASSET_BODY);
      await workspace.writeFile(demoDir, `assets/${name}`, bytes);
      deps.onChanged?.();
      sendJson(res, 200, { ok: true, file: name });
      return true;
    }
    sendJson(res, 405, { error: 'method not allowed' });
    return true;
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return true;
  }
}
