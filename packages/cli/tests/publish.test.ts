import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readConfigMock } = vi.hoisted(() => ({ readConfigMock: vi.fn() }));

vi.mock('../src/publish/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/publish/config.js')>();
  return { ...actual, readConfig: readConfigMock };
});

import { runInit } from '../src/commands/init';
import { runPublish, runPublishList } from '../src/commands/publish';


/** Point the starter demo's content step at a file under assets/. */
async function pointStepAt(projectDir: string, path: string): Promise<string> {
  const configPath = join(projectDir, 'demos', 'getting-started', 'demo.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.steps[1].background.src = path;
  const text = JSON.stringify(config, null, 2) + '\n';
  await writeFile(configPath, text, 'utf8');
  return text;
}

describe('interactive-demo publish', () => {
  let workdir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    delete process.env.INTERACTIVE_DEMO_API_BASE;
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-publish-'));
    readConfigMock.mockResolvedValue({
      token: 'test-token',
      apiBase: 'https://example.test',
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await rm(workdir, { recursive: true, force: true });
  });

  it('freezes a demo and returns the hosted url, replacing in place by default', async () => {
    const init = await runInit({ name: 'preview-site', cwd: workdir, silent: true });

    // The starter demo ships one local asset, so the sync round trips first.
    const cdnFor = (sha: string, ext: string) => `assets/sha256/${sha.slice(0, 2)}/${sha}${ext}`;
    const publicFor = (sha: string, ext: string) => `https://cdn.example.test/${cdnFor(sha, ext)}`;
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === 'https://example.test/api/cli/sync-assets') {
        const reqBody = JSON.parse(opts!.body as string) as {
          assets: { sha256: string; ext: string; contentType: string }[];
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uploads: reqBody.assets.map((a) => ({
              sha256: a.sha256,
              ext: a.ext,
              cdnPath: cdnFor(a.sha256, a.ext),
              publicUrl: publicFor(a.sha256, a.ext),
              uploadUrl: `https://upload.example.test/${a.sha256}`,
              uploadHeaders: { 'content-type': a.contentType },
            })),
          }),
        };
      }
      if (url.startsWith('https://upload.example.test/')) {
        expect(opts?.method).toBe('PUT');
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (url === 'https://example.test/api/cli/sync-assets/complete') {
        const reqBody = JSON.parse(opts!.body as string) as {
          assets: { sha256: string; ext: string }[];
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uploads: reqBody.assets.map((a) => ({
              sha256: a.sha256,
              ext: a.ext,
              cdnPath: cdnFor(a.sha256, a.ext),
              publicUrl: publicFor(a.sha256, a.ext),
            })),
          }),
        };
      }
      if (url === 'https://example.test/api/previews') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'abc123',
            path: '/p/abc123',
            url: 'https://example.test/p/abc123',
            replaced: true,
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await runPublish({ cwd: init.dir, silent: true });

    expect(result.url).toBe('https://example.test/p/abc123');
    expect(result.slug).toBe('getting-started');
    const previewCall = fetchMock.mock.calls.find(([url]) => url === 'https://example.test/api/previews');
    expect(previewCall).toBeTruthy();
    const [, opts] = previewCall as unknown as [string, RequestInit];
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer test-token');
    const body = JSON.parse(opts.body as string);
    expect(Object.keys(body).sort()).toEqual(['assets', 'config', 'demoSlug', 'hub', 'replace', 'title']);
    expect(body.demoSlug).toBe('getting-started');
    expect(body.config.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(body.hub.name).toBe('preview-site');
    expect(typeof body.hub.runtime).toBe('string');
    expect(body.hub.runtime.length).toBeGreaterThan(0);
    expect(body.replace).toBe(true);
    // Every asset in the frozen manifest carries an absolute URL; nothing
    // about the local files changed.
    for (const asset of body.assets.assets) {
      expect(asset.publicUrl).toMatch(/^https:\/\/cdn\.example\.test\//);
      expect(asset.cdnPath).toBeUndefined();
    }
  });

  it('uploads missing assets and posts CDN-ready JSON without changing local files', async () => {
    const init = await runInit({ name: 'unsynced-site', cwd: workdir, silent: true });
    const demoDir = join(init.dir, 'demos', 'getting-started');
    const bytes = Buffer.from('image bytes');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(join(demoDir, 'assets'), { recursive: true });
    await writeFile(join(demoDir, 'assets', `${sha256}.png`), bytes);
    const localConfigJson = await pointStepAt(init.dir, `assets/${sha256}.png`);

    const cdnFor = (sha: string, ext: string) => `assets/sha256/${sha.slice(0, 2)}/${sha}${ext}`;
    const imageCdnPath = cdnFor(sha256, '.png');
    const imagePublicUrl = `https://cdn.example.test/${imageCdnPath}`;

    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === 'https://example.test/api/cli/sync-assets') {
        const reqBody = JSON.parse(opts!.body as string) as {
          assets: { sha256: string; ext: string; contentType: string; size: number }[];
        };
        expect(reqBody.assets).toEqual([
          { sha256, ext: '.png', contentType: 'image/png', size: bytes.byteLength },
        ]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uploads: [{
              sha256,
              ext: '.png',
              cdnPath: imageCdnPath,
              publicUrl: imagePublicUrl,
              uploadUrl: `https://upload.example.test/${sha256}`,
              uploadHeaders: { 'content-type': 'image/png' },
            }],
          }),
        };
      }
      if (url === `https://upload.example.test/${sha256}`) {
        expect(opts?.method).toBe('PUT');
        expect(Buffer.from(opts?.body as Uint8Array).toString('utf8')).toBe('image bytes');
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (url === 'https://example.test/api/cli/sync-assets/complete') {
        const reqBody = JSON.parse(opts!.body as string);
        expect(reqBody.assets).toEqual([
          { sha256, ext: '.png', contentType: 'image/png', size: bytes.byteLength, cdnPath: imageCdnPath },
        ]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uploads: [{ sha256, ext: '.png', cdnPath: imageCdnPath, publicUrl: imagePublicUrl }],
          }),
        };
      }
      if (url === 'https://example.test/api/previews') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'abc123', path: '/p/abc123', url: 'https://example.test/p/abc123', replaced: true }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await runPublish({ cwd: init.dir, silent: true });
    expect(result.url).toBe('https://example.test/p/abc123');
    const previewCall = fetchMock.mock.calls.find(([url]) => url === 'https://example.test/api/previews');
    const body = JSON.parse(previewCall![1]?.body as string);
    expect(body.assets.assets[0]).toMatchObject({ id: `assets/${sha256}.png`, sha256, publicUrl: imagePublicUrl });
    // The frozen config points at the uploaded bytes, not the local path.
    expect(body.config.steps[1].background.src).toBe(imagePublicUrl);
    expect(body.snapshots).toBeUndefined();
    // Local files are untouched — publish never rewrites the working tree.
    expect(await readFile(join(demoDir, 'demo.config.json'), 'utf8')).toBe(localConfigJson);
  });

  it('--new mints a fresh deployment and warns when one already existed', async () => {
    const init = await runInit({ name: 'new-site', cwd: workdir, silent: true, noStarterDemo: true });
    // A demo with no assets keeps the fetch sequence to status + publish.
    const demoDir = join(init.dir, 'demos', 'plain');
    await mkdir(demoDir, { recursive: true });
    await writeFile(join(demoDir, 'demo.config.json'), JSON.stringify({
      id: 'plainDemo0001'.slice(0, 12),
      version: 1,
      title: 'Plain',
      steps: [{
        id: 's1',
        kind: 'content',
        background: { type: 'image', src: 'https://cdn.example.test/screen.png', naturalWidth: 1200, naturalHeight: 600 },
      }],
    }, null, 2));
    await writeFile(join(demoDir, 'assets.json'), JSON.stringify({ version: 1, assets: [] }));

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.startsWith('https://example.test/api/previews?demoId=')) {
        expect(opts?.method ?? 'GET').toBe('GET');
        return {
          ok: true,
          status: 200,
          json: async () => ({ deployed: true, latest: { id: 'old', path: '/p/old', url: 'https://example.test/p/old', createdAt: 'x' } }),
        };
      }
      if (url === 'https://example.test/api/previews') {
        const body = JSON.parse(opts!.body as string);
        expect(body.replace).toBe(false);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'fresh', path: '/p/fresh', url: 'https://example.test/p/fresh', replaced: false }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await runPublish({ cwd: init.dir, new: true });
    expect(result.url).toBe('https://example.test/p/fresh');
    expect(writes.join('')).toContain('Demo published');
    expect(writes.join('')).toContain('NEW deployment');
    expect(writes.join('')).toContain('<iframe src="https://example.test/p/fresh"');
  });

  it('fails when the config references a file that is not there', async () => {
    const init = await runInit({ name: 'missing-asset-site', cwd: workdir, silent: true });
    await pointStepAt(init.dir, 'assets/missing.png');

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(runPublish({ cwd: init.dir, silent: true })).rejects.toThrow(
      /assets\/missing\.png/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails clearly when not logged in', async () => {
    const init = await runInit({ name: 'noauth-site', cwd: workdir, silent: true });
    readConfigMock.mockResolvedValue({});
    await expect(
      runPublish({ cwd: init.dir, silent: true }),
    ).rejects.toThrow(/Not logged in/i);
  });

  it('--list resolves every demo by its stable id', async () => {
    const init = await runInit({ name: 'list-site', cwd: workdir, silent: true });
    const fetchMock = vi.fn(async (url: string) => {
      expect(url.startsWith('https://example.test/api/previews?demoId=')).toBe(true);
      return {
        ok: true,
        status: 200,
        json: async () => ({ deployed: true, latest: { id: 'l1', path: '/p/l1', url: 'https://example.test/p/l1', createdAt: 'x' } }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const entries = await runPublishList({ cwd: init.dir, silent: true });
    expect(entries).toEqual([
      expect.objectContaining({ slug: 'getting-started', deployed: true, url: 'https://example.test/p/l1' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
