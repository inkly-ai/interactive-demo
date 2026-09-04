import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { generateDemoId, isValidDemoId } from '@inkly-org/interactive-demo/schema';
import { runDev, type DevHandle } from '../src/commands/dev';
import { PROJECT_FILE } from '../src/project';

/**
 * Minimal demo config that satisfies DemoSchema. A demo's `id` is an opaque
 * minted identity (distinct from its folder slug), so the first argument is
 * only a human label for the fixture.
 */
function minimalDemoConfig(_label: string, title: string): unknown {
  return {
    id: generateDemoId(),
    version: 1,
    title,
    steps: [
      {
        id: 's1',
        kind: 'content',
        background: {
          type: 'image',
          src: 'asset:shot-1',
          naturalWidth: 1440,
          naturalHeight: 900,
          alt: 'screen',
        },
        captions: [{ id: 's1_c', text: 'A short caption.' }],
      },
    ],
  };
}

const SHA = 'b'.repeat(64);

async function writeDemo(root: string, slug: string, title: string): Promise<void> {
  const dir = join(root, 'demos', ...slug.split('/'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'demo.config.json'), JSON.stringify(minimalDemoConfig(slug, title), null, 2), 'utf8');
  await writeFile(
    join(dir, 'assets.json'),
    JSON.stringify({
      version: 1,
      assets: [{ id: 'shot-1', sha256: SHA, kind: 'image', contentType: 'image/png', file: `${SHA}.png` }],
    }),
    'utf8',
  );
  await writeFile(join(dir, 'assets', `${SHA}.png`), 'png-bytes', 'utf8');
}

async function writeProjectFixture(root: string): Promise<void> {
  await writeFile(
    join(root, PROJECT_FILE),
    JSON.stringify({ name: 'Test Project', theme: 'mono', tokens: { primary: '#5b3df5' } }, null, 2),
    'utf8',
  );
  await writeDemo(root, 'getting-started', 'Getting Started');
  await writeDemo(root, 'pricing-tour', 'Pricing Tour');
}

/**
 * Occupy a port in a low, fixed range rather than an OS-assigned ephemeral
 * one: the cascade under test scans upward from the occupied port, and near
 * the top of the ephemeral range there may be no free port left.
 */
async function occupyPort(): Promise<{ server: NetServer; port: number }> {
  for (let port = 4310; port < 4400; port += 1) {
    const server = createNetServer();
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (bound) return { server, port };
  }
  throw new Error('failed to occupy a test port in 4310-4399');
}

async function closeNetServer(server: NetServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function readJsonScript(html: string, id: string): unknown {
  const match = new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`).exec(html);
  if (!match) throw new Error(`no #${id} script in page`);
  return JSON.parse(match[1]!.replace(/<\\\//g, '</'));
}

describe('runDev project endpoints', () => {
  let root: string;
  let handle: DevHandle | null = null;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'interactive-demo-dev-test-'));
    await writeProjectFixture(root);
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('lists the demos at / as links', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(handle.url);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Test Project');
    expect(body).toContain('href="/getting-started/"');
    expect(body).toContain('href="/pricing-tour/"');
  });

  it('cascades to the next port when the requested port is taken', async () => {
    const occupied = await occupyPort();
    try {
      handle = await runDev({ cwd: root, port: occupied.port, silent: true });
      expect(handle.port).toBeGreaterThan(occupied.port);
      expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/`);
    } finally {
      await closeNetServer(occupied.server);
    }
  });

  it('lists discovered demos at /__demo/demos', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}__demo/demos`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ slug: string; title: string }>;
    expect(body.map((d) => d.slug).sort()).toEqual(['getting-started', 'pricing-tour']);
  });

  it('returns a specific demo config at /__demo/demo/:slug with page-resolvable assets', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}__demo/demo/getting-started`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { demo: { title: string }; assets: Array<{ id: string; publicUrl?: string }> };
    expect(body.demo.title).toBe('Getting Started');
    expect(body.assets[0]?.publicUrl).toBe(`./assets/${SHA}.png`);
  });

  it('returns 404 for an unknown demo slug', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}__demo/demo/nope`);
    expect(res.status).toBe(404);
    const page = await fetch(`${handle.url}nope/`);
    expect(page.status).toBe(404);
  });

  it('renders the demo page with the config and assets embedded per the page contract', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}getting-started/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<title>Getting Started</title>');
    expect(body).toContain('<link rel="stylesheet" href="./player.css" />');
    expect(body).toContain('<script src="./player.js"></script>');
    expect(body).toContain('<div id="root">');
    const config = readJsonScript(body, 'demo-config') as { title: string; theme: { preset: string; tokens: { primary: string } } };
    expect(config.title).toBe('Getting Started');
    // Project theme + tokens folded into the embedded config.
    expect(config.theme.preset).toBe('mono');
    expect(config.theme.tokens.primary).toBe('#5b3df5');
    const assets = readJsonScript(body, 'demo-assets') as Array<{ id: string; publicUrl: string }>;
    expect(assets[0]?.id).toBe('shot-1');
    expect(assets[0]?.publicUrl).toBe(`./assets/${SHA}.png`);
    // Nothing internal leaks into the page.
    expect(body).not.toContain('importmap');
    expect(body).not.toContain('/__editor');
  });

  it('redirects a demo page without a trailing slash so relative URLs resolve', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}getting-started`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/getting-started/');
  });

  it('serves a demo asset next to the page', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}getting-started/assets/${SHA}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toBe('png-bytes');
  });

  it('refuses paths that escape the assets folder', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}getting-started/assets/..%2F..%2F${PROJECT_FILE}`);
    expect([400, 404]).toContain(res.status);
  });

  it('renders a nested demo page', async () => {
    await writeDemo(root, 'guides/onboarding', 'Onboarding');
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}guides/onboarding/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Onboarding</title>');
    const asset = await fetch(`${handle.url}guides/onboarding/assets/${SHA}.png`);
    expect(asset.status).toBe(200);
  });

  it('serves the player files next to the page when the runtime is built', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const js = await fetch(`${handle.url}getting-started/player.js`);
    const css = await fetch(`${handle.url}getting-started/player.css`);
    // 200 when packages/runtime/dist exists, 503 with a readable message otherwise.
    expect([200, 503]).toContain(js.status);
    expect([200, 503]).toContain(css.status);
    if (js.status === 200) {
      expect(js.headers.get('content-type')).toMatch(/javascript/);
      expect(css.headers.get('content-type')).toMatch(/text\/css/);
    } else {
      expect(await js.text()).toContain('Player bundle not found');
    }
  });

  it('rejects a folder with no project file and no demo config', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'interactive-demo-dev-empty-'));
    try {
      await expect(runDev({ cwd: empty, port: 0, silent: true })).rejects.toThrow(
        new RegExp(PROJECT_FILE.replace('.', '\\.')),
      );
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('refuses to start when a demo folder uses a reserved slug', async () => {
    await writeDemo(root, '__demo', 'Reserved');
    await expect(runDev({ cwd: root, port: 0, silent: true })).rejects.toThrow(/reserved/);
  });

  it('startup backfill writes a minted id back to an id-less config', async () => {
    const configPath = join(root, 'demos', 'getting-started', 'demo.config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    delete config.id;
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    handle = await runDev({ cwd: root, port: 0, silent: true });
    const healed = JSON.parse(await readFile(configPath, 'utf8')) as { id?: string };
    expect(isValidDemoId(healed.id)).toBe(true);
  });

  it('live-reloads after a demo.config.json edit', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });

    const before = (await (await fetch(`${handle.url}__demo/demo/getting-started`)).json()) as { demo: { title: string } };
    expect(before.demo.title).toBe('Getting Started');

    const configPath = join(root, 'demos', 'getting-started', 'demo.config.json');
    const edited = JSON.parse(await readFile(configPath, 'utf8'));
    edited.title = 'Edited On Disk';
    await writeFile(configPath, JSON.stringify(edited, null, 2), 'utf8');

    // Poll until the watcher (awaitWriteFinish ~60ms + fs event latency)
    // re-reads the config and the endpoint reflects the new title.
    let served = before.demo.title;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`${handle.url}__demo/demo/getting-started`);
      served = ((await res.json()) as { demo: { title: string } }).demo.title;
      if (served === 'Edited On Disk') break;
    }
    expect(served).toBe('Edited On Disk');
  });

  it('does not live-reload on an asset write', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });

    let refreshed = false;
    const inner = handle.server.ws.send.bind(handle.server.ws);
    handle.server.ws.send = ((payload: { type?: string }) => {
      if (payload?.type === 'full-reload') refreshed = true;
      return inner(payload as never);
    }) as typeof handle.server.ws.send;

    await writeFile(join(root, 'demos', 'getting-started', 'assets', 'logo.png'), 'not-a-real-png', 'utf8');
    await new Promise((r) => setTimeout(r, 500));
    expect(refreshed).toBe(false);
  });

  it('keeps an invalid demo routable and explains the error instead of dropping it', async () => {
    await mkdir(join(root, 'demos', 'broken'), { recursive: true });
    await writeFile(join(root, 'demos', 'broken', 'demo.config.json'), '{ not json', 'utf8');
    handle = await runDev({ cwd: root, port: 0, silent: true });

    const body = (await (await fetch(`${handle.url}__demo/demos`)).json()) as Array<{ slug: string; error?: string }>;
    expect(body).toHaveLength(3);
    expect(body.find((d) => d.slug === 'broken')?.error).toMatch(/not valid JSON/);

    const index = await (await fetch(handle.url)).text();
    expect(index).toContain('href="/broken/"');
    expect(index).toContain('not valid JSON');

    const detail = await fetch(`${handle.url}__demo/demo/broken`);
    expect(detail.status).toBe(422);
    expect(((await detail.json()) as { error: string }).error).toMatch(/not valid JSON/);

    const page = await fetch(`${handle.url}broken/`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('class="demo-error"');
    expect(html).toContain('not valid JSON');
    expect(html).toContain('/@vite/client');

    // Fixing the file brings the demo back through the normal reload path.
    await writeFile(
      join(root, 'demos', 'broken', 'demo.config.json'),
      JSON.stringify(minimalDemoConfig('broken', 'Fixed Now'), null, 2),
      'utf8',
    );
    let status = 422;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      status = (await fetch(`${handle.url}__demo/demo/broken`)).status;
      if (status === 200) break;
    }
    expect(status).toBe(200);
  });

  it('returns 400 for a malformed percent-encoding in the demo route', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const res = await fetch(`${handle.url}__demo/demo/%E0`);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Malformed/);
  });

  it('serves the last of a burst of config writes', async () => {
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const configPath = join(root, 'demos', 'getting-started', 'demo.config.json');
    const base = JSON.parse(await readFile(configPath, 'utf8'));
    for (let n = 1; n <= 5; n += 1) {
      await writeFile(configPath, JSON.stringify({ ...base, title: `Burst ${n}` }, null, 2), 'utf8');
    }
    let served = '';
    for (let i = 0; i < 80; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`${handle.url}__demo/demo/getting-started`);
      served = ((await res.json()) as { demo: { title: string } }).demo.title;
      if (served === 'Burst 5') break;
    }
    expect(served).toBe('Burst 5');
  });

  it('orders demos the way the project file lists them', async () => {
    await writeFile(
      join(root, PROJECT_FILE),
      JSON.stringify({ name: 'Test Project', demos: ['pricing-tour', 'getting-started'] }),
      'utf8',
    );
    handle = await runDev({ cwd: root, port: 0, silent: true });
    const body = (await (await fetch(`${handle.url}__demo/demos`)).json()) as Array<{ slug: string }>;
    expect(body.map((d) => d.slug)).toEqual(['pricing-tour', 'getting-started']);
  });
});

describe('runDev standalone demo (no project file, served in place)', () => {
  let parent: string;
  let demoDir: string;
  let handle: DevHandle | null = null;

  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), 'interactive-demo-dev-standalone-'));
    demoDir = join(parent, 'website-tour');
    await mkdir(demoDir, { recursive: true });
    await writeFile(
      join(demoDir, 'demo.config.json'),
      JSON.stringify(minimalDemoConfig('website-tour', 'Website Tour'), null, 2),
      'utf8',
    );
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    await rm(parent, { recursive: true, force: true });
  });

  it('uses the demo folder itself as the project root', async () => {
    handle = await runDev({ cwd: demoDir, port: 0, silent: true });
    expect(handle.projectRoot).toBe(demoDir);
    const res = await fetch(`${handle.url}__demo/demo/website-tour`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { demo: { title: string } };
    expect(body.demo.title).toBe('Website Tour');
    const page = await fetch(`${handle.url}website-tour/`);
    expect(page.status).toBe(200);
  });

  it('renders the error page when the standalone config breaks, and recovers', async () => {
    handle = await runDev({ cwd: demoDir, port: 0, silent: true });
    const configPath = join(demoDir, 'demo.config.json');
    const good = await readFile(configPath, 'utf8');
    await writeFile(configPath, '{ broken', 'utf8');
    let html = '';
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      html = await (await fetch(`${handle.url}website-tour/`)).text();
      if (html.includes('class="demo-error"')) break;
    }
    expect(html).toContain('class="demo-error"');
    await writeFile(configPath, good, 'utf8');
    let status = 422;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      status = (await fetch(`${handle.url}__demo/demo/website-tour`)).status;
      if (status === 200) break;
    }
    expect(status).toBe(200);
  });

  it('live-reloads after editing demo.config.json in the real folder', async () => {
    handle = await runDev({ cwd: demoDir, port: 0, silent: true });

    const configPath = join(demoDir, 'demo.config.json');
    const edited = JSON.parse(await readFile(configPath, 'utf8'));
    edited.title = 'Edited In Place';
    await writeFile(configPath, JSON.stringify(edited, null, 2), 'utf8');

    let served = 'Website Tour';
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`${handle.url}__demo/demo/website-tour`);
      served = ((await res.json()) as { demo: { title: string } }).demo.title;
      if (served === 'Edited In Place') break;
    }
    expect(served).toBe('Edited In Place');
  });

  it('does not write a project file or a vite cache into the user folder', async () => {
    handle = await runDev({ cwd: demoDir, port: 0, silent: true });
    await fetch(`${handle.url}__demo/demo/website-tour`);
    await fetch(handle.url);
    const entries = (await readdir(demoDir)).sort();
    expect(entries).toEqual(['demo.config.json']);
  });
});
