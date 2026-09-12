/**
 * End-to-end against a fake hosting server that implements the wire contract:
 *
 *   POST /api/cli/exchange                 { pairingToken } -> { apiToken, apiBase }
 *   GET  /api/captures/verify              bearer -> { ok, userId, email }
 *   POST /api/cli/sync-assets              { assets:[{sha256,ext,contentType,size}] }
 *                                           -> { uploads:[{sha256,ext,cdnPath,publicUrl,uploadUrl,uploadHeaders}] }
 *   PUT  <uploadUrl>                       raw bytes
 *   POST /api/cli/sync-assets/complete     { assets:[{sha256,ext,contentType,size,cdnPath}] }
 *                                           -> { uploads:[{sha256,ext,cdnPath,publicUrl}] }
 *   GET  /api/previews?demoId=<id>         bearer -> { deployed, latest? }
 *   POST /api/previews                     bearer, { demoSlug,title,config,assets,hub,replace }
 *                                           -> 200/201 { id, path, url, replaced }
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { readConfigMock, writeConfigMock } = vi.hoisted(() => ({
  readConfigMock: vi.fn(),
  writeConfigMock: vi.fn(),
}));

vi.mock('../src/publish/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/publish/config.js')>();
  return { ...actual, readConfig: readConfigMock, writeConfig: writeConfigMock };
});

import { runInit } from '../src/commands/init';
import { runLogin } from '../src/commands/login';
import { runPublish } from '../src/commands/publish';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const cdnFor = (sha: string, ext: string) => `assets/sha256/${sha.slice(0, 2)}/${sha}${ext}`;

describe('publish against a fake hosting server', () => {
  let server: Server;
  let base: string;
  let requests: Recorded[];
  let workdir: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      void (async () => {
        const body = await readBody(req);
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        const bearer = req.headers.authorization === 'Bearer idp_test-token';

        if (req.method === 'POST' && url.pathname === '/api/cli/exchange') {
          const parsed = JSON.parse(body.toString('utf8')) as { pairingToken?: string };
          if (parsed.pairingToken !== 'pair-123') return json(401, { error: 'Pairing token is invalid or expired' });
          return json(200, { apiToken: 'idp_test-token', apiBase: base });
        }
        if (req.method === 'GET' && url.pathname === '/api/captures/verify') {
          if (!bearer) return json(401, { error: 'Unauthorized' });
          return json(200, { ok: true, userId: 'user_1', email: 'a@b.test' });
        }
        // Presigned uploads carry no bearer token; everything else below does.
        if (req.method === 'PUT' && url.pathname.startsWith('/upload/')) {
          res.statusCode = 200;
          return res.end();
        }
        if (!bearer) return json(401, { error: 'Unauthorized' });
        if (req.method === 'POST' && url.pathname === '/api/cli/sync-assets') {
          const parsed = JSON.parse(body.toString('utf8')) as {
            assets: { sha256: string; ext: string; contentType: string; size: number }[];
          };
          return json(200, {
            uploads: parsed.assets.map((a) => ({
              sha256: a.sha256,
              ext: a.ext,
              cdnPath: cdnFor(a.sha256, a.ext),
              publicUrl: `${base}/cdn/${cdnFor(a.sha256, a.ext)}`,
              uploadUrl: `${base}/upload/${a.sha256}${a.ext}`,
              uploadHeaders: { 'content-type': a.contentType },
            })),
          });
        }
        if (req.method === 'POST' && url.pathname === '/api/cli/sync-assets/complete') {
          const parsed = JSON.parse(body.toString('utf8')) as {
            assets: { sha256: string; ext: string; cdnPath: string }[];
          };
          return json(200, {
            uploads: parsed.assets.map((a) => ({
              sha256: a.sha256,
              ext: a.ext,
              cdnPath: a.cdnPath,
              publicUrl: `${base}/cdn/${a.cdnPath}`,
            })),
          });
        }
        if (req.method === 'GET' && url.pathname === '/api/previews') {
          return json(200, { deployed: false });
        }
        if (req.method === 'POST' && url.pathname === '/api/previews') {
          const parsed = JSON.parse(body.toString('utf8')) as { replace?: boolean };
          const id = 'srv123';
          return json(parsed.replace ? 200 : 201, {
            id,
            path: `/p/${id}`,
            url: `${base}/p/${id}`,
            replaced: Boolean(parsed.replace),
          });
        }
        json(404, { error: `no route ${req.method} ${url.pathname}` });
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no address');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    requests = [];
    process.env.INTERACTIVE_DEMO_API_BASE = base;
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-publish-server-'));
    readConfigMock.mockResolvedValue({ token: 'idp_test-token', apiBase: base });
    writeConfigMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    delete process.env.INTERACTIVE_DEMO_API_BASE;
    vi.restoreAllMocks();
    await rm(workdir, { recursive: true, force: true });
  });

  it('login exchanges the pairing token and saves the returned API token', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const loginPromise = runLogin({ cwd: workdir, open: false });

    let loginUrl: URL | null = null;
    const deadline = Date.now() + 1000;
    while (!loginUrl && Date.now() < deadline) {
      const m = writes.join('').match(/http:\/\/127\.0\.0\.1:\d+\/cli\/login[^\s]+/);
      if (m?.[0]) loginUrl = new URL(m[0]);
      else await delay(10);
    }
    expect(loginUrl).not.toBeNull();
    expect(loginUrl!.origin).toBe(base);

    // The browser side: the hosting app redirects back to the CLI's loopback
    // callback with the pairing token.
    const callback = new URL(loginUrl!.searchParams.get('callback') ?? '');
    callback.searchParams.set('state', loginUrl!.searchParams.get('state') ?? '');
    callback.searchParams.set('pairingToken', 'pair-123');
    const res = await fetch(callback, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location') ?? '').searchParams.get('status')).toBe('success');

    const result = await loginPromise;
    expect(result).toMatchObject({ apiBase: base, verified: true, method: 'browser' });

    const exchange = requests.find((r) => r.url === '/api/cli/exchange');
    expect(exchange).toBeTruthy();
    expect(exchange!.headers['content-type']).toBe('application/json');
    expect(JSON.parse(exchange!.body.toString('utf8'))).toEqual({ pairingToken: 'pair-123' });
    const verify = requests.find((r) => r.url === '/api/captures/verify');
    expect(verify!.headers.authorization).toBe('Bearer idp_test-token');
    expect(writeConfigMock).toHaveBeenCalledWith({ apiBase: base, token: 'idp_test-token' });
  });

  it('publish uploads assets through presigned PUTs and posts the frozen demo', async () => {
    const init = await runInit({ name: 'srv-site', cwd: workdir, silent: true });
    // The project's brand travels with the frozen demo so the hosted page
    // can render the same header as `build`.
    const projectFile = join(init.dir, 'interactive-demo.json');
    const project = JSON.parse(await readFile(projectFile, 'utf8'));
    project.brand = { name: 'Srv', cta: { label: 'Try', href: 'https://srv.example' } };
    await writeFile(projectFile, JSON.stringify(project));
    const demoDir = join(init.dir, 'demos', 'getting-started');
    const bytes = Buffer.from('png bytes here');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(join(demoDir, 'assets'), { recursive: true });
    await writeFile(join(demoDir, 'assets', `${sha256}.png`), bytes);
    await writeFile(
      join(demoDir, 'assets.json'),
      JSON.stringify({
        version: 1,
        assets: [{ id: 'shot-1', sha256, kind: 'image', contentType: 'image/png', file: `${sha256}.png`, size: bytes.byteLength }],
      }),
    );

    const result = await runPublish({ cwd: init.dir, silent: true });
    expect(result).toMatchObject({ slug: 'getting-started', id: 'srv123', url: `${base}/p/srv123` });

    const order = requests.map((r) => `${r.method} ${r.url.split('?')[0]}`);
    expect(order).toEqual([
      'POST /api/cli/sync-assets',
      `PUT /upload/${sha256}.png`,
      'POST /api/cli/sync-assets/complete',
      'POST /api/previews',
    ]);

    const sync = requests[0]!;
    expect(sync.headers.authorization).toBe('Bearer idp_test-token');
    expect(JSON.parse(sync.body.toString('utf8'))).toEqual({
      assets: [{ sha256, ext: '.png', contentType: 'image/png', size: bytes.byteLength }],
    });

    const put = requests[1]!;
    expect(put.headers['content-type']).toBe('image/png');
    expect(put.body.equals(bytes)).toBe(true);

    const complete = requests[2]!;
    expect(JSON.parse(complete.body.toString('utf8'))).toEqual({
      assets: [{ sha256, ext: '.png', contentType: 'image/png', size: bytes.byteLength, cdnPath: cdnFor(sha256, '.png') }],
    });

    const publish = requests[3]!;
    expect(publish.headers.authorization).toBe('Bearer idp_test-token');
    const body = JSON.parse(publish.body.toString('utf8'));
    expect(Object.keys(body).sort()).toEqual(['assets', 'config', 'demoSlug', 'hub', 'replace', 'title']);
    expect(body).toMatchObject({
      demoSlug: 'getting-started',
      title: 'Getting Started',
      replace: true,
      hub: { name: 'srv-site', brand: { name: 'Srv', cta: { label: 'Try', href: 'https://srv.example' } } },
    });
    expect(typeof body.hub.runtime).toBe('string');
    expect(body.assets.assets[0]).toMatchObject({
      id: 'shot-1',
      sha256,
      publicUrl: `${base}/cdn/${cdnFor(sha256, '.png')}`,
    });
    expect(body.config.steps.length).toBeGreaterThan(0);
  });

  it('publish drops a project-relative brand logo and warns, keeping the rest of the brand', async () => {
    const init = await runInit({ name: 'srv-site', cwd: workdir, silent: true });
    const projectFile = join(init.dir, 'interactive-demo.json');
    const project = JSON.parse(await readFile(projectFile, 'utf8'));
    await mkdir(join(init.dir, 'brand'), { recursive: true });
    await writeFile(join(init.dir, 'brand', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    project.brand = { logo: 'brand/logo.svg', name: 'Srv', logoHref: 'https://srv.example' };
    await writeFile(projectFile, JSON.stringify(project));

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let warning = '';
    try {
      await runPublish({ cwd: init.dir });
      warning = stderr.mock.calls.map((c) => String(c[0])).join('');
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
    expect(warning).toContain('brand.logo "brand/logo.svg"');
    expect(warning).toContain('does not upload');

    const publish = requests.find((r) => r.url === '/api/previews')!;
    const body = JSON.parse(publish.body.toString('utf8'));
    expect(body.hub.brand).toEqual({ name: 'Srv', logoHref: 'https://srv.example' });
  });

  it('publish passes an absolute brand logo URL through untouched', async () => {
    const init = await runInit({ name: 'srv-site', cwd: workdir, silent: true });
    const projectFile = join(init.dir, 'interactive-demo.json');
    const project = JSON.parse(await readFile(projectFile, 'utf8'));
    project.brand = { logo: 'https://cdn.srv.example/logo.svg', name: 'Srv' };
    await writeFile(projectFile, JSON.stringify(project));

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let stderrCalls = -1;
    try {
      await runPublish({ cwd: init.dir });
      stderrCalls = stderr.mock.calls.length;
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
    expect(stderrCalls).toBe(0);

    const publish = requests.find((r) => r.url === '/api/previews')!;
    const body = JSON.parse(publish.body.toString('utf8'));
    expect(body.hub.brand).toEqual({ logo: 'https://cdn.srv.example/logo.svg', name: 'Srv' });
  });

  it('publish lowercases an uppercase file extension before syncing', async () => {
    const init = await runInit({ name: 'srv-site', cwd: workdir, silent: true });
    const demoDir = join(init.dir, 'demos', 'getting-started');
    const bytes = Buffer.from('png bytes here');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(join(demoDir, 'assets'), { recursive: true });
    await writeFile(join(demoDir, 'assets', 'Shot.PNG'), bytes);
    await writeFile(
      join(demoDir, 'assets.json'),
      JSON.stringify({
        version: 1,
        assets: [{ id: 'shot-1', sha256, kind: 'image', contentType: 'image/png', file: 'Shot.PNG', size: bytes.byteLength }],
      }),
    );

    await runPublish({ cwd: init.dir, silent: true });

    const sync = requests.find((r) => r.url === '/api/cli/sync-assets')!;
    expect(JSON.parse(sync.body.toString('utf8'))).toEqual({
      assets: [{ sha256, ext: '.png', contentType: 'image/png', size: bytes.byteLength }],
    });
    const complete = requests.find((r) => r.url === '/api/cli/sync-assets/complete')!;
    expect(JSON.parse(complete.body.toString('utf8')).assets[0]).toMatchObject({ ext: '.png' });
  });
});
