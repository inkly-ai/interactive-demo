import { copyFile, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Demo } from '@inkly-org/interactive-demo/schema';
import { basename, join, relative, resolve, sep } from 'node:path';
import { ASSETS_DIR } from '../assets.js';
import { brandLogoSourcePath, loadProject, orderDemos } from '../project.js';
import { EMBED_HOST_PLACEHOLDER, embedSnippetsFor } from '../dev/editor-api.js';
import { playerSizeForConfig } from '../player-size.js';
import { runValidate } from './validate.js';
import {
  EMBED_LOADER_FILE,
  PLAYER_BACKGROUND_FILES,
  PLAYER_FONT_FILES,
  readTemplate,
  resolveRuntimeBackgroundsDir,
  resolveRuntimeFile,
  renderDemoPage,
  resolvePlayerFiles,
  resolveRuntimeFontsDir,
  type PlayerFileName,
  BRAND_DIR,
} from '../page.js';

export interface BuildOptions {
  cwd: string;
  /** Output folder, relative to the project root. Default `dist`. */
  out?: string;
  /** Reclaim a non-empty output folder this tool did not create. */
  force?: boolean;
  /** Suppress stdout. Used by tests. */
  silent?: boolean;
}

export interface BuildResult {
  projectRoot: string;
  outDir: string;
  demos: Array<{ slug: string; dir: string }>;
}

/**
 * Write a self-contained static folder per demo:
 *
 *   <out>/<slug>/
 *     index.html         the player page with the config + manifest embedded
 *     player.js          the self-contained runtime
 *     player.css
 *     player-fonts.css   optional self-hosted fonts, with fonts/*.woff2
 *     assets/…           the demo's asset bytes
 *
 * Deploy the folder anywhere that serves static files and embed the demo
 * with an iframe pointing at `<slug>/`.
 */
/**
 * Written into the output folder so a later build can recognise the folder as
 * its own. `build` empties its output before writing, and the output path is
 * user-supplied — without a marker, `--out .` or `--out ~/Documents` would
 * delete a directory the tool never created.
 */
const BUILD_MARKER = '.interactive-demo-build';

/** True when `child` is `parent` or sits above it. */
function containsOrEquals(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(child, parent);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

/**
 * Decide whether the output folder may be emptied. Missing and empty folders
 * are always fine; a folder carrying our marker is a previous build and is
 * ours to replace. Anything else needs `--force`, and the project root is
 * refused outright — emptying it would delete the sources being built.
 */
async function assertOutDirIsSafe(
  outDir: string,
  projectRoot: string,
  force: boolean,
): Promise<void> {
  if (containsOrEquals(outDir, projectRoot)) {
    throw new Error(
      `Refusing to build into ${outDir}: it is the project folder (or contains it), ` +
        `and building empties the output folder first. Pick a subfolder, e.g. --out dist.`,
    );
  }

  if (!existsSync(outDir)) return;

  const entries = await readdir(outDir, { withFileTypes: true });
  if (entries.length === 0) return;
  if (entries.some((entry) => entry.name === BUILD_MARKER)) return;
  if (force) return;

  // Output written before the marker existed still belongs to us. Every entry
  // has to be recognisable — the embed loader, or a demo folder with a page in
  // it — so a folder holding anything we did not write is still refused.
  let sawDemoFolder = false;
  const recognised = entries.every((entry) => {
    if (entry.name === EMBED_LOADER_FILE) return true;
    if (entry.isDirectory() && existsSync(join(outDir, entry.name, 'index.html'))) {
      sawDemoFolder = true;
      return true;
    }
    return false;
  });
  if (recognised && sawDemoFolder) return;

  throw new Error(
    `Refusing to empty ${outDir}: it is not empty and was not created by ` +
      `\`interactive-demo build\` (no ${BUILD_MARKER} marker). ` +
      `Delete it yourself, pick another --out, or pass --force to overwrite it.`,
  );
}

/**
 * What `build` prints: the folders it wrote, then the embed snippets for the
 * first demo, built by the same code as `embed` and the editor's Share
 * dialog so every surface hands out one shape. The host is a placeholder —
 * only the person deploying the folder knows where it will live.
 */
export function formatBuildSummary(
  outDir: string,
  outName: string,
  built: Array<{ slug: string; config: Demo }>,
): string {
  const lines = built.map((d) => `  ${d.slug}/`).join('\n');
  let text = `Built ${built.length} demo${built.length === 1 ? '' : 's'} into ${outDir}\n${lines}\n`;
  const first = built[0];
  if (!first) return text;
  const snippets = embedSnippetsFor(first.slug, playerSizeForConfig(first.config));
  text +=
    `\nDeploy the folder as static files and embed ${first.slug} inline:\n\n` +
    `${snippets.inline}\n\n` +
    `or open it from a button in a pop-up:\n\n` +
    `${snippets.popup.loader}\n` +
    `${snippets.popup.triggers.html}\n\n` +
    `Replace ${EMBED_HOST_PLACEHOLDER} with wherever you deploy ${outName}/` +
    `${built.length > 1 ? '; the other demos differ only in the path' : ''}.\n\n` +
    `Don't want to host it? \`interactive-demo publish\` puts the demo online\n` +
    `and prints its URL; the snippets above are the same apart from the host.\n`;
  return text;
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const loaded = await loadProject(options.cwd);
  const outDir = resolve(loaded.root, options.out ?? 'dist');
  const playerFiles = resolvePlayerFiles(loaded.root);
  const fontsDir = resolveRuntimeFontsDir(loaded.root);
  const backgroundsDir = resolveRuntimeBackgroundsDir(loaded.root);
  const template = await readTemplate();

  await assertOutDirIsSafe(outDir, loaded.root, options.force === true);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, BUILD_MARKER), 'interactive-demo\n', 'utf8');

  const built: BuildResult['demos'] = [];
  const summary: Parameters<typeof formatBuildSummary>[2] = [];
  for (const demo of orderDemos(loaded.demos, loaded.project)) {
    const dir = join(outDir, ...demo.slug.split('/'));
    await mkdir(dir, { recursive: true });

    const html = renderDemoPage({
      template,
      config: demo.config,
      themeTokens: loaded.project.tokens ?? null,
      project: loaded.project,
    });
    await writeFile(join(dir, 'index.html'), html, 'utf8');

    // A project-relative brand logo travels with the page under ./brand/.
    const logoSrc = brandLogoSourcePath(loaded.root, loaded.project.brand);
    if (logoSrc && existsSync(logoSrc)) {
      await mkdir(join(dir, BRAND_DIR), { recursive: true });
      await copyFile(logoSrc, join(dir, BRAND_DIR, basename(logoSrc)));
    }

    for (const name of Object.keys(playerFiles) as PlayerFileName[]) {
      await copyFile(playerFiles[name], join(dir, name));
    }
    if (fontsDir) {
      await mkdir(join(dir, 'fonts'), { recursive: true });
      for (const file of PLAYER_FONT_FILES) {
        await copyFile(join(fontsDir, file), join(dir, 'fonts', file));
      }
    }
    if (backgroundsDir) {
      await mkdir(join(dir, 'backgrounds'), { recursive: true });
      for (const file of PLAYER_BACKGROUND_FILES) {
        await copyFile(join(backgroundsDir, file), join(dir, 'backgrounds', file));
      }
    }

    const assetsSrc = join(demo.dir, ASSETS_DIR);
    if (existsSync(assetsSrc)) {
      await cp(assetsSrc, join(dir, ASSETS_DIR), { recursive: true });
    }

    built.push({ slug: demo.slug, dir });
    summary.push({ slug: demo.slug, config: demo.config });
  }

  // The pop-up loader sits once at the output root, next to the demo folders.
  const loaderSrc = resolveRuntimeFile(EMBED_LOADER_FILE, options.cwd);
  if (loaderSrc) await copyFile(loaderSrc, join(outDir, EMBED_LOADER_FILE));

  if (!options.silent) {
    process.stdout.write(formatBuildSummary(outDir, relative(loaded.root, outDir), summary));
  }

  // Building does not validate, and a missing asset or a reserved slug builds
  // green. Failing here would break pipelines that run only `build`, so the
  // folder is still written; this says what `validate` would have.
  const checked = options.silent ? null : await runValidate({ cwd: options.cwd, silent: true });
  if (checked && checked.issues.length > 0) {
    for (const issue of checked.issues) {
      process.stderr.write(`${issue.level.toUpperCase()} ${issue.file}: ${issue.message}\n`);
    }
    process.stderr.write(
      `Built anyway, with ${checked.errors} error${checked.errors === 1 ? '' : 's'} and ` +
        `${checked.warnings} warning${checked.warnings === 1 ? '' : 's'} from \`interactive-demo validate\`. ` +
        'Run it before `build` to fail on these.\n',
    );
  }

  return { projectRoot: loaded.root, outDir, demos: built };
}
