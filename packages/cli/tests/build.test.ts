import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init';
import { runBuild } from '../src/commands/build';
import { resolveRuntimeFile } from '../src/page';

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

  it.skipIf(!runtimeBuilt)('writes a self-contained folder per demo', async () => {
    const result = await runBuild({ cwd: projectDir, silent: true });
    expect(result.outDir).toBe(join(projectDir, 'dist'));
    expect(result.demos.map((d) => d.slug)).toEqual(['getting-started']);

    const dir = join(result.outDir, 'getting-started');
    expect((await readdir(dir)).sort()).toEqual(['assets', 'index.html', 'player.css', 'player.js']);
    expect((await stat(join(dir, 'assets', 'placeholder.svg'))).isFile()).toBe(true);

    const html = await readFile(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>Getting Started</title>');
    expect(html).toContain('href="./player.css"');
    expect(html).toContain('src="./player.js"');
    expect(html).toContain('<script id="demo-config" type="application/json">{');
    expect(html).toContain('"publicUrl":"./assets/placeholder.svg"');
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

  it.skipIf(runtimeBuilt)('fails with a readable message when the player bundle is missing', async () => {
    await expect(runBuild({ cwd: projectDir, silent: true })).rejects.toThrow(/Player bundle not found/);
  });
});
