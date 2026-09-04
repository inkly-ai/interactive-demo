import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetEntry, Demo, ThemeTokens } from '@inkly-org/interactive-demo/schema';

/**
 * The player page. `dev` and `build` both render demo pages through this
 * module so the two can never drift.
 *
 * Page contract (what `player.js` expects):
 *   <link rel="stylesheet" href="./player.css">
 *   <link rel="stylesheet" href="./player-fonts.css">   (optional; ./fonts/*.woff2 next to it)
 *   <script id="demo-config" type="application/json">…demo config…</script>
 *   <script id="demo-assets" type="application/json">…assets manifest array…</script>
 *   <div id="root"></div>
 *   <script src="./player.js"></script>
 *
 * `asset:<id>` URIs in the config resolve through the embedded manifest to
 * `./assets/<file>` relative to the page.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const RUNTIME_PACKAGE = '@inkly-org/interactive-demo';

/** Files the page needs next to it, and where each comes from in the runtime package. */
export const PLAYER_FILES = {
  'player.js': 'player.js',
  'player.css': 'styles.css',
  'player-fonts.css': 'fonts.css',
} as const;

/**
 * Self-hosted font files `player-fonts.css` refers to (`url(./fonts/…)`).
 * They live in the runtime package's `dist/fonts/` next to `fonts.css`.
 */
export const PLAYER_FONT_FILES = [
  'newsreader-latin-600-normal.woff2',
  'fraunces-latin-600-normal.woff2',
  'geist-latin-wght-normal.woff2',
] as const;

/** Directory holding the font files, derived from where `fonts.css` resolved. */
export function resolveRuntimeFontsDir(cwd: string): string | null {
  const css = resolveRuntimeFile(PLAYER_FILES['player-fonts.css'], cwd);
  return css ? join(dirname(css), 'fonts') : null;
}

export type PlayerFileName = keyof typeof PLAYER_FILES;

/**
 * Locate the HTML template shipped next to this module: `dist/template/`
 * in the built CLI, `src/template/` when running from source.
 */
export function resolveTemplate(name: string): string {
  return resolve(__dirname, 'template', name);
}

/**
 * Locate a runtime file (`player.js`, `styles.css`) from the runtime
 * package. Resolves from this module first, so the player always matches the
 * schema and themes the CLI itself was built against; then from `cwd` (a
 * project that installed only the runtime); then walks up looking for the
 * workspace's `packages/runtime/dist`.
 */
export function resolveRuntimeFile(
  file: (typeof PLAYER_FILES)[PlayerFileName],
  cwd: string,
): string | null {
  const specifier = `${RUNTIME_PACKAGE}/${file}`;
  for (const base of [__filename, join(cwd, 'package.json')]) {
    try {
      const req = createRequire(base);
      return req.resolve(specifier);
    } catch {
      // fall through
    }
  }
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'packages', 'runtime', 'dist', file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const RUNTIME_MISSING_MSG =
  `Player bundle not found. Install ${RUNTIME_PACKAGE} next to the CLI ` +
  `(npm install ${RUNTIME_PACKAGE}) or build it in this workspace.\n`;

/** Resolve every player file, throwing a readable error when one is missing. */
export function resolvePlayerFiles(cwd: string): Record<PlayerFileName, string> {
  const out = {} as Record<PlayerFileName, string>;
  for (const name of Object.keys(PLAYER_FILES) as PlayerFileName[]) {
    const found = resolveRuntimeFile(PLAYER_FILES[name], cwd);
    if (!found) throw new Error(`${RUNTIME_MISSING_MSG}(missing: ${PLAYER_FILES[name]})`);
    out[name] = found;
  }
  return out;
}

export function injectJsonScript(html: string, id: string, payload: unknown): string {
  // Inside `type="application/json"` the browser does not execute the
  // content, but a literal `</script>` would still close the tag — so
  // escape it. JSON parsing accepts U+2028 / U+2029 verbatim.
  const json = JSON.stringify(payload).replace(/<\/(script)/gi, '<\\/$1');
  const tag = `<script id="${id}" type="application/json">${json}</script>`;
  if (html.includes(`id="${id}"`)) {
    // Replace existing placeholder if the template provides one.
    return html.replace(
      new RegExp(`<script id="${id}"[^>]*>[\\s\\S]*?</script>`),
      tag,
    );
  }
  // Otherwise inject right before </head>.
  return html.replace('</head>', `${tag}\n</head>`);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DemoPageInput {
  template: string;
  config: Demo;
  /** Manifest entries, already mapped to page-resolvable URLs. */
  assets: readonly AssetEntry[];
  /** Theme preset id inherited from the project, when the demo sets none. */
  themeId?: string;
  /** Project-level token overrides. */
  themeTokens?: ThemeTokens | null;
}

/**
 * Fold project-level theme settings into the demo config: the project's
 * preset applies when the demo names none, and project tokens sit under the
 * demo's own token overrides. The page then carries one self-contained
 * config and the player needs no second source.
 */
export function applyProjectTheme(
  config: Demo,
  themeId: string | undefined,
  themeTokens: ThemeTokens | null | undefined,
): Demo {
  if (!themeId && !themeTokens) return config;
  const theme = config.theme ?? {};
  return {
    ...config,
    theme: {
      ...theme,
      ...(theme.preset || !themeId ? {} : { preset: themeId }),
      ...(themeTokens || theme.tokens
        ? { tokens: { ...(themeTokens ?? {}), ...(theme.tokens ?? {}) } }
        : {}),
    },
  };
}

/** Render a demo into the page template. */
export function renderDemoPage(input: DemoPageInput): string {
  const config = applyProjectTheme(input.config, input.themeId, input.themeTokens);
  const title = config.title ?? config.id;
  let html = input.template.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
  );
  html = injectJsonScript(html, 'demo-config', config);
  html = injectJsonScript(html, 'demo-assets', input.assets);
  return html;
}

export async function readTemplate(): Promise<string> {
  return readFile(resolveTemplate('demo.html'), 'utf8');
}
