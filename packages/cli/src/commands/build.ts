import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ASSETS_DIR, assetsForPage } from '../assets.js';
import { loadProject, orderDemos } from '../project.js';
import { readTemplate, renderDemoPage, resolvePlayerFiles, type PlayerFileName } from '../page.js';

export interface BuildOptions {
  cwd: string;
  /** Output folder, relative to the project root. Default `dist`. */
  out?: string;
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
 *     assets/…           the demo's asset bytes
 *
 * Deploy the folder anywhere that serves static files and embed the demo
 * with an iframe pointing at `<slug>/`.
 */
export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const loaded = await loadProject(options.cwd);
  const outDir = resolve(loaded.root, options.out ?? 'dist');
  const playerFiles = resolvePlayerFiles(loaded.root);
  const template = await readTemplate();

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const built: BuildResult['demos'] = [];
  for (const demo of orderDemos(loaded.demos, loaded.project)) {
    const dir = join(outDir, ...demo.slug.split('/'));
    await mkdir(dir, { recursive: true });

    const html = renderDemoPage({
      template,
      config: demo.config,
      assets: assetsForPage(demo.assets?.assets ?? []),
      themeId: loaded.project.theme,
      themeTokens: loaded.project.tokens ?? null,
    });
    await writeFile(join(dir, 'index.html'), html, 'utf8');

    for (const name of Object.keys(playerFiles) as PlayerFileName[]) {
      await copyFile(playerFiles[name], join(dir, name));
    }

    const assetsSrc = join(demo.dir, ASSETS_DIR);
    if (existsSync(assetsSrc)) {
      await cp(assetsSrc, join(dir, ASSETS_DIR), { recursive: true });
    }

    built.push({ slug: demo.slug, dir });
  }

  if (!options.silent) {
    const lines = built.map((d) => `  ${d.slug}/`).join('\n');
    process.stdout.write(
      `Built ${built.length} demo${built.length === 1 ? '' : 's'} into ${outDir}\n${lines}\n\n` +
        `Deploy the folder as static files and embed a demo with\n` +
        `  <iframe src="https://your-site/<path>/<slug>/" width="960" height="600" allow="fullscreen"></iframe>\n`,
    );
  }

  return { projectRoot: loaded.root, outDir, demos: built };
}
