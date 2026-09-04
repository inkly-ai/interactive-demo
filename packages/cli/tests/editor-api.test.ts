import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDemoId } from '@inkly-org/interactive-demo/schema';
import { runDev, type DevHandle } from '../src/commands/dev';
import { PROJECT_FILE } from '../src/project';

function minimalDemoConfig(title: string): unknown {
  return {
    id: generateDemoId(),
    version: 1,
    title,
    steps: [
      {
        id: 's1',
        kind: 'content',
        background: { type: 'image', src: 'https://example.com/screen.png', naturalWidth: 1440, naturalHeight: 900 },
      },
    ],
  };
}

describe('dev server editor API', () => {
  let root: string;
  let handle: DevHandle | null = null;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'interactive-demo-editor-api-'));
    await writeFile(join(root, PROJECT_FILE), JSON.stringify({ name: 'P' }), 'utf8');
    await mkdir(join(root, 'demos', 'tour', 'assets'), { recursive: true });
    await writeFile(join(root, 'demos', 'tour', 'demo.config.json'), JSON.stringify(minimalDemoConfig('Tour'), null, 2), 'utf8');
    await writeFile(join(root, 'demos', 'tour', 'assets', 'shot.png'), 'png', 'utf8');
    handle = await runDev({ cwd: root, port: 0, silent: true });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('lists text files and binary paths for a demo', async () => {
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/files`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Record<string, string>; binary: string[] };
    expect(Object.keys(body.files)).toEqual(['demo.config.json']);
    expect(JSON.parse(body.files['demo.config.json']!).title).toBe('Tour');
    expect(body.binary).toEqual(['assets/shot.png']);
  });

  it('writes files, deletes files and refreshes the served state', async () => {
    const edited = { ...(minimalDemoConfig('Edited') as object) };
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/files`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'demo.config.json': JSON.stringify(edited) }, delete: ['assets/shot.png'] }),
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(await readFile(join(root, 'demos', 'tour', 'demo.config.json'), 'utf8')).title).toBe('Edited');

    let served = 'Tour';
    for (let i = 0; i < 60; i += 1) {
      const r = await fetch(`${handle!.url}__demo/demo/tour`);
      served = ((await r.json()) as { demo: { title: string } }).demo.title;
      if (served === 'Edited') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(served).toBe('Edited');

    const listing = (await (await fetch(`${handle!.url}__demo/editor/demos/tour/files`)).json()) as { binary: string[] };
    expect(listing.binary).toEqual([]);
  });

  it('uploads an asset by name', async () => {
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=new.png`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('bytes'),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, file: 'new.png' });
    expect(await readFile(join(root, 'demos', 'tour', 'assets', 'new.png'), 'utf8')).toBe('bytes');
    const served = await fetch(`${handle!.url}tour/assets/new.png`);
    expect(served.status).toBe(200);
  });

  it('rejects unsafe names, escaping paths and unknown demos', async () => {
    const badName = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=../x.png`, { method: 'POST', body: 'x' });
    expect(badName.status).toBe(400);
    const escape = await fetch(`${handle!.url}__demo/editor/demos/tour/files`, {
      method: 'PUT',
      body: JSON.stringify({ files: { '../outside.txt': 'x' } }),
    });
    expect(escape.status).toBe(400);
    const unknown = await fetch(`${handle!.url}__demo/editor/demos/nope/files`);
    expect(unknown.status).toBe(404);
  });

  it('lists assets with a URL the dev server serves', async () => {
    await writeFile(
      join(root, 'demos', 'tour', 'assets.json'),
      JSON.stringify({
        version: 1,
        assets: [
          { id: 'shot-1', file: 'shot.png', path: 'assets/shot.png', sha256: 'a'.repeat(64), kind: 'image' },
        ],
      }),
      'utf8',
    );
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/assets`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assets: Array<Record<string, unknown>> };
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0]).toMatchObject({
      id: 'shot-1',
      path: 'assets/shot.png',
      uri: 'asset:shot-1',
      publicUrl: '/tour/assets/shot.png',
      contentType: 'image/png',
    });
    const served = await fetch(`${handle!.url}tour/assets/shot.png`);
    expect(served.status).toBe(200);
  });

  it('uploads an asset, registers it in assets.json and serves it', async () => {
    const bytes = Buffer.from('fake-png-bytes');
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=hero.png&kind=image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; asset: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.asset).toMatchObject({
      file: 'hero.png',
      path: 'assets/hero.png',
      kind: 'image',
      contentType: 'image/png',
      size: bytes.byteLength,
      publicUrl: '/tour/assets/hero.png',
    });
    expect(String(body.asset.id)).toMatch(/^hero-[0-9a-f]{16}-[a-z0-9]{6}$/);
    expect(body.asset.uri).toBe(`asset:${body.asset.id}`);

    const manifest = JSON.parse(await readFile(join(root, 'demos', 'tour', 'assets.json'), 'utf8')) as {
      version: number;
      assets: Array<{ id: string; file: string; sha256: string }>;
    };
    expect(manifest.version).toBe(1);
    expect(manifest.assets.map((a) => a.file)).toEqual(['hero.png']);
    expect(manifest.assets[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);

    const served = await fetch(`${handle!.url}tour/assets/hero.png`);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe('fake-png-bytes');

    // Re-uploading the same name replaces the bytes and keeps one entry.
    const again = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=hero.png`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: Buffer.from('v2'),
    });
    expect(again.status).toBe(200);
    const manifest2 = JSON.parse(await readFile(join(root, 'demos', 'tour', 'assets.json'), 'utf8')) as {
      assets: Array<{ id: string; file: string }>;
    };
    expect(manifest2.assets).toHaveLength(1);
    expect(manifest2.assets[0]!.id).toBe(body.asset.id);
  });

  it('rejects unsafe asset names', async () => {
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=..%2Fevil.png`, {
      method: 'POST',
      body: Buffer.from('x'),
    });
    expect(res.status).toBe(400);
  });

  it('deletes an asset and its manifest entry', async () => {
    await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=gone.png`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: Buffer.from('bye'),
    });
    const res = await fetch(`${handle!.url}__demo/editor/demos/tour/assets?name=gone.png`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const manifest = JSON.parse(await readFile(join(root, 'demos', 'tour', 'assets.json'), 'utf8')) as {
      assets: unknown[];
    };
    expect(manifest.assets).toEqual([]);
    const served = await fetch(`${handle!.url}tour/assets/gone.png`);
    expect(served.status).toBe(404);
  });

  it('serves the local editor app under /__demo/editor/ when it is built', async () => {
    const res = await fetch(`${handle!.url}__demo/editor/`);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('<div id="root">');
      // Any deep link falls back to the app shell so hash routing can take over.
      const deep = await fetch(`${handle!.url}__demo/editor/anything/here`);
      expect(deep.status).toBe(200);
      expect(await deep.text()).toBe(html);
    }
  });
});
