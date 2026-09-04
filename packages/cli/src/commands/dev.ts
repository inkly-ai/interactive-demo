import { createServer as createViteServer, type ViteDevServer, type Connect } from 'vite';
import chokidar, { type FSWatcher } from 'chokidar';
import { readFile, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, createServer as createNetServer, type AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  healDemoConfig,
  RESERVED_DEMO_SLUGS,
  validateDemoSlug,
  type Demo,
  type AssetEntry,
  type SlugValidation,
} from '@inkly-org/interactive-demo/schema';
import { runDemoIdMaintenance, relForLog } from '../demo-id-maintenance.js';
import { ASSETS_DIR, assetsForPage } from '../assets.js';
import { orderDemos, PROJECT_FILE, ProjectSchema, type ProjectConfig } from '../project.js';
import {
  PLAYER_FILES,
  readTemplate,
  renderDemoPage,
  resolveRuntimeFile,
  RUNTIME_MISSING_MSG,
  type PlayerFileName,
} from '../page.js';
import { standaloneDemoName } from '../standalone-demo.js';
import { EDITOR_API_DEMOS_PREFIX, handleEditorApi } from '../dev/editor-api.js';
import { EDITOR_STATIC_PREFIX, resolveEditorDir, serveEditorStatic } from '../dev/editor-static.js';

export interface DevOptions {
  cwd: string;
  port?: number;
  /**
   * Optional path to serve. May be a project root (contains the project
   * file) or a bare demo folder (contains demo.config.json) — in the latter
   * case dev wraps it in an in-memory project so an exported demo is
   * previewable with no manual assembly. Defaults to `cwd`.
   */
  path?: string;
  /** Suppress stdout logging. Used by tests. */
  silent?: boolean;
}

export interface DevHandle {
  url: string;
  port: number;
  server: ViteDevServer;
  projectRoot: string;
  close: () => Promise<void>;
}

const DEV_HOST = '127.0.0.1';

function send(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void {
  res.statusCode = status;
  res.setHeader('content-type', contentType);
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function streamFile(res: ServerResponse, filePath: string, contentType: string): void {
  res.statusCode = 200;
  res.setHeader('content-type', contentType);
  res.setHeader('cache-control', 'no-store');
  const stream = createReadStream(filePath);
  stream.on('error', (err) => {
    res.statusCode = 500;
    res.end(`Failed to read ${filePath}: ${err.message}`);
  });
  stream.pipe(res);
}

/** Walk upward from `start` looking for the first dir with the project file. */
function findProjectRootSync(start: string): string | null {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, PROJECT_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

interface LoadedDemo {
  slug: string;
  configPath: string;
  config: Demo;
  assets: AssetEntry[];
}

interface BrokenDemo {
  slug: string;
  configPath: string;
  /** Why the demo could not be loaded (unreadable, not JSON, schema errors). */
  error: string;
}

interface ProjectState {
  project: ProjectConfig;
  projectPath: string;
  demos: LoadedDemo[];
  bySlug: Map<string, LoadedDemo>;
  /**
   * Demos whose folder was discovered but whose config does not load. They
   * stay routable so `/` and `/<slug>/` explain the problem instead of the
   * demo silently vanishing; fixing the file hot-reloads it back in.
   */
  broken: Map<string, BrokenDemo>;
}

async function readDemoAssets(configPath: string): Promise<AssetEntry[]> {
  const assetsPath = join(dirname(configPath), 'assets.json');
  try {
    const raw = await readFile(assetsPath, 'utf8');
    const parsed = JSON.parse(raw) as { assets?: unknown };
    if (!Array.isArray(parsed.assets)) return [];
    return parsed.assets.filter((entry): entry is AssetEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as { id?: unknown };
      return typeof record.id === 'string' && record.id.length > 0;
    });
  } catch {
    return [];
  }
}

/**
 * Walk `<root>/demos` recursively. Each `demo.config.json` found defines a
 * demo whose slug is the directory path under `demos/`, joined with `/`.
 */
async function discoverDemoConfigs(projectRoot: string): Promise<Array<{ slug: string; configPath: string }>> {
  const demosRoot = join(projectRoot, 'demos');
  if (!existsSync(demosRoot)) return [];

  const out: Array<{ slug: string; configPath: string }> = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const hasConfig = entries.some((e) => e.isFile() && e.name === 'demo.config.json');
    if (hasConfig) {
      const rel = relative(demosRoot, dir).split(sep).join('/');
      out.push({ slug: rel, configPath: join(dir, 'demo.config.json') });
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
      }
    }
  }

  await walk(demosRoot);
  return out;
}

async function loadProjectState(
  projectRoot: string,
  onWarn: (msg: string) => void,
  standalone?: StandaloneProject,
): Promise<ProjectState> {
  const projectPath = join(projectRoot, PROJECT_FILE);
  let project: ProjectConfig;
  let discovered: Array<{ slug: string; configPath: string }>;
  if (standalone) {
    // No project file on disk: serve the in-memory project and treat the
    // folder root itself as the single demo, so `projectRoot` IS the user's
    // real demo folder. Reload re-reads `<projectRoot>/demo.config.json`.
    project = standalone.project;
    discovered = [
      { slug: standalone.slug, configPath: join(projectRoot, 'demo.config.json') },
    ];
  } else {
    let raw: string;
    try {
      raw = await readFile(projectPath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read ${PROJECT_FILE} at ${projectPath}: ${(err as Error).message}`);
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${PROJECT_FILE} is not valid JSON: ${(err as Error).message}`);
    }
    const projectResult = ProjectSchema.safeParse(parsedJson);
    if (!projectResult.success) {
      throw new Error(`${PROJECT_FILE} failed schema validation:\n${projectResult.error.message}`);
    }
    project = projectResult.data;
    discovered = await discoverDemoConfigs(projectRoot);
  }

  // Slug-conflict check across the entire set first so an invalid slug
  // is a hard error, never a silent skip.
  for (const d of discovered) {
    const v = validateDemoPathSlug(d.slug);
    if (!v.ok) {
      throw new Error(`Demo folder "${d.slug}" has an invalid slug: ${v.reason}`);
    }
    if ((RESERVED_DEMO_SLUGS as readonly string[]).includes(d.slug)) {
      throw new Error(`Demo folder "${d.slug}" uses a reserved slug.`);
    }
  }

  const demos: LoadedDemo[] = [];
  const broken = new Map<string, BrokenDemo>();
  const markBroken = (d: { slug: string; configPath: string }, error: string) => {
    onWarn(`${d.slug}: ${error}`);
    broken.set(d.slug, { slug: d.slug, configPath: d.configPath, error });
  };
  for (const d of discovered) {
    let demoRaw: string;
    try {
      demoRaw = await readFile(d.configPath, 'utf8');
    } catch (err) {
      markBroken(d, `failed to read demo.config.json (${(err as Error).message})`);
      continue;
    }
    let demoJson: unknown;
    try {
      demoJson = JSON.parse(demoRaw);
    } catch (err) {
      markBroken(d, `demo.config.json is not valid JSON (${(err as Error).message})`);
      continue;
    }
    // Heal-before-parse so an id-less config renders instead of being
    // skipped. The startup backfill (see `runDev`) already wrote any mint to
    // disk; this in-memory heal also covers files touched after startup.
    let config: Demo;
    try {
      config = healDemoConfig(demoJson).config;
    } catch (err) {
      markBroken(d, `demo.config.json failed schema validation: ${(err as Error).message}`);
      continue;
    }
    demos.push({
      slug: d.slug,
      configPath: d.configPath,
      config,
      assets: await readDemoAssets(d.configPath),
    });
  }

  const ordered = orderDemos(demos, project);
  const bySlug = new Map<string, LoadedDemo>();
  for (const d of ordered) bySlug.set(d.slug, d);

  return { project, projectPath, demos: ordered, bySlug, broken };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function contentTypeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function validateDemoPathSlug(slug: string): SlugValidation {
  const parts = slug.split('/').filter(Boolean);
  if (parts.length === 0) return { ok: false, reason: 'Name cannot be empty.' };
  for (const part of parts) {
    const checked = validateDemoSlug(part);
    if (!checked.ok) return checked;
  }
  if ((RESERVED_DEMO_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, reason: `Demo folder "${slug}" uses a reserved slug.` };
  }
  return { ok: true };
}

function findDemoRoute(
  pathname: string,
  state: ProjectState,
): { slug: string; demo: LoadedDemo; rel: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const trimmed = decoded.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return null;
  const parts = trimmed.split('/').filter(Boolean);
  for (let i = parts.length; i >= 1; i -= 1) {
    const slug = parts.slice(0, i).join('/');
    if (!validateDemoPathSlug(slug).ok) continue;
    const demo = state.bySlug.get(slug);
    if (demo) {
      return { slug, demo, rel: parts.slice(i).join('/') };
    }
  }
  return null;
}

/** Exact `/<slug>` or `/<slug>/` match against the broken-demo set. */
function findBrokenDemoRoute(pathname: string, state: ProjectState): BrokenDemo | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const slug = decoded.replace(/^\/+/, '').replace(/\/+$/, '');
  return slug ? (state.broken.get(slug) ?? null) : null;
}

async function canListenOnDevHost(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const probe = createNetServer();
    probe.once('error', () => resolvePort(false));
    probe.once('listening', () => {
      probe.close(() => resolvePort(true));
    });
    probe.listen(port, DEV_HOST);
  });
}

async function isListeningOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolveListening) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveListening(value);
    };
    const socket = createConnection({ port, host });
    socket.setTimeout(250);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  if (!(await canListenOnDevHost(port))) return false;
  for (const host of ['localhost', '127.0.0.1', '::1']) {
    if (await isListeningOnHost(port, host)) return false;
  }
  return true;
}

/** Ask the OS for a free ephemeral port on the dev host. */
async function ephemeralPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, DEV_HOST, () => {
      const address = probe.address() as AddressInfo;
      probe.close(() => resolvePort(address.port));
    });
  });
}

async function chooseDevPort(startPort: number): Promise<number> {
  // Port 0 means "any free port". Resolve it here rather than handing 0 to
  // Vite, which would fall back to its own default and collide with other
  // servers started the same way (e.g. parallel tests).
  if (startPort === 0) return ephemeralPort();
  if (!Number.isInteger(startPort) || startPort < 0 || startPort > 65535) {
    throw new Error(`invalid port: ${startPort}`);
  }
  for (let portToTry = startPort; portToTry <= 65535; portToTry += 1) {
    if (await isPortAvailable(portToTry)) return portToTry;
  }
  throw new Error(`No available port found at or above ${startPort}`);
}

function boundPort(server: ViteDevServer, fallback: number): number {
  const address = server.httpServer?.address();
  if (address && typeof address === 'object') {
    return (address as AddressInfo).port;
  }
  return server.config.server.port ?? fallback;
}

interface StandaloneProject {
  /** The demo folder itself — used directly as the Vite root + watch target. */
  demoDir: string;
  slug: string;
  /** Synthetic project config held in memory; never written to disk. */
  project: ProjectConfig;
}

/**
 * Fabricate an in-memory project for a bare demo folder (one containing
 * demo.config.json), so `dev <demoDir>` previews an exported demo with no
 * manual assembly — and, crucially, serves and watches the REAL folder, so
 * a `demo.config.json` edit reloads natively.
 */
async function buildStandaloneProject(demoDir: string): Promise<StandaloneProject> {
  const rawSlug = basename(demoDir);
  const slug =
    /^[a-z0-9][a-z0-9-]*$/.test(rawSlug) && !(RESERVED_DEMO_SLUGS as readonly string[]).includes(rawSlug)
      ? rawSlug
      : 'demo';
  const name = await standaloneDemoName(demoDir, slug);
  const project: ProjectConfig = { name, demos: [slug] };
  return { demoDir, slug, project };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The `/` page: a plain list of links to every demo. */
function renderIndexPage(state: ProjectState, editorAvailable: boolean): string {
  const items = state.demos
    .map((d) => {
      const slugPath = d.slug.split('/').map(encodeURIComponent).join('/');
      const href = `/${slugPath}/`;
      const title = d.config.title ?? d.slug;
      const edit = editorAvailable
        ? ` <a class="edit" href="${EDITOR_STATIC_PREFIX}/#/${slugPath}">Edit</a>`
        : '';
      return `      <li><a href="${href}">${escapeHtml(title)}</a> <code>${escapeHtml(d.slug)}</code>${edit}</li>`;
    })
    .concat(
      [...state.broken.values()].map((d) => {
        const slugPath = d.slug.split('/').map(encodeURIComponent).join('/');
        return `      <li class="broken"><a href="/${slugPath}/">${escapeHtml(d.slug)}</a> <span class="error">${escapeHtml(d.error)}</span></li>`;
      }),
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(state.project.name)}</title>
    <style>
      body { margin: 0; padding: 32px; font-family: ui-sans-serif, system-ui, sans-serif; color: #1f1f1f; background: #f5f5f5; }
      h1 { font-size: 20px; margin: 0 0 16px; }
      ul { padding-left: 20px; line-height: 1.8; }
      code { color: #6b6b6b; font-size: 12px; }
      a.edit { margin-left: 8px; font-size: 12px; color: #5b6cff; }
      li.broken .error { margin-left: 8px; font-size: 12px; color: #b3261e; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(state.project.name)}</h1>
    <ul>
${items || '      <li>No demos yet. Run <code>interactive-demo init --demo &lt;slug&gt;</code>.</li>'}
    </ul>
  </body>
</html>
`;
}

/**
 * The `/<slug>/` page for a demo whose config does not load. Minimal
 * markup with the runtime's `.demo-error` panel; served through Vite like
 * a normal demo page so the client script reloads it once the file is
 * fixed.
 */
function renderBrokenDemoPage(demo: BrokenDemo): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(demo.slug)} (error)</title>
    <link rel="stylesheet" href="/__demo/player.css" />
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
      .demo-error { margin: 16px; padding: 16px; border: 1px solid #e5484d; border-radius: 8px; background: #fff5f5; }
      .demo-error pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="demo-error">
      <h2>Demo "${escapeHtml(demo.slug)}" could not be loaded</h2>
      <pre>${escapeHtml(demo.error)}</pre>
      <p>Fix <code>${escapeHtml(relative(process.cwd(), demo.configPath) || demo.configPath)}</code>; this page reloads when it parses again.</p>
    </div>
  </body>
</html>
`;
}

export async function runDev(options: DevOptions): Promise<DevHandle> {
  const { cwd, port = 3000, silent } = options;
  const warn = (msg: string) => {
    if (!silent) process.stderr.write(`[dev] ${msg}\n`);
  };

  const target = options.path ? resolve(cwd, options.path) : cwd;
  let projectRoot = findProjectRootSync(target);
  let standalone: StandaloneProject | null = null;
  if (!projectRoot) {
    if (existsSync(join(target, 'demo.config.json'))) {
      standalone = await buildStandaloneProject(target);
      projectRoot = standalone.demoDir;
      if (!silent) {
        process.stdout.write(
          `[dev] serving standalone demo "${standalone.slug}" (no ${PROJECT_FILE} required; watching ${projectRoot})\n`,
        );
      }
    } else {
      throw new Error(
        `No ${PROJECT_FILE} found in ${target} or any parent directory. Run \`interactive-demo init <name>\` first, ` +
          `cd into your project, or point \`interactive-demo dev\` at a demo folder (a directory containing demo.config.json).`,
      );
    }
  }

  if (!standalone) {
    const maintenance = await runDemoIdMaintenance(projectRoot);
    if (!silent) {
      for (const fix of maintenance.healed) {
        process.stdout.write(`[dev] healed missing id: ${relForLog(maintenance.projectRoot, fix.configPath)}\n`);
      }
      for (const fix of maintenance.reminted) {
        process.stdout.write(`[dev] re-minted duplicate id: ${relForLog(maintenance.projectRoot, fix.configPath)}\n`);
      }
    }
  }

  let state = await loadProjectState(projectRoot, warn, standalone ?? undefined);

  // Player files come from the runtime package; missing files are reported
  // per request (503) rather than blocking startup, so `dev` still serves
  // configs and assets while the runtime is being built.
  const playerFiles: Record<PlayerFileName, string | null> = {
    'player.js': resolveRuntimeFile(PLAYER_FILES['player.js'], projectRoot),
    'player.css': resolveRuntimeFile(PLAYER_FILES['player.css'], projectRoot),
  };
  const demoTemplate = await readTemplate();
  // ── local editor (packages/editor build) ──────────────────────────────
  const editorDir = resolveEditorDir();
  // ──────────────────────────────────────────────────────────────────────

  const selectedPort = await chooseDevPort(port);
  let actualPort = selectedPort;

  // Vite would write its dep cache under the root; keep the user's project
  // pristine by pointing the cache at a temp dir (removed on close) and
  // switching the dependency optimizer off — the page loads a prebuilt
  // player, nothing goes through Vite's module pipeline.
  const viteCacheDir = await mkdtemp(join(tmpdir(), 'interactive-demo-dev-cache-'));

  const server = await createViteServer({
    root: projectRoot,
    cacheDir: viteCacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      port: selectedPort,
      strictPort: true,
      host: DEV_HOST,
      hmr: { host: DEV_HOST },
      fs: { allow: [projectRoot, fileURLToPath(new URL('../', import.meta.url))] },
    },
    appType: 'custom',
    clearScreen: false,
    logLevel: silent ? 'silent' : 'info',
    configFile: false,
    plugins: [
      {
        name: 'interactive-demo-dev-endpoints',
        configureServer(vite) {
          const middleware: Connect.NextHandleFunction = (req, res, next) => {
            const rawUrl = req.url ?? '';
            const pathname = rawUrl.split('?')[0] ?? '';

            if (pathname === '/' || pathname === '/index.html') {
              send(res, 200, 'text/html; charset=utf-8', renderIndexPage(state, editorDir != null));
              return;
            }

            if (pathname.startsWith(EDITOR_API_DEMOS_PREFIX)) {
              void handleEditorApi(req as IncomingMessage, res, {
                findDemo: (slug) => state.bySlug.get(slug) ?? null,
                onChanged: () => void refresh(),
              }).then((handled) => {
                if (!handled) next();
              });
              return;
            }
            // ── local editor (static SPA) ──────────────────────────────
            if (serveEditorStatic(res, pathname, editorDir)) {
              return;
            }
            // ──────────────────────────────────────────────────────────

            // The player files are also reachable at a fixed path for the
            // editor shell, which is not served under a demo slug.
            if (pathname === '/__demo/player.js' || pathname === '/__demo/player.css') {
              const name = pathname.slice('/__demo/'.length) as PlayerFileName;
              servePlayerFile(res, playerFiles[name], name);
              return;
            }
            if (pathname === '/__demo/demos') {
              send(
                res,
                200,
                'application/json; charset=utf-8',
                JSON.stringify([
                  ...state.demos.map((d) => ({ slug: d.slug, title: d.config.title ?? d.slug })),
                  ...[...state.broken.values()].map((d) => ({ slug: d.slug, title: d.slug, error: d.error })),
                ]),
              );
              return;
            }
            if (pathname.startsWith('/__demo/demo/')) {
              let slug: string;
              try {
                slug = decodeURIComponent(pathname.slice('/__demo/demo/'.length));
              } catch {
                send(res, 400, 'text/plain; charset=utf-8', 'Malformed demo slug');
                return;
              }
              const v = validateDemoPathSlug(slug);
              if (!v.ok) {
                send(res, 400, 'text/plain; charset=utf-8', v.reason);
                return;
              }
              const brokenDemo = state.broken.get(slug);
              if (brokenDemo) {
                send(res, 422, 'application/json; charset=utf-8', JSON.stringify({ slug, error: brokenDemo.error }));
                return;
              }
              const demo = state.bySlug.get(slug);
              if (!demo) {
                send(res, 404, 'text/plain; charset=utf-8', `No such demo: ${slug}`);
                return;
              }
              send(
                res,
                200,
                'application/json; charset=utf-8',
                JSON.stringify({ demo: demo.config, assets: assetsForPage(demo.assets) }),
              );
              return;
            }

            const brokenRoute = findBrokenDemoRoute(pathname, state);
            if (brokenRoute) {
              if (!pathname.endsWith('/')) {
                res.statusCode = 302;
                res.setHeader('location', `${pathname}/`);
                res.end();
                return;
              }
              vite.transformIndexHtml(pathname, renderBrokenDemoPage(brokenRoute)).then(
                (transformed) => send(res, 200, 'text/html; charset=utf-8', transformed),
                (err) => send(res, 500, 'text/plain; charset=utf-8', (err as Error).message),
              );
              return;
            }

            const demoRoute = findDemoRoute(pathname, state);
            if (demoRoute && demoRoute.rel) {
              const { rel, demo } = demoRoute;
              if (rel.includes('..') || rel.startsWith('/')) {
                send(res, 400, 'text/plain; charset=utf-8', 'Invalid path');
                return;
              }
              // Player files sit next to the page, exactly as `build` lays them out.
              if (rel in playerFiles) {
                servePlayerFile(res, playerFiles[rel as PlayerFileName], rel);
                return;
              }
              if (!rel.startsWith(`${ASSETS_DIR}/`)) {
                next();
                return;
              }
              const assetsRoot = join(dirname(demo.configPath), ASSETS_DIR);
              const filePath = join(assetsRoot, rel.slice(ASSETS_DIR.length + 1));
              if (!filePath.startsWith(assetsRoot + sep) && filePath !== assetsRoot) {
                send(res, 400, 'text/plain; charset=utf-8', 'Invalid path');
                return;
              }
              stat(filePath).then(
                (s) => {
                  if (!s.isFile()) {
                    next();
                    return;
                  }
                  streamFile(res, filePath, contentTypeFor(filePath));
                },
                () => next(),
              );
              return;
            }

            if (pathname.length > 1) {
              const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
              if (demoRoute && demoRoute.rel === '') {
                if (!pathname.endsWith('/')) {
                  // Relative `./player.js` and `./assets/…` only resolve under
                  // a trailing slash; normalise the URL.
                  res.statusCode = 302;
                  res.setHeader('location', `${pathname}/`);
                  res.end();
                  return;
                }
                const { demo } = demoRoute;
                const html = renderDemoPage({
                  template: demoTemplate,
                  config: demo.config,
                  assets: assetsForPage(demo.assets),
                  themeId: state.project.theme,
                  themeTokens: state.project.tokens ?? null,
                });
                // Vite adds its client script so `full-reload` reaches the page.
                vite.transformIndexHtml(pathname, html).then(
                  (transformed) => send(res, 200, 'text/html; charset=utf-8', transformed),
                  (err) => send(res, 500, 'text/plain; charset=utf-8', (err as Error).message),
                );
                return;
              }
              if (trimmed && !trimmed.includes('/')) {
                const v = validateDemoSlug(trimmed);
                if (!v.ok) {
                  next();
                  return;
                }
                send(
                  res,
                  404,
                  'text/plain; charset=utf-8',
                  `No such demo: "${trimmed}". Known demos: ${[...state.bySlug.keys(), ...state.broken.keys()].join(', ') || '(none)'}\n`,
                );
                return;
              }
            }

            next();
          };
          vite.middlewares.use(middleware);
        },
      },
    ],
  });

  await server.listen();

  actualPort = boundPort(server, selectedPort);
  const url = `http://127.0.0.1:${actualPort}/`;
  const displayUrl = `http://localhost:${actualPort}/`;

  // chokidar v4 has no glob support: watch the project file and the demos/
  // dir recursively, then filter events by basename so only config and
  // manifest edits trigger a refresh — never a static asset write.
  const projectFilePath = join(projectRoot, PROJECT_FILE);
  const demosRoot = join(projectRoot, 'demos');
  const WATCHED_BASENAMES = new Set(['demo.config.json', 'assets.json']);
  const watchTargets: string[] = [];
  if (standalone) {
    watchTargets.push(projectRoot);
  } else {
    watchTargets.push(projectFilePath);
    if (existsSync(demosRoot)) watchTargets.push(demosRoot);
  }
  const watcher: FSWatcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 20 },
  });

  // Events that arrive while a reload is in flight mark the state dirty and
  // trigger one more pass once it finishes, so a burst of writes (an editor
  // save touching several files) never leaves the last one unread.
  let reloadPending = false;
  let reloadDirty = false;
  const refresh = async () => {
    if (reloadPending) {
      reloadDirty = true;
      return;
    }
    reloadPending = true;
    try {
      do {
        reloadDirty = false;
        try {
          const next = await loadProjectState(projectRoot, warn, standalone ?? undefined);
          state = next;
          try {
            server.ws.send({ type: 'full-reload' });
          } catch {
            // The websocket may not be up yet; the next request serves fresh state anyway.
          }
        } catch (err) {
          warn(`Reload failed: ${(err as Error).message}`);
        }
      } while (reloadDirty);
    } finally {
      reloadPending = false;
    }
  };
  const onFsEvent = (changedPath: string): void => {
    if (changedPath === projectFilePath || WATCHED_BASENAMES.has(basename(changedPath))) {
      void refresh();
    }
  };
  watcher.on('add', onFsEvent);
  watcher.on('change', onFsEvent);
  watcher.on('unlink', onFsEvent);
  // Edits made before the initial scan completes would be missed; wait for
  // the watcher to be ready so a save right after startup still reloads.
  await new Promise<void>((resolveReady) => watcher.once('ready', () => resolveReady()));

  if (!silent) {
    const slugs = [...state.bySlug.keys()];
    const MAX_DEMO_LINES = 10;
    const demoLines =
      slugs.length > 0
        ? '\n  demos:\n' +
          slugs
            .slice(0, MAX_DEMO_LINES)
            .map((slug) => `    ${displayUrl}${slug}/`)
            .join('\n') +
          (slugs.length > MAX_DEMO_LINES ? `\n    …and ${slugs.length - MAX_DEMO_LINES} more` : '')
        : '';
    const runtimeNote = playerFiles['player.js'] ? '' : `\n  ${RUNTIME_MISSING_MSG}`;
    const editorLine = editorDir ? `\n  editor: ${displayUrl}${EDITOR_STATIC_PREFIX.slice(1)}/` : '';
    process.stdout.write(
      `\n  interactive-demo dev running at ${displayUrl}\n  project: ${state.project.name}\n  demos: ${state.demos.length}${demoLines}${editorLine}${runtimeNote}\n`,
    );
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await watcher.close();
    await server.close();
    if (viteCacheDir) {
      await rm(viteCacheDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  return { url, port: actualPort, server, projectRoot, close };
}

function servePlayerFile(res: ServerResponse, path: string | null, name: string): void {
  if (!path) {
    send(res, 503, 'text/plain; charset=utf-8', `${RUNTIME_MISSING_MSG}(missing: ${name})`);
    return;
  }
  stat(path).then(
    () => streamFile(res, path, contentTypeFor(name)),
    () => send(res, 503, 'text/plain; charset=utf-8', `${RUNTIME_MISSING_MSG}(missing: ${name})`),
  );
}
