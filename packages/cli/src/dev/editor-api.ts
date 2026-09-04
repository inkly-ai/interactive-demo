import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname } from 'node:path';
import type { AssetEntry, AssetKind } from '@inkly-org/interactive-demo/schema';
import { ASSETS_DIR } from '../assets.js';
import { LocalFsWorkspace, type WorkspaceProvider } from '../workspace.js';

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
 *          and registered in assets.json (content hash, size, kind).
 *          → { ok: true, asset: AssetMeta }
 *   DELETE /__demo/editor/demos/:slug/assets?name=<file>
 *          removes the file and its manifest entry. → { ok: true }
 *
 * All paths are forward-slash and relative to the demo folder; anything that
 * escapes it is rejected with 400.
 */

export const EDITOR_API_PREFIX = '/__demo/editor/';
export const EDITOR_API_DEMOS_PREFIX = `${EDITOR_API_PREFIX}demos/`;

const MANIFEST_PATH = 'assets.json';
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.txt', '.svg', '.css', '.html', '.js']);
const MAX_JSON_BODY = 20_000_000;
const MAX_ASSET_BODY = 500_000_000;

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

/** The manifest entry as the editor consumes it. */
export interface EditorAssetMeta extends AssetEntry {
  path: string;
  uri: string;
  contentType: string;
  size: number;
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

function assetIdStem(assetPath: string): string {
  const fileName = assetPath.split('/').pop() ?? '';
  const stem = fileName.replace(/\.[^.]+$/, '');
  const cleaned = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return cleaned || 'asset';
}

function stablePathHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(-6);
}

/** Stable, readable asset id: `<name>-<hash16>-<pathhash>`. */
export function generatedAssetId(assetPath: string, sha256: string): string {
  return `${assetIdStem(assetPath)}-${sha256.slice(0, 16)}-${stablePathHash(assetPath)}`;
}

interface Manifest {
  version: 1;
  assets: AssetEntry[];
  [key: string]: unknown;
}

async function readManifest(workspace: WorkspaceProvider, demoDir: string): Promise<Manifest> {
  const raw = await workspace.readFile(demoDir, MANIFEST_PATH);
  if (!raw) return { version: 1, assets: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    const assets = Array.isArray(parsed.assets)
      ? parsed.assets.filter(
          (entry): entry is AssetEntry =>
            !!entry && typeof entry === 'object' && typeof (entry as AssetEntry).id === 'string',
        )
      : [];
    return { ...parsed, version: 1, assets };
  } catch {
    return { version: 1, assets: [] };
  }
}

async function writeManifest(workspace: WorkspaceProvider, demoDir: string, manifest: Manifest): Promise<void> {
  const sorted = [...manifest.assets].sort((a, b) =>
    String(a.path ?? a.file ?? '').localeCompare(String(b.path ?? b.file ?? '')),
  );
  await workspace.writeFile(
    demoDir,
    MANIFEST_PATH,
    JSON.stringify({ ...manifest, version: 1, assets: sorted }, null, 2) + '\n',
  );
}

function toEditorAsset(
  entry: AssetEntry,
  slug: string,
  assetUrl: (slug: string, file: string) => string,
): EditorAssetMeta {
  const file = entry.file ?? entry.path?.split('/').pop();
  const path = entry.path ?? (file ? `${ASSETS_DIR}/${file}` : '');
  const remote = typeof entry.publicUrl === 'string' && /^(https?:)?\/\//i.test(entry.publicUrl);
  return {
    ...entry,
    path,
    uri: entry.uri ?? `asset:${entry.id}`,
    publicUrl: remote ? entry.publicUrl : file ? assetUrl(slug, file) : entry.publicUrl,
    contentType: entry.contentType ?? contentTypeForFile(file ?? path),
    size: entry.size ?? 0,
  };
}

/**
 * Handle one request. Returns `false` when the URL is not an editor API
 * route so the caller can fall through to the next middleware.
 */
export async function handleEditorApi(
  req: IncomingMessage,
  res: ServerResponse,
  deps: EditorApiDeps,
): Promise<boolean> {
  const rawUrl = req.url ?? '';
  const [pathname, query = ''] = rawUrl.split('?') as [string, string?];
  if (!pathname.startsWith(EDITOR_API_DEMOS_PREFIX)) return false;

  const rest = pathname.slice(EDITOR_API_DEMOS_PREFIX.length);
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
  const assetUrl = deps.assetUrl ?? defaultAssetUrl;
  const params = new URLSearchParams(query);

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
    if (resource === 'assets' && req.method === 'GET') {
      const manifest = await readManifest(workspace, demoDir);
      sendJson(res, 200, {
        assets: manifest.assets.map((entry) => toEditorAsset(entry, slug, assetUrl)),
      });
      return true;
    }
    if (resource === 'assets' && req.method === 'POST') {
      const name = params.get('name') ?? '';
      if (!safeAssetName(name)) {
        sendJson(res, 400, { error: 'Missing or invalid ?name=<file>' });
        return true;
      }
      const bytes = await readBody(req, MAX_ASSET_BODY);
      const relPath = `${ASSETS_DIR}/${name}`;
      await workspace.writeFile(demoDir, relPath, bytes);
      const headerType = String(req.headers['content-type'] ?? '').split(';')[0]?.trim();
      const contentType =
        headerType && headerType !== 'application/octet-stream' ? headerType : contentTypeForFile(name);
      const requestedKind = params.get('kind');
      const kind: AssetKind =
        requestedKind === 'image' || requestedKind === 'video' || requestedKind === 'audio' || requestedKind === 'font'
          ? requestedKind
          : kindForContentType(contentType);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const now = new Date().toISOString();
      const manifest = await readManifest(workspace, demoDir);
      const previous = manifest.assets.find((entry) => entry.file === name || entry.path === relPath);
      const entry: AssetEntry = {
        id: previous?.id ?? generatedAssetId(relPath, sha256),
        path: relPath,
        file: name,
        uri: undefined,
        sha256,
        kind,
        contentType,
        size: bytes.byteLength,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      entry.uri = `asset:${entry.id}`;
      manifest.assets = [
        ...manifest.assets.filter((existing) => existing !== previous && existing.id !== entry.id),
        entry,
      ];
      await writeManifest(workspace, demoDir, manifest);
      deps.onChanged?.();
      sendJson(res, 200, { ok: true, file: name, asset: toEditorAsset(entry, slug, assetUrl) });
      return true;
    }
    if (resource === 'assets' && req.method === 'DELETE') {
      const name = params.get('name') ?? '';
      if (!safeAssetName(name)) {
        sendJson(res, 400, { error: 'Missing or invalid ?name=<file>' });
        return true;
      }
      const relPath = `${ASSETS_DIR}/${name}`;
      await workspace.deleteFile(demoDir, relPath);
      const manifest = await readManifest(workspace, demoDir);
      const next = manifest.assets.filter((entry) => entry.file !== name && entry.path !== relPath);
      if (next.length !== manifest.assets.length) {
        manifest.assets = next;
        await writeManifest(workspace, demoDir, manifest);
      }
      deps.onChanged?.();
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: 'method not allowed' });
    return true;
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return true;
  }
}
