import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoSchema, isValidDemoId } from '@inkly-org/interactive-demo/schema';
import { runAddDemo, runInit } from '../src/commands/init';
import { PROJECT_FILE, ProjectSchema } from '../src/project';

describe('runInit', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-init-test-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('scaffolds a placeholder the hosted service will accept', async () => {
    const result = await runInit({ name: 'site', cwd: workdir, silent: true });
    const placeholder = join(result.dir, 'demos', 'getting-started', 'assets', 'placeholder.png');

    // Not just the extension: the bytes have to be a real PNG. An earlier
    // version copied the field list by hand, dropped `copyFrom`, and wrote a
    // zero-byte file that still ended in .png.
    const bytes = await readFile(placeholder);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // SVG is refused by the hosted allowlist — it can carry script — so a
    // scaffolded SVG could be built locally but never published.
    const files = await readdir(join(result.dir, 'demos', 'getting-started', 'assets'));
    expect(files.some((f) => f.endsWith('.svg'))).toBe(false);
  });

  it('scaffolds a project with a valid project file and starter demo', async () => {
    const result = await runInit({ name: 'sample', cwd: workdir, silent: true });

    expect(result.dir).toBe(join(workdir, 'sample'));
    expect(result.files.sort()).toEqual(
      [
        '.gitignore',
        'README.md',
        'package.json',
        PROJECT_FILE,
        join('demos', 'getting-started', 'demo.config.json'),
        join('demos', 'getting-started', 'assets', 'placeholder.png'),
      ].sort(),
    );

    for (const file of result.files) {
      const s = await stat(join(result.dir, file));
      expect(s.isFile()).toBe(true);
    }

    const project = JSON.parse(await readFile(join(result.dir, PROJECT_FILE), 'utf8'));
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.name).toBe('sample');
    expect(project.theme).toBe('default');
    expect(project.demos).toEqual(['getting-started']);
    expect(project.runtime).toBeUndefined();
    expect(project.collections).toBeUndefined();

    const demo = JSON.parse(
      await readFile(join(result.dir, 'demos', 'getting-started', 'demo.config.json'), 'utf8'),
    );
    expect(DemoSchema.safeParse(demo).success).toBe(true);
    // The starter demo's identity is a freshly-minted opaque id, not the
    // folder slug.
    expect(isValidDemoId(demo.id)).toBe(true);
    expect(demo.title).toBe('Getting Started');
    expect(demo.steps).toHaveLength(3);
    expect(demo.steps[0].kind).toBe('cover');
    expect(demo.steps[0].widgets[0].cta.animation).toBe('shimmer');
    expect(demo.steps[1].kind).toBe('content');
    expect(demo.steps[1].background.type).toBe('image');
    expect(demo.steps[1].background.src).toBe('assets/placeholder.png');
    expect(demo.steps[2].kind).toBe('cover');

    expect((await stat(join(result.dir, 'demos', 'getting-started', 'assets', 'placeholder.png'))).isFile()).toBe(true);

    const ignore = await readFile(join(result.dir, '.gitignore'), 'utf8');
    expect(ignore).toContain('node_modules/');
    expect(ignore).toContain('dist/');
  });

  it('--no-starter-demo scaffolds an empty project with an empty demos list', async () => {
    const result = await runInit({ name: 'empty', cwd: workdir, silent: true, noStarterDemo: true });

    expect(result.files.some((f) => f.includes('getting-started'))).toBe(false);
    expect(result.files.sort()).toEqual(['.gitignore', 'README.md', 'package.json', PROJECT_FILE].sort());

    const project = JSON.parse(await readFile(join(result.dir, PROJECT_FILE), 'utf8'));
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.demos).toEqual([]);
  });

  it('refuses to overwrite an existing directory', async () => {
    await runInit({ name: 'collide', cwd: workdir, silent: true });
    await expect(
      runInit({ name: 'collide', cwd: workdir, silent: true }),
    ).rejects.toThrow(/already exists/);
  });

  it('writes the requested theme into the project file', async () => {
    const result = await runInit({ name: 'themed', cwd: workdir, theme: 'mono', silent: true });
    const project = JSON.parse(await readFile(join(result.dir, PROJECT_FILE), 'utf8'));
    expect(project.theme).toBe('mono');
  });

  it('rejects invalid project names', async () => {
    await expect(
      runInit({ name: 'Bad_Name', cwd: workdir, silent: true }),
    ).rejects.toThrow();
  });

  it('rejects unknown theme values', async () => {
    await expect(
      runInit({ name: 'bad-theme', cwd: workdir, theme: 'unknown-theme', silent: true }),
    ).rejects.toThrow(/Invalid theme/);
  });
});

describe('runAddDemo', () => {
  let workdir: string;
  let projectDir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-add-test-'));
    const init = await runInit({ name: 'myproject', cwd: workdir, silent: true });
    projectDir = init.dir;
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('scaffolds a new demo with a valid demo.config.json and registers it', async () => {
    const result = await runAddDemo({ slug: 'checkout', cwd: projectDir, silent: true });

    expect(result.demoDir).toBe(join(projectDir, 'demos', 'checkout'));
    const demo = JSON.parse(await readFile(join(result.demoDir, 'demo.config.json'), 'utf8'));
    expect(DemoSchema.safeParse(demo).success).toBe(true);
    expect(isValidDemoId(demo.id)).toBe(true);
    expect(demo.id).toBe(result.id);
    expect(demo.title).toBe('Checkout');
    expect(demo.steps).toHaveLength(3);
    expect((await stat(join(result.demoDir, 'assets', 'placeholder.png'))).isFile()).toBe(true);

    expect(result.registered).toBe(true);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project.demos).toEqual(['getting-started', 'checkout']);
  });

  it('rejects reserved slugs with the validator reason', async () => {
    await expect(
      runAddDemo({ slug: '__demo', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/reserved/);
  });

  it('rejects "assets" as a demo slug', async () => {
    await expect(
      runAddDemo({ slug: 'assets', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/reserved/);
  });

  it('errors when the demo folder already exists', async () => {
    await expect(
      runAddDemo({ slug: 'getting-started', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/already exists/);
  });

  it('errors when not inside a project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'interactive-demo-add-outside-'));
    try {
      await expect(
        runAddDemo({ slug: 'foo', cwd: outside, silent: true }),
      ).rejects.toThrow(/Not inside a project/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('leaves the project file untouched when it keeps no demos list', async () => {
    const minimal = { name: 'myproject' };
    await writeFile(join(projectDir, PROJECT_FILE), JSON.stringify(minimal, null, 2) + '\n');
    const result = await runAddDemo({ slug: 'standalone', cwd: projectDir, silent: true });
    expect(result.registered).toBe(false);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project).toEqual(minimal);
  });

  it('finds the project root from a nested cwd', async () => {
    const nested = join(projectDir, 'demos', 'getting-started');
    const result = await runAddDemo({ slug: 'nested-cwd', cwd: nested, silent: true });
    expect(result.projectRoot).toBe(projectDir);
  });

  async function writeCapturedFolder(dir: string): Promise<void> {
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(
      join(dir, 'demo.config.json'),
      JSON.stringify({
        id: 'CaPtUrEd0001',
        version: 1,
        title: 'Captured Tour',
        steps: [
          {
            kind: 'content',
            id: 's1',
            background: { type: 'image', src: `assets/${'a'.repeat(64)}.png`, naturalWidth: 1440, naturalHeight: 900 },
            advance: { trigger: 'click' },
          },
        ],
      }),
    );
    await writeFile(join(dir, 'assets', `${'a'.repeat(64)}.png`), 'png-bytes');
  }

  it('imports an existing demo folder via --from, keeping its id and copying assets', async () => {
    const src = join(workdir, 'tour-export');
    await writeCapturedFolder(src);

    const result = await runAddDemo({ slug: 'tour', cwd: projectDir, from: src, silent: true });

    expect(result.id).toBe('CaPtUrEd0001'); // preserved, not re-minted
    const config = JSON.parse(await readFile(join(result.demoDir, 'demo.config.json'), 'utf8'));
    expect(DemoSchema.safeParse(config).success).toBe(true);
    expect(config.id).toBe('CaPtUrEd0001');
    expect((await stat(join(result.demoDir, 'assets', `${'a'.repeat(64)}.png`))).isFile()).toBe(true);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project.demos).toContain('tour');
  });

  it('rejects --from when the source has no demo.config.json', async () => {
    const src = join(workdir, 'not-a-demo');
    await mkdir(src, { recursive: true });
    await expect(runAddDemo({ slug: 'x', cwd: projectDir, from: src, silent: true })).rejects.toThrow(
      /not a demo folder/i,
    );
  });
});
