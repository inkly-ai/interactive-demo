import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init';
import { runValidate } from '../src/commands/validate';
import { PROJECT_FILE } from '../src/project';
import { starterDemoConfig, titleFromSlug } from '../src/starter';

/**
 * A captured demo references its screenshots by path under the demo's
 * `assets/` folder. That is a fully valid, previewable state and must NOT
 * warn.
 */
describe('runValidate — media paths', () => {
  let workdir: string;
  let projectDir: string;

  const FILE = `${'a'.repeat(64)}.png`;

  async function writeCapturedDemo(opts: { src: string; withFile: boolean }): Promise<void> {
    const demoDir = join(projectDir, 'demos', 'tour');
    await mkdir(join(demoDir, 'assets'), { recursive: true });
    await writeFile(
      join(demoDir, 'demo.config.json'),
      JSON.stringify({
        id: 'CaPtUrEd0001',
        version: 1,
        title: 'Tour',
        steps: [
          {
            kind: 'content',
            id: 's1',
            background: { type: 'image', src: opts.src, naturalWidth: 1440, naturalHeight: 900 },
            advance: { trigger: 'click' },
          },
        ],
      }),
    );
    if (opts.withFile) {
      await writeFile(join(demoDir, 'assets', FILE), 'png-bytes');
    }
    await writeFile(
      join(projectDir, PROJECT_FILE),
      JSON.stringify({ name: 'myproject', theme: 'mono', demos: ['tour'] }),
    );
  }

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-validate-test-'));
    const init = await runInit({ name: 'myproject', cwd: workdir, silent: true });
    projectDir = init.dir;
    await rm(join(projectDir, 'demos', 'getting-started'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('does not warn when the referenced file exists in the demo assets/ dir', async () => {
    await writeCapturedDemo({ src: `assets/${FILE}`, withFile: true });
    const result = await runValidate({ cwd: projectDir, silent: true });
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('errors when the referenced file is missing on disk', async () => {
    await writeCapturedDemo({ src: `assets/${FILE}`, withFile: true });
    await rename(join(projectDir, 'demos', 'tour', 'assets', FILE), join(projectDir, 'demos', 'tour', 'assets', `${FILE}.bak`));
    const result = await runValidate({ cwd: projectDir, silent: true });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toBe(`References assets/${FILE}, but demos/tour/assets/${FILE} does not exist.`);
  });

  it('errors on a path that escapes the demo folder and on an asset pointer', async () => {
    await writeCapturedDemo({ src: '../secrets.png', withFile: false });
    let result = await runValidate({ cwd: projectDir, silent: true });
    expect(result.issues.some((i) => i.level === 'error' && /escapes the demo folder/.test(i.message))).toBe(true);

    await writeCapturedDemo({ src: 'asset:cap-001', withFile: false });
    result = await runValidate({ cwd: projectDir, silent: true });
    expect(result.issues.some((i) => i.level === 'error' && /asset pointers are not supported/.test(i.message))).toBe(true);
  });
});

describe('runValidate — project', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-validate-project-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('validates a freshly initialized project', async () => {
    const init = await runInit({ name: 'valid', cwd: workdir, silent: true });
    const result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
  });

  it('warns when a demo id is missing or malformed instead of healing it silently', async () => {
    const init = await runInit({ name: 'badid', cwd: workdir, silent: true });
    const configPath = join(init.dir, 'demos', 'getting-started', 'demo.config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.id = 'gettingStarted1';
    await writeFile(configPath, JSON.stringify(config, null, 2));
    const result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(1);
    expect(result.issues[0]?.file).toBe('demos/getting-started/demo.config.json');
    expect(result.issues[0]?.message).toMatch(/12-character/);
    // validate is read-only: the file is left as the author wrote it.
    expect(JSON.parse(await readFile(configPath, 'utf8')).id).toBe('gettingStarted1');
  });

  it('errors when brand.logo names a project file that does not exist, and accepts URLs and present files', async () => {
    const init = await runInit({ name: 'branded', cwd: workdir, silent: true });
    const projectFile = join(init.dir, PROJECT_FILE);
    const project = JSON.parse(await readFile(projectFile, 'utf8'));

    project.brand = { name: 'Branded', logo: 'branding/missing.png' };
    await writeFile(projectFile, JSON.stringify(project));
    let result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes('brand.logo') && i.message.includes('not found'))).toBe(true);

    project.brand = { name: 'Branded', logo: '../outside.png' };
    await writeFile(projectFile, JSON.stringify(project));
    result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.issues.some((i) => i.message.includes('escapes the project root'))).toBe(true);

    project.brand = { name: 'Branded', logo: 'https://cdn.example/logo.png', cta: { label: 'Go', href: 'https://x.example' } };
    await writeFile(projectFile, JSON.stringify(project));
    result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(true);

    project.brand = { logo: 'branding/mark.png' };
    await mkdir(join(init.dir, 'branding'), { recursive: true });
    await writeFile(join(init.dir, 'branding', 'mark.png'), 'png');
    await writeFile(projectFile, JSON.stringify(project));
    result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(true);

    // The schema rejects a CTA that is not an http(s)/mailto link.
    project.brand = { cta: { label: 'Bad', href: 'javascript:alert(1)' } };
    await writeFile(projectFile, JSON.stringify(project));
    result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(false);
  });

  it('reports missing listed demos as warnings by default and errors in strict mode', async () => {
    const init = await runInit({ name: 'warning', cwd: workdir, silent: true });
    await writeFile(
      join(init.dir, PROJECT_FILE),
      JSON.stringify({ name: 'warning', demos: ['missing-demo'] }, null, 2) + '\n',
      'utf8',
    );

    const regular = await runValidate({ cwd: init.dir, silent: true });
    expect(regular.ok).toBe(true);
    expect(regular.warnings).toBeGreaterThan(0);

    const strict = await runValidate({ cwd: init.dir, strict: true, silent: true });
    expect(strict.ok).toBe(false);
    expect(strict.warnings).toBeGreaterThan(0);
  });

  it('flags a reserved slug listed in the project file as an error', async () => {
    const init = await runInit({ name: 'reserved-list', cwd: workdir, silent: true });
    await writeFile(
      join(init.dir, PROJECT_FILE),
      // `api` is reserved; this must fail validation regardless of
      // whether a demos/api/ folder exists.
      JSON.stringify({ name: 'reserved-list', demos: ['api'] }, null, 2) + '\n',
      'utf8',
    );

    const result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.level === 'error' && i.file === PROJECT_FILE && /reserved/i.test(i.message),
      ),
    ).toBe(true);
  });

  it('flags a reserved-slug demo folder as an error', async () => {
    const init = await runInit({ name: 'reserved-folder', cwd: workdir, silent: true });
    // Hand-create a demo folder with a reserved slug. `init --demo` would
    // refuse, but a user could `mkdir` directly — validate must catch it.
    const apiDir = join(init.dir, 'demos', 'api');
    await mkdir(apiDir, { recursive: true });
    await writeFile(
      join(apiDir, 'demo.config.json'),
      JSON.stringify(starterDemoConfig('api', titleFromSlug('api')), null, 2) + '\n',
      'utf8',
    );

    const result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.level === 'error' && i.file.startsWith('demos/api') && /reserved/i.test(i.message),
      ),
    ).toBe(true);
  });

  it('flags an unknown theme preset as an error', async () => {
    const init = await runInit({ name: 'bad-theme', cwd: workdir, silent: true });
    await writeFile(
      join(init.dir, PROJECT_FILE),
      JSON.stringify({ name: 'bad-theme', theme: 'nope' }, null, 2) + '\n',
      'utf8',
    );
    const result = await runValidate({ cwd: init.dir, silent: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /Unknown theme "nope"/.test(i.message))).toBe(true);
  });

  it('reports a missing project file with a hint', async () => {
    const result = await runValidate({ cwd: workdir, silent: true });
    expect(result.ok).toBe(false);
    expect(result.projectRoot).toBeNull();
    expect(result.issues[0]?.message).toMatch(new RegExp(PROJECT_FILE.replace('.', '\\.')));
    expect(result.issues[0]?.message).toMatch(/run from a project root/);
  });
});
