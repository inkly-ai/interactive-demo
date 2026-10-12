import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init';
import { formatBuildSummary, runBuild } from '../src/commands/build';
import { embedSnippetsFor } from '../src/dev/editor-api';
import { playerSizeForConfig } from '../src/player-size';
import { parseDemo } from '@inkly-org/interactive-demo/schema';
import { resolveRuntimeFile } from '../src/page';
import { PROJECT_FILE } from '../src/project';

const runtimeBuilt = resolveRuntimeFile('player.js', process.cwd()) !== null;

describe('runBuild', () => {
  let workdir: string;
  let projectDir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-build-test-'));
    projectDir = (await runInit({ name: 'site', cwd: workdir, silent: true })).dir;
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('refuses to build into the project folder itself', async () => {
    await expect(runBuild({ cwd: projectDir, out: '.', silent: true })).rejects.toThrow(
      /it is the project folder/,
    );
    // The sources the build reads must survive a refused build.
    expect(existsSync(join(projectDir, PROJECT_FILE))).toBe(true);
    expect(existsSync(join(projectDir, 'demos'))).toBe(true);
  });

  it('refuses to build into a folder that escapes upward', async () => {
    await expect(runBuild({ cwd: projectDir, out: '..', silent: true })).rejects.toThrow(
      /it is the project folder \(or contains it\)/,
    );
    expect(existsSync(join(projectDir, PROJECT_FILE))).toBe(true);
  });

  it('refuses to empty a non-empty folder it did not create', async () => {
    const out = join(projectDir, 'precious');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'keep.txt'), 'irreplaceable', 'utf8');

    await expect(runBuild({ cwd: projectDir, out: 'precious', silent: true })).rejects.toThrow(
      /was not created by/,
    );
    expect(await readFile(join(out, 'keep.txt'), 'utf8')).toBe('irreplaceable');
  });

  it.skipIf(!runtimeBuilt)('overwrites an unrelated folder only when forced', async () => {
    const out = join(projectDir, 'precious');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'keep.txt'), 'irreplaceable', 'utf8');

    await runBuild({ cwd: projectDir, out: 'precious', force: true, silent: true });
    expect(existsSync(join(out, 'keep.txt'))).toBe(false);
    expect(existsSync(join(out, 'getting-started'))).toBe(true);
  });

  it.skipIf(!runtimeBuilt)('rebuilds over its own output without --force', async () => {
    const first = await runBuild({ cwd: projectDir, silent: true });
    expect(existsSync(join(first.outDir, '.interactive-demo-build'))).toBe(true);
    // A second build reclaims the folder because the marker identifies it as ours.
    const second = await runBuild({ cwd: projectDir, silent: true });
    expect(second.demos.map((d) => d.slug)).toEqual(['getting-started']);
  });

  it.skipIf(!runtimeBuilt)('reclaims build output written before the marker existed', async () => {
    const first = await runBuild({ cwd: projectDir, silent: true });
    // Simulate a dist produced by an older version: same files, no marker.
    await rm(join(first.outDir, '.interactive-demo-build'));
    const second = await runBuild({ cwd: projectDir, silent: true });
    expect(second.demos.map((d) => d.slug)).toEqual(['getting-started']);
  });

  it('still refuses a folder holding anything it did not write', async () => {
    const out = join(projectDir, 'mixed');
    await mkdir(join(out, 'getting-started'), { recursive: true });
    await writeFile(join(out, 'getting-started', 'index.html'), '<html></html>', 'utf8');
    await writeFile(join(out, 'embed.js'), '', 'utf8');
    // Looks like build output except for one file that is not ours.
    await writeFile(join(out, 'notes.txt'), 'irreplaceable', 'utf8');

    await expect(runBuild({ cwd: projectDir, out: 'mixed', silent: true })).rejects.toThrow(
      /was not created by/,
    );
    expect(await readFile(join(out, 'notes.txt'), 'utf8')).toBe('irreplaceable');
  });

  it.skipIf(!runtimeBuilt)('writes a self-contained folder per demo', async () => {
    const result = await runBuild({ cwd: projectDir, silent: true });
    expect(result.outDir).toBe(join(projectDir, 'dist'));
    expect(result.demos.map((d) => d.slug)).toEqual(['getting-started']);

    const dir = join(result.outDir, 'getting-started');
    expect(existsSync(join(result.outDir, 'embed.js'))).toBe(true);
    expect(existsSync(join(dir, 'backgrounds', 'watercolor-background.jpg'))).toBe(true);
    expect((await readdir(dir)).sort()).toEqual(['assets', 'backgrounds', 'fonts', 'index.html', 'player-fonts.css', 'player.css', 'player.js']);
    expect((await readdir(join(dir, 'fonts'))).sort()).toEqual([
      'geist-mono-latin-wght-normal.woff2',
      'inter-latin-wght-normal.woff2',
    ]);
    expect((await stat(join(dir, 'assets', 'placeholder.png'))).isFile()).toBe(true);

    const html = await readFile(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>Getting Started</title>');
    expect(html).toContain('href="./player.css"');
    expect(html).toContain('href="./player-fonts.css"');
    expect(html).toContain('src="./player.js"');
    expect(html).toContain('<script id="demo-config" type="application/json">{');
    expect(html).toContain('"src":"assets/placeholder.png"');
    expect(html).not.toContain('/@vite/client');
    expect(html).not.toContain('__demo');

    const js = await readFile(join(dir, 'player.js'), 'utf8');
    expect(js.length).toBeGreaterThan(10_000);
  });

  it.skipIf(!runtimeBuilt)('honours --out and replaces a previous build', async () => {
    const first = await runBuild({ cwd: projectDir, out: 'out', silent: true });
    expect(first.outDir).toBe(join(projectDir, 'out'));
    await rm(join(projectDir, 'demos', 'getting-started'), { recursive: true, force: true });
    const second = await runBuild({ cwd: projectDir, out: 'out', silent: true });
    expect(second.demos).toEqual([]);
    expect(existsSync(join(projectDir, 'out', 'getting-started'))).toBe(false);
  });

  it.skipIf(!runtimeBuilt)('builds a demo with a missing asset, and says what validate would', async () => {
    await rm(join(projectDir, 'demos', 'getting-started', 'assets', 'placeholder.png'));
    const out: string[] = [];
    const err: string[] = [];
    const capture = (sink: string[]) =>
      ((chunk: unknown) => {
        sink.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture(out));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture(err));
    try {
      const result = await runBuild({ cwd: projectDir });
      expect(existsSync(join(result.outDir, 'getting-started', 'index.html'))).toBe(true);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(err.join('')).toContain('ERROR demos/getting-started/demo.config.json: References assets/placeholder.png');
    expect(err.join('')).toContain('Built anyway, with 1 error and 0 warnings');
    // The snippets stay on stdout, clean for anything piping them.
    expect(out.join('')).not.toContain('Built anyway');
  });

  it.skipIf(runtimeBuilt)('fails with a readable message when the player bundle is missing', async () => {
    await expect(runBuild({ cwd: projectDir, silent: true })).rejects.toThrow(/Player bundle not found/);
  });

  it.skipIf(!runtimeBuilt)('renders the page header and copies a project-relative brand logo', async () => {
    const projectFile = join(projectDir, PROJECT_FILE);
    const project = JSON.parse(await readFile(projectFile, 'utf8'));
    project.brand = {
      name: 'Site Co',
      logo: 'branding/mark.svg',
      cta: { label: 'Try it', href: 'https://site.example' },
    };
    await writeFile(projectFile, JSON.stringify(project, null, 2));
    await mkdir(join(projectDir, 'branding'), { recursive: true });
    await writeFile(join(projectDir, 'branding', 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

    const result = await runBuild({ cwd: projectDir, silent: true });
    const dir = join(result.outDir, 'getting-started');
    const html = await readFile(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<header class="demo-page-bar">');
    expect(html).toContain('<span class="demo-page-brand-word">Site Co</span>');
    expect(html).toContain('src="./brand/mark.svg"');
    expect(html).toContain('class="demo-page-cta is-primary"');
    expect((await stat(join(dir, 'brand', 'mark.svg'))).isFile()).toBe(true);
  });
});

describe('formatBuildSummary', () => {
  const config = parseDemo({
    id: 'buildSum0001',
    version: 1,
    steps: [{
      id: 's1',
      kind: 'content',
      background: { type: 'image', src: 'assets/a.png', naturalWidth: 1440, naturalHeight: 900 },
    }],
  });

  it('prints the same snippets as `embed` and the editor, sized to the demo', () => {
    const text = formatBuildSummary('/p/dist', 'dist', [
      { slug: 'tour', config },
      { slug: 'other', config },
    ]);
    const expected = embedSnippetsFor('tour', playerSizeForConfig(config));
    expect(text).toContain('  tour/\n  other/\n');
    expect(text).toContain(expected.inline);
    expect(text).toContain('src="https://YOUR-HOST/tour/?embed=inline"');
    expect(text).toContain('calc(100cqw * 900 / 1440 + 52px + 2px)');
    expect(text).toContain(expected.popup.loader);
    expect(text).toContain(expected.popup.triggers.html);
    expect(text).toContain('wherever you deploy dist/; the other demos differ only in the path.');
    expect(text).toContain('interactive-demo publish');
    expect(text).not.toContain('width="960"');
  });

  it('prints no snippet when nothing was built', () => {
    expect(formatBuildSummary('/p/dist', 'dist', [])).toBe('Built 0 demos into /p/dist\n\n');
  });
});
