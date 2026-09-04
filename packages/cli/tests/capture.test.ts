import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { AssetsManifestSchema, DemoSchema } from '@inkly-org/interactive-demo/schema';
import { buildImageStep, cleanClickLabel, nextCaptureAssetId, screenIdFromIndex } from '../src/capture/build';
import { profileNameFromUrl, resolveProfileDir, sanitizeProfileName } from '../src/capture/profiles';
import {
  RECORDER_CLICK_BINDING,
  RECORDER_EVENT_BINDING,
  RECORDER_SCRIPT,
  parseRecorderPayload,
} from '../src/capture/recorder';
import {
  labelFor,
  listSessionStates,
  liveScreens,
  readDroppedKeys,
  readSessionState,
  removeSessionState,
  screenKey,
  sessionPath,
  writeDroppedKeys,
  writeListenerMeta,
  writeSession,
  type CaptureSession,
  type CapturedScreen,
} from '../src/capture/session';
import { readPngSize, selectPreClickFrame, trimToMotionBurst } from '../src/capture/steps';
import { assembleCapturedDemo, slugifyName, uniqueDemoSlug, writeDemoFolder } from '../src/capture/output';
import { dispatchCapture } from '../src/capture/index';
import { main } from '../src/main';

/** A 2x3 PNG (valid header + IHDR) — enough for readPngSize and file plumbing. */
function tinyPng(width = 2, height = 3): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([header, ihdr]);
}

describe('capture profiles', () => {
  it('derives a reusable profile name from a login URL host', () => {
    expect(profileNameFromUrl('https://app.example.com/login')).toBe('app-example-com');
    expect(profileNameFromUrl('https://www.example.com/sign-in')).toBe('example-com');
    expect(profileNameFromUrl('http://localhost:3000/login')).toBe('localhost-3000');
  });

  it('rejects invalid URLs when deriving a profile name', () => {
    expect(() => profileNameFromUrl('not-a-url')).toThrow();
  });

  it('sanitizes names and resolves bare names under the capture home', () => {
    expect(sanitizeProfileName('Acme Corp!')).toBe('acme-corp');
    expect(sanitizeProfileName('---')).toBe('default');
    process.env.INTERACTIVE_DEMO_CAPTURE_HOME = '/tmp/capture-home';
    expect(resolveProfileDir('/work', 'acme')).toBe('/tmp/capture-home/profiles/acme');
    expect(resolveProfileDir('/work', './my-profile')).toBe('/work/my-profile');
    delete process.env.INTERACTIVE_DEMO_CAPTURE_HOME;
  });
});

describe('step builder', () => {
  it('cleans ARIA-role prefixes and keeps only the first short line of a label', () => {
    expect(cleanClickLabel('button: Sign up')).toBe('Sign up');
    expect(cleanClickLabel('Title\nA long description')).toBe('Title');
    expect(cleanClickLabel(null)).toBe('');
    expect(cleanClickLabel('x'.repeat(80))).toHaveLength(48);
  });

  it('numbers capture asset ids and screen ids', () => {
    expect(nextCaptureAssetId([])).toBe('cap-001');
    expect(nextCaptureAssetId([{ id: 'cap-007' }, { id: 'other' }])).toBe('cap-008');
    expect(screenIdFromIndex(0)).toBe('0001');
  });

  it('builds an image step with a cursor annotation and a click zoom', () => {
    const step = buildImageStep({
      stepId: 's1',
      kind: 'image',
      assetId: 'cap-001',
      naturalWidth: 1440,
      naturalHeight: 900,
      click: { x: 0.5, y: 0.5, label: 'Settings' },
      autoApplyZoom: true,
      isLast: false,
    });
    expect(step.kind).toBe('content');
    if (step.kind !== 'content') return;
    expect(step.background).toMatchObject({ type: 'image', src: 'asset:cap-001' });
    expect(step.annotations[0]).toMatchObject({ variant: 'cursor', text: 'Click on "Settings"', x: 0.5, y: 0.5 });
    expect(step.transform).toEqual({ zoom: 1.35, x: 0.5, y: 0.5 });
  });

  it('skips the zoom for a (0,0) click and gives the last click-less step a closing callout', () => {
    const zero = buildImageStep({
      stepId: 's1',
      kind: 'image',
      assetId: 'cap-001',
      naturalWidth: 10,
      naturalHeight: 10,
      click: { x: 0, y: 0 },
      autoApplyZoom: true,
      isLast: false,
    });
    expect(zero.kind === 'content' && zero.transform).toBeUndefined();
    const last = buildImageStep({
      stepId: 's2',
      kind: 'video',
      assetId: 'cap-002',
      posterAssetId: 'cap-003',
      naturalWidth: 10,
      naturalHeight: 10,
      click: null,
      isLast: true,
    });
    expect(last.kind === 'content' && last.background).toMatchObject({
      type: 'video',
      src: 'asset:cap-002',
      posterSrc: 'asset:cap-003',
    });
    expect(last.kind === 'content' && last.annotations[0]).toMatchObject({
      variant: 'callout',
      text: 'End of walkthrough',
    });
  });
});

describe('in-page recorder', () => {
  it('is valid JavaScript that names both bindings', () => {
    expect(() => new Function(RECORDER_SCRIPT)).not.toThrow();
    expect(RECORDER_SCRIPT).toContain(RECORDER_EVENT_BINDING);
    expect(RECORDER_SCRIPT).toContain(RECORDER_CLICK_BINDING);
    expect(RECORDER_SCRIPT).not.toContain('inkly');
  });

  it('selectorFor prefers an id, else a short tag.class path', () => {
    const source = /function selectorFor\(el\) \{[\s\S]*?\n {2}\}/.exec(RECORDER_SCRIPT)?.[0];
    expect(source).toBeTruthy();
    const context = vm.createContext({ CSS: { escape: (s: string) => s } });
    const selectorFor = vm.runInContext(`(${source})`, context) as (el: unknown) => string;
    const el = (tag: string, cls: string[], parent: unknown, id = ''): unknown => ({
      tagName: tag.toUpperCase(),
      id,
      nodeType: 1,
      classList: cls,
      parentElement: parent,
    });
    const root = el('body', [], null);
    const nav = el('nav', ['top', 'a', 'b'], root);
    const button = el('button', ['primary'], nav);
    expect(selectorFor(el('div', [], null, 'main'))).toBe('#main');
    expect(selectorFor(button)).toBe('body > nav.top.a > button.primary');
    expect(selectorFor(null)).toBe('');
  });

  it('parses event payloads from either binding and rejects garbage', () => {
    const click = { x: 0.2, y: 0.4, label: 'Go' };
    const page = { url: 'https://a.test/', title: 'A', viewport: { width: 10, height: 10 }, scroll: { x: 0, y: 0, maxX: 0, maxY: 0 } };
    expect(parseRecorderPayload(RECORDER_EVENT_BINDING, JSON.stringify({ type: 'click', click, page }))).toEqual({
      type: 'click',
      click,
      page,
    });
    expect(parseRecorderPayload(RECORDER_EVENT_BINDING, JSON.stringify({ type: 'scroll', click: null, page }))?.type).toBe('scroll');
    expect(parseRecorderPayload(RECORDER_CLICK_BINDING, JSON.stringify(click))).toEqual({ type: 'click', click, page: null });
    expect(parseRecorderPayload('other', JSON.stringify(click))).toBeNull();
    expect(parseRecorderPayload(RECORDER_EVENT_BINDING, '{not json')).toBeNull();
    expect(parseRecorderPayload(RECORDER_EVENT_BINDING, 42)).toBeNull();
  });
});

describe('video frame selection', () => {
  const frame = (t: number, data = `f${t}`) => ({ data, receivedAt: t });

  it('picks the newest frame received before the click', () => {
    const frames = [frame(100), frame(200), frame(300)];
    expect(selectPreClickFrame(frames, 250)).toBe('f200');
    expect(selectPreClickFrame(frames, null)).toBe('f300');
    expect(selectPreClickFrame(frames, 50)).toBe('f100');
    expect(selectPreClickFrame([], 50)).toBeNull();
  });

  it('keeps the longest dense burst, ties going to the later run', () => {
    const scroll = [0, 120, 240, 360, 480, 600].map((t) => frame(t));
    const settle = [5000, 5100].map((t) => frame(t));
    expect(trimToMotionBurst([...scroll, ...settle]).map((f) => f.receivedAt)).toEqual([0, 120, 240, 360, 480, 600]);
    const a = [0, 100, 200].map((t) => frame(t));
    const b = [1000, 1100, 1200].map((t) => frame(t));
    expect(trimToMotionBurst([...a, ...b])[0]?.receivedAt).toBe(1000);
    expect(trimToMotionBurst([frame(1)])).toHaveLength(1);
  });

  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(readPngSize(new Uint8Array(tinyPng(640, 480)))).toEqual({ width: 640, height: 480 });
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('session state', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'interactive-demo-capture-test-'));
    process.env.INTERACTIVE_DEMO_CAPTURE_HOME = home;
  });

  afterEach(async () => {
    delete process.env.INTERACTIVE_DEMO_CAPTURE_HOME;
    await rm(home, { recursive: true, force: true });
  });

  const session = (id: string): CaptureSession => ({
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    url: 'https://a.test/',
    name: 'A',
    chromePid: null,
    profileDir: null,
    keepProfile: false,
    browserWsUrl: 'ws://127.0.0.1:1/x',
    browserDebuggingUrl: 'http://127.0.0.1:1',
    chromeLogPath: null,
    attached: true,
    tabUrl: 'https://a.test/',
    targetId: 't1',
    width: 1440,
    height: 900,
    screens: [],
  });

  it('round-trips a session, lists it without sidecars, and removes everything', async () => {
    await writeSession(session('s-1'));
    await writeListenerMeta('s-1', { listenerPid: 123, listenerLogPath: null });
    await writeDroppedKeys('s-1', ['k']);
    expect(sessionPath('s-1')).toBe(join(home, 'sessions', 's-1.json'));
    expect((await readSessionState('s-1')).name).toBe('A');
    expect((await listSessionStates()).map((s) => s.id)).toEqual(['s-1']);
    expect(await readDroppedKeys('s-1')).toEqual(['k']);
    await removeSessionState('s-1');
    expect(await listSessionStates()).toEqual([]);
    expect(await readDroppedKeys('s-1')).toEqual([]);
  });

  it('rejects unsafe session ids', () => {
    expect(() => sessionPath('../x')).toThrow(/invalid session id/);
  });

  it('undo filters screens by their stable key', () => {
    const screens: CapturedScreen[] = [
      { pngPath: '/a.png', viewport: { width: 1, height: 1 }, naturalSize: { width: 1, height: 1 }, sourceUrl: '', title: 'One', click: null, capturedAt: 't1' },
      { videoPath: '/b.webm', viewport: { width: 1, height: 1 }, naturalSize: { width: 1, height: 1 }, sourceUrl: '', title: '', click: { x: 0, y: 0, label: 'Two' }, capturedAt: 't2' },
    ];
    expect(screenKey(screens[1]!)).toBe('/b.webm');
    expect(liveScreens(screens, ['/b.webm']).map((s) => labelFor(s, 0))).toEqual(['One']);
    expect(labelFor(screens[1]!, 1)).toBe('Two');
    expect(labelFor({ ...screens[0]!, title: '' }, 4)).toBe('Step 5');
  });

  it('resolves the only running session for stop/status and fails clearly otherwise', async () => {
    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await expect(dispatchCapture({ cwd: home, subcommand: 'status', args: { _: [] } })).rejects.toThrow(
        /No capture session is running/,
      );
      await writeSession(session('only'));
      expect(await dispatchCapture({ cwd: home, subcommand: 'status', args: { _: [] } })).toBe(0);
      expect(JSON.parse(out.join(''))).toMatchObject({ ok: true, session: { id: 'only' }, capture: { stepCount: 0 } });
      await writeSession(session('second'));
      await expect(dispatchCapture({ cwd: home, subcommand: 'status', args: { _: [] } })).rejects.toThrow(
        /2 capture sessions are running/,
      );
      out.length = 0;
      expect(await dispatchCapture({ cwd: home, subcommand: undefined, args: { _: [] } })).toBe(1);
      expect(out.join('')).toContain('capture start <url>');
    } finally {
      process.stdout.write = write;
    }
  });
});

describe('demo assembly', () => {
  let work: string;

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'interactive-demo-capture-out-'));
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('slugifies names and finds a free folder', async () => {
    expect(slugifyName('Acme "Onboarding" Tour!')).toBe('acme-onboarding-tour');
    expect(slugifyName('')).toBe('captured-demo');
    expect(await uniqueDemoSlug(work, 'Acme')).toBe('acme');
    await mkdir(join(work, 'acme'));
    expect(await uniqueDemoSlug(work, 'Acme')).toBe('acme-2');
  });

  it('writes a schema-valid demo folder from recorded image and video screens', async () => {
    const png = tinyPng(1440, 900);
    const shot1 = join(work, 'screen-001.png');
    const poster = join(work, 'poster.png');
    const clip = join(work, 'video-002.webm');
    await writeFile(shot1, png);
    await writeFile(poster, png);
    await writeFile(clip, Buffer.from('not-really-webm'));
    const screens: CapturedScreen[] = [
      {
        kind: 'image',
        pngPath: shot1,
        viewport: { width: 1440, height: 900 },
        naturalSize: { width: 1440, height: 900 },
        sourceUrl: 'https://a.test/',
        title: 'Home',
        click: { x: 0.3, y: 0.6, label: 'Pricing' },
        capturedAt: 't1',
      },
      {
        kind: 'video',
        pngPath: poster,
        videoPath: clip,
        posterPngPath: poster,
        viewport: { width: 1440, height: 900 },
        naturalSize: { width: 1440, height: 900 },
        sourceUrl: 'https://a.test/pricing',
        title: 'Pricing',
        click: null,
        capturedAt: 't2',
      },
    ];
    const built = await assembleCapturedDemo({ name: 'Acme tour', screens });
    expect(built.stepCount).toBe(2);
    expect(built.labels).toEqual(['Pricing', 'Pricing']);
    expect(Object.keys(built.files).sort()).toEqual(['screen-001.png', 'screen-002-poster.png', 'screen-002.webm']);
    expect(built.manifest.assets.map((a) => [a.id, a.kind, a.file])).toEqual([
      ['cap-001', 'image', 'screen-001.png'],
      ['cap-002', 'video', 'screen-002.webm'],
      ['cap-003', 'image', 'screen-002-poster.png'],
    ]);

    const demoDir = join(work, 'demos', 'acme-tour');
    await writeDemoFolder(demoDir, built);
    const config = JSON.parse(await readFile(join(demoDir, 'demo.config.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(demoDir, 'assets.json'), 'utf8'));
    expect(DemoSchema.safeParse(config).success).toBe(true);
    expect(AssetsManifestSchema.safeParse(manifest).success).toBe(true);
    expect(config.title).toBe('Acme tour');
    expect(config.steps.map((s: { background: { src: string } }) => s.background.src)).toEqual([
      'asset:cap-001',
      'asset:cap-002',
    ]);
    for (const file of ['screen-001.png', 'screen-002.webm', 'screen-002-poster.png']) {
      expect((await stat(join(demoDir, 'assets', file))).isFile()).toBe(true);
    }
  });

  it('refuses to assemble with no screens', async () => {
    await expect(assembleCapturedDemo({ name: 'x', screens: [] })).rejects.toThrow(/No screens captured/);
  });
});

describe('capture help', () => {
  it('is reachable from the top-level help and via --help', async () => {
    const out: string[] = [];
    const io = { stdout: (t: string) => out.push(t), stderr: () => undefined, cwd: '/' };
    expect(await main(['help', 'capture'], io)).toBe(0);
    expect(out.join('')).toContain('capture start <url>');
    expect(out.join('')).toContain('capture login <url>');
    out.length = 0;
    expect(await main(['capture', '--help'], io)).toBe(0);
    expect(out.join('')).toContain('--no-video');
    out.length = 0;
    expect(await main(['help'], io)).toBe(0);
    expect(out.join('')).toContain('capture    Record a click-through');
  });
});
