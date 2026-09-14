import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname } from 'node:path';
import type { AssetKind } from '@inkly-org/interactive-demo/schema';
import { ASSETS_DIR } from '../assets.js';
import { LocalFsWorkspace, type WorkspaceProvider } from '../workspace.js';
import { MAX_ASSET_BYTES, assertSafeAssetPath } from './asset-helpers.js';
import { buildInlineIframe, buildPopupButton, buildPopupLoader } from '../publish/embed-snippets.js';

export { MAX_ASSET_BYTES, generatedAssetId } from './asset-helpers.js';

/**
 * Internal HTTP API the local editor uses to read and write a demo. Mounted
 * by `dev` under `/__demo/editor/`; never part of `build` output.
 *
 *   GET    /__demo/editor/demos/:slug/files
 *          → { files: { "<path>": "<text>", … } } for every text file in the
 *            demo folder (demo.config.json, assets.json, …). Binary assets are
 *            listed by path only under `binary: string[]`.
 *   PUT    /__demo/editor/demos/:slug/files
 *          body { files: { "<path>": "<text>" } }  — writes each file.
 *          body { delete: ["<path>", …] }          — removes each file.
 *          → { ok: true }
 *   GET    /__demo/editor/demos/:slug/assets
 *          → { assets: AssetMeta[] } — the assets.json entries, each with a
 *            `publicUrl` the editor can load from this server.
 *   POST   /__demo/editor/demos/:slug/assets?name=<file>[&kind=image|video|audio]
 *          raw request body = the asset bytes; written to `assets/<file>`
 *          and registered in assets.json (content hash, size, kind). When
 *          `<file>` already exists with different bytes the upload lands
 *          under a de-duplicated name (`hero-2.png`) with a new id, so
 *          steps referencing the old asset are unaffected. Max 100 MB.
 *          → { ok: true, file, renamedFrom?, asset: AssetMeta }
 *   DELETE /__demo/editor/demos/:slug/assets?name=<file>
 *          removes the file and its manifest entry. → { ok: true }
 *
 * All paths are forward-slash and relative to the demo folder; anything that
 * escapes it is rejected with 400.
 */

export const EDITOR_API_PREFIX = '/__demo/editor/';
export const EDITOR_API_DEMOS_PREFIX = `${EDITOR_API_PREFIX}demos/`;

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.svg', '.css', '.html', '.js']);
const MAX_JSON_BODY = 20_000_000;

/** Allowed asset file names: a leading letter or digit, then letters, digits, `.`, `_`, `-`. */
export const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const ASSET_NAME_RULE =
  'an asset name must start with a letter or digit and contain only letters, digits, ".", "_" and "-"';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

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
  /**
   * URL this server serves an asset file at, so the editor can display it.
   * Defaults to the same page-relative layout the player uses:
   * `/<slug>/assets/<file>`.
   */
  assetUrl?: (slug: string, file: string) => string;
}

/** A file under the demo's `assets/` as the editor consumes it. */
export interface EditorAssetMeta {
  /** Demo-relative path, `assets/<file>`: what a step references. */
  path: string;
  file: string;
  /** URL this server serves the bytes at. */
  publicUrl: string;
  contentType: string;
  size: number;
  kind: AssetKind;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, `Request body is too large (limit ${limit} bytes).`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new HttpError(413, `Request body is too large (limit ${limit} bytes).`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isTextPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

export function isSafeAssetName(name: string): boolean {
  return ASSET_NAME_PATTERN.test(name);
}

/**
 * Pick a file name that is not yet used by another asset: `hero.png`,
 * `hero-2.png`, `hero-3.png`, … Existing names are compared case-insensitively
 * so the result is safe on case-insensitive file systems.
 */
export function dedupeAssetName(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (value) => value.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new HttpError(409, `Too many assets named like ${name}.`);
}

export function defaultAssetUrl(slug: string, file: string): string {
  const slugPath = slug.split('/').map(encodeURIComponent).join('/');
  return `/${slugPath}/${ASSETS_DIR}/${encodeURIComponent(file)}`;
}

function contentTypeForFile(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function kindForContentType(contentType: string): AssetKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('font/')) return 'font';
  return 'other';
}





/**
 * Handle one request. Returns `false` when the URL is not an editor API
 * route so the caller can fall through to the next middleware.
 */
/** Host placeholder in the snippets the editor's Share dialog shows for a static build. */
export const EMBED_HOST_PLACEHOLDER = 'https://YOUR-HOST';

export interface EmbedSnippets {
  /** Where the built demo page lands once `dist/` is deployed. */
  pageUrl: string;
  inline: string;
  popup: { loader: string; triggers: Record<'html' | 'react' | 'next' | 'vue' | 'svelte', string> };
}

/**
 * The embed snippets for a demo's static build, built by the same code the
 * `embed` command uses so the editor never shows a different shape. The
 * host is a placeholder: the editor does not know where `dist/` will live.
 */
export function embedSnippetsFor(slug: string): EmbedSnippets {
  const pageUrl = `${EMBED_HOST_PLACEHOLDER}/${slug.split('/').map(encodeURIComponent).join('/')}/`;
  const label = 'Try the demo';
  return {
    pageUrl,
    inline: buildInlineIframe(pageUrl),
    popup: {
      loader: buildPopupLoader(EMBED_HOST_PLACEHOLDER),
      triggers: {
        html: buildPopupButton('html', pageUrl, label),
        react: buildPopupButton('react', pageUrl, label),
        next: buildPopupButton('next', pageUrl, label),
        vue: buildPopupButton('vue', pageUrl, label),
        svelte: buildPopupButton('svelte', pageUrl, label),
      },
    },
  };
}

/** Every file directly under `assets/`, as the editor's picker lists them. */
async function listFolderAssets(
  workspace: WorkspaceProvider,
  demoDir: string,
  slug: string,
  assetUrl: (slug: string, file: string) => string,
): Promise<EditorAssetMeta[]> {
  const out: EditorAssetMeta[] = [];
  for (const path of await workspace.listFiles(demoDir)) {
    if (!path.startsWith(`${ASSETS_DIR}/`)) continue;
    const file = path.slice(ASSETS_DIR.length + 1);
    if (file.includes('/')) continue;
    const size = await workspace.fileSize(demoDir, path);
    if (size == null) continue;
    const contentType = contentTypeForFile(file);
    out.push({ path, file, publicUrl: assetUrl(slug, file), contentType, size, kind: kindForContentType(contentType) });
  }
  return out;
}

export async function handleEditorApi(
  req: IncomingMessage,
  res: ServerResponse,
  deps: EditorApiDeps,
): Promise<boolean> {
  const rawUrl = req.url ?? '';
  const [pathname, query = ''] = rawUrl.split('?') as [string, string?];
  if (!pathname.startsWith(EDITOR_API_DEMOS_PREFIX)) return false;

  const rest = pathname.slice(EDITOR_API_DEMOS_PREFIX.length);
  const match = /^(.+)\/(files|assets|embed)$/.exec(rest);
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
  const resource = match[2] as 'files' | 'assets' | 'embed';
  const demo = deps.findDemo(slug);
  if (!demo) {
    sendJson(res, 404, { error: `No such demo: ${slug}` });
    return true;
  }
  const demoDir = dirname(demo.configPath);
  const workspace = deps.workspace ?? new LocalFsWorkspace();
  const assetUrl = deps.assetUrl ?? defaultAssetUrl;
  const params = new URLSearchParams(query);

  try {
    if (resource === 'embed' && req.method === 'GET') {
      sendJson(res, 200, embedSnippetsFor(slug));
      return true;
    }
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
    if (resource === 'assets' && req.method === 'GET') {
      sendJson(res, 200, { assets: await listFolderAssets(workspace, demoDir, slug, assetUrl) });
      return true;
    }
    if (resource === 'assets' && req.method === 'POST') {
      const requested = params.get('name') ?? '';
      if (!isSafeAssetName(requested)) {
        sendJson(res, 400, { error: `Missing or invalid ?name=<file>: ${ASSET_NAME_RULE}.` });
        return true;
      }
      const bytes = await readBody(req, MAX_ASSET_BYTES);
      // Re-uploading identical bytes under the same name is a no-op.
      // Different bytes under an existing name get a fresh file name, so
      // steps that reference the old file keep showing it.
      const existing = await workspace.readBytes(demoDir, `${ASSETS_DIR}/${requested}`);
      const name =
        existing && !existing.equals(bytes)
          ? dedupeAssetName(
              requested,
              (await workspace.listFiles(demoDir))
                .filter((path) => path.startsWith(`${ASSETS_DIR}/`))
                .map((path) => path.slice(ASSETS_DIR.length + 1)),
            )
          : requested;
      const relPath = `${ASSETS_DIR}/${name}`;
      assertSafeAssetPath(relPath);
      await workspace.writeFile(demoDir, relPath, bytes);
      const headerType = String(req.headers['content-type'] ?? '').split(';')[0]?.trim();
      const contentType =
        headerType && headerType !== 'application/octet-stream' ? headerType : contentTypeForFile(name);
      const requestedKind = params.get('kind');
      const kind: AssetKind =
        requestedKind === 'image' || requestedKind === 'video' || requestedKind === 'audio' || requestedKind === 'font'
          ? requestedKind
          : kindForContentType(contentType);
      deps.onChanged?.();
      sendJson(res, 200, {
        ok: true,
        file: name,
        renamedFrom: name === requested ? undefined : requested,
        asset: {
          path: relPath,
          file: name,
          publicUrl: assetUrl(slug, name),
          contentType,
          size: bytes.byteLength,
          kind,
        } satisfies EditorAssetMeta,
      });
      return true;
    }
    if (resource === 'assets' && req.method === 'DELETE') {
      const name = params.get('name') ?? '';
      if (!isSafeAssetName(name)) {
        sendJson(res, 400, { error: `Missing or invalid ?name=<file>: ${ASSET_NAME_RULE}.` });
        return true;
      }
      const relPath = `${ASSETS_DIR}/${name}`;
      assertSafeAssetPath(relPath);
      await workspace.deleteFile(demoDir, relPath);
      deps.onChanged?.();
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: 'method not allowed' });
    return true;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    sendJson(res, status, { error: (err as Error).message });
    return true;
  }
}
