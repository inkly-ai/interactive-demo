/**
 * Chrome discovery, launch and the minimal Chrome DevTools Protocol client the
 * capture uses. Nothing here knows about steps or sessions.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { resolveArgPath, sleep } from './options.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Prefix of every throwaway profile dir; also what the process reapers match on. */
export const TEMP_PROFILE_PREFIX = 'interactive-demo-capture-';

// Real, installed Google Chrome locations. Headed real Chrome is the least
// bot-detectable controllable browser, so logged-in / Cloudflare-gated product
// captures work. Chrome for Testing (a clean automation build) trips those
// checks, so it is only a fallback.
const REAL_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
];
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;
// Capture at Retina-equivalent pixel density: headless Chrome's native DPR is
// always 1 and captures come out soft. Forcing 2x gives images and video the
// crispness of a real Retina display. Trade-off: ~4x the pixel bytes per frame.
export const CAPTURE_DEVICE_SCALE_FACTOR = 2;
export const DEFAULT_TIMEOUT_MS = 120_000;

interface CdpResponse {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: unknown;
  error?: { message?: string; data?: unknown };
}

export interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  openerId?: string;
}

function findUp(start: string, rel: string): string | null {
  let dir = resolve(start);
  while (true) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function findChromeForTesting(rootDir: string): Promise<string | null> {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.name !== 'Google Chrome for Testing') continue;
      if (absolute.includes('Google Chrome for Testing.app/Contents/MacOS')) {
        return absolute;
      }
    }
  }
  return null;
}

export async function findChrome(cwd: string, explicit: string | undefined): Promise<string> {
  if (explicit) {
    const browser = resolveArgPath(cwd, explicit);
    if (existsSync(browser)) return browser;
    throw new Error(`Chrome binary does not exist: ${browser}`);
  }

  const envBrowser = process.env.CHROME_PATH;
  if (envBrowser && existsSync(envBrowser)) return envBrowser;

  // Prefer real Google Chrome over Chrome for Testing for capture reliability:
  // bot-gated sites (Cloudflare, Google/Notion SSO) block the testing build but
  // pass headed real Chrome. CfT remains a fallback for CI machines without it.
  const realChrome = REAL_CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (realChrome) return realChrome;

  const repoChromeDir = findUp(cwd, 'chrome');
  if (repoChromeDir) {
    const browser = await findChromeForTesting(repoChromeDir);
    if (browser) return browser;
  }

  const moduleChromeDir = findUp(moduleDir, 'chrome');
  if (moduleChromeDir && moduleChromeDir !== repoChromeDir) {
    const browser = await findChromeForTesting(moduleChromeDir);
    if (browser) return browser;
  }

  const candidates = [
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No Chrome binary found. Pass --browser /path/to/chrome or set CHROME_PATH.');
}

export class Cdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  private listeners = new Map<string, Set<(params: unknown, sessionId?: string) => void>>();
  private ready: Promise<void>;

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      maxPayload: 512 * 1024 * 1024,
    });
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.once('open', () => resolveReady());
      this.ws.once('error', (err) => rejectReady(err));
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as CdpResponse;
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!pending) return;
        if (msg.error) {
          pending.reject(
            new Error(`${msg.error.message ?? 'CDP error'}: ${JSON.stringify(msg.error.data ?? '')}`),
          );
        } else {
          pending.resolve((msg.result ?? {}) as Record<string, unknown>);
        }
        return;
      }
      if (!msg.method) return;
      const listeners = this.listeners.get(msg.method);
      if (!listeners) return;
      for (const listener of listeners) listener(msg.params, msg.sessionId);
    });
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.ws.send(JSON.stringify(payload), (err) => {
        if (!err) return;
        this.pending.delete(id);
        rejectSend(err);
      });
    });
  }

  on(method: string, listener: (params: unknown, sessionId?: string) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Best effort.
    }
  }
}

export async function evaluate(
  cdp: Cdp,
  sessionId: string,
  expression: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
      userGesture: true,
    },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  const runtimeResult = result.result as { value?: unknown } | undefined;
  return runtimeResult?.value;
}

export async function attachToTarget(cdp: Cdp, targetId: string): Promise<string> {
  const result = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const sessionId = result.sessionId;
  if (typeof sessionId !== 'string') throw new Error(`Target.attachToTarget returned no sessionId`);
  return sessionId;
}

export async function getPageTargets(cdp: Cdp): Promise<TargetInfo[]> {
  const result = await cdp.send('Target.getTargets', {
    filter: [{ type: 'page' }],
  });
  const targetInfos = (result.targetInfos ?? []) as TargetInfo[];
  return targetInfos.filter((target) => target.type === 'page');
}

/** True if `pid` is still a live process. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Terminate a detached child and its whole process tree. Both Chrome and the
 * capture listener are spawned `detached: true`, which makes each a process-
 * GROUP leader (pgid === pid). A plain `kill(pid)` only signals the leader, so
 * Chrome's helper processes (gpu / renderer / network-service) survive — and if
 * the leader already crashed, the orphaned helpers never get a signal at all.
 * Signal the negative pid to hit the whole group, then escalate to SIGKILL if
 * anything is still alive after a short grace period (headless Chrome sometimes
 * ignores SIGTERM). Sending to both `-pid` and `pid` covers the case where the
 * group-kill is rejected; every call is best-effort.
 */
export async function terminateProcessTree(pid: number): Promise<void> {
  const signal = (target: number, sig: NodeJS.Signals): void => {
    try {
      process.kill(target, sig);
    } catch {
      // Best effort — ESRCH (already gone) / EPERM are expected.
    }
  };
  // Graceful first: the group, then the leader directly.
  signal(-pid, 'SIGTERM');
  signal(pid, 'SIGTERM');
  // Wait briefly for a clean exit, short-circuiting as soon as the leader dies.
  for (let i = 0; i < 8 && pidAlive(pid); i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
  // Final SIGKILL to the group reaps a stubborn leader AND any helper procs
  // orphaned by an earlier crash; a no-op (ESRCH) when the tree already exited.
  signal(-pid, 'SIGKILL');
  signal(pid, 'SIGKILL');
}

/** Only ever match a profile dir that is unmistakably ours. */
function isOwnedProfileDir(profileDir: string | null | undefined): profileDir is string {
  return !!profileDir && profileDir.includes('interactive-demo');
}

async function pidsReferencing(profileDir: string): Promise<number[]> {
  return new Promise<number[]>((resolvePids) => {
    execFile('pgrep', ['-f', '--', profileDir], { timeout: 4000 }, (_err, stdout) => {
      const found = String(stdout || '')
        .split('\n')
        .map((line) => Number(line.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
      resolvePids(found);
    });
  });
}

/**
 * Backstop reaper: SIGKILL any process whose argv still references this session's
 * unique Chrome `--user-data-dir`. `terminateProcessTree` already kills the
 * tracked pid's whole process group, which reaps the browser in the normal case;
 * this catches the rare escapee — a Chrome relaunch that lands in a different
 * process group, or a helper orphaned by a crashed leader — by targeting the one
 * thing that is unmistakably ours: the per-session profile path. Best-effort and
 * POSIX-only (`pgrep`); a no-op where pgrep is absent.
 */
export async function reapByProfileDir(profileDir: string | null | undefined): Promise<void> {
  if (!isOwnedProfileDir(profileDir)) return;
  for (const pid of await pidsReferencing(profileDir)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Best effort — already gone.
    }
  }
}

/**
 * GRACEFULLY evict any live Chrome still holding a persistent profile dir, so the
 * next `capture start --profile <name>` can take it over without the user having
 * to close the window first. The common case is the no-CDP sign-in window left
 * by `capture login`: we SIGTERM it (NOT SIGKILL) so Chrome flushes its just-set
 * session cookies to disk and releases SingletonLock cleanly, wait for it to
 * die, then fall back to `reapByProfileDir`'s SIGKILL for any stubborn
 * straggler. A no-op when nothing holds the profile. Returns the pids evicted.
 */
export async function evictChromeOnProfile(profileDir: string | null | undefined): Promise<number[]> {
  if (!isOwnedProfileDir(profileDir)) return [];
  const pids = await pidsReferencing(profileDir);
  if (pids.length === 0) return [];
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Best effort — already gone.
    }
  }
  // Give Chrome up to ~2s to flush cookies and exit on its own.
  for (let i = 0; i < 20 && pids.some((pid) => pidAlive(pid)); i += 1) {
    await sleep(100);
  }
  // SIGKILL backstop for anything that ignored SIGTERM, then a short settle so the
  // cookie store is fully on disk before the capture Chrome reopens the profile.
  await reapByProfileDir(profileDir);
  await sleep(300);
  return pids;
}

/**
 * Ask Chrome to shut itself down over CDP (`Browser.close`). This is the most
 * reliable reap: Chrome tears down its OWN gpu/renderer/network helper processes,
 * which a pgid/pgrep kill can miss when the leader has already died under memory
 * pressure and the helpers were reparented in their own groups. Best-effort and
 * time-bounded — a dead/unreachable browser rejects immediately.
 */
export async function closeBrowserGracefully(wsUrl: string | null | undefined): Promise<void> {
  if (!wsUrl) return;
  let cdp: Cdp | null = null;
  try {
    cdp = new Cdp(wsUrl);
    await Promise.race([
      cdp.send('Browser.close'),
      new Promise((_r, reject) => setTimeout(() => reject(new Error('Browser.close timed out')), 2_000)),
    ]);
  } catch {
    // Browser already gone / unreachable — the process-tree reap handles it.
  } finally {
    cdp?.close();
  }
}

/** Stale lock/port files a reused profile may carry from a killed Chrome. */
export async function clearStaleProfileLocks(profileDir: string): Promise<void> {
  for (const stale of ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    await rm(join(profileDir, stale), { force: true }).catch(() => undefined);
  }
}

export async function launchChrome(args: {
  browser: string;
  width: number;
  height: number;
  headless: boolean;
  timeoutMs: number;
  // When set, Chrome launches against this persistent profile dir instead of a
  // throwaway temp one, so logins/cookies survive across captures. Reused as-is
  // on later runs (mock keychain keeps cookie encryption consistent run-to-run).
  userDataDir?: string | null;
}): Promise<{
  pid: number | null;
  profileDir: string;
  wsUrl: string;
  debuggingUrl: string;
  logPath: string;
}> {
  const profileDir = args.userDataDir
    ? (await mkdir(args.userDataDir, { recursive: true }), args.userDataDir)
    : await mkdtemp(join(tmpdir(), TEMP_PROFILE_PREFIX));
  const logPath = join(profileDir, 'chrome.log');
  const log = await open(logPath, 'a');
  const flags = [
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${args.width},${args.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-features=Translate,AutofillServerCommunication',
    '--use-mock-keychain',
    '--hide-scrollbars',
    // A reused profile that was killed (not cleanly quit) otherwise shows a
    // "restore pages?" bubble over the page; suppress it.
    '--hide-crash-restore-bubble',
  ];
  // For a PERSISTENT profile, turn on Chrome's "continue where you left off"
  // path: it sets restore_old_session_cookies, so SESSION cookies (no expiry —
  // the common OAuth/SSO login cookie) that the sign-in window persisted are
  // loaded back into the jar instead of dropped. Capture opens its own CDP
  // target (openTargetPage), so the tab session-restore reopens is just an idle
  // extra and never the page we capture. Omitted for throwaway temp profiles.
  if (args.userDataDir) flags.push('--restore-last-session');
  if (args.headless) flags.unshift('--headless=new');

  // A persistent profile may still be held by a live Chrome — typically the
  // no-CDP sign-in window from `capture login`. Gracefully evict it (SIGTERM so
  // its cookies flush) before we take the profile.
  if (args.userDataDir) await evictChromeOnProfile(profileDir);

  // A reused profile carries a stale DevToolsActivePort (the previous run's
  // port) and Singleton lock files; remove them so we wait for THIS Chrome's
  // fresh port and Chrome does not treat the profile as still in use.
  await clearStaleProfileLocks(profileDir);

  const proc = spawn(args.browser, flags, {
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  proc.unref();
  await log.close();

  const activePortPath = join(profileDir, 'DevToolsActivePort');
  const started = Date.now();
  let exitCode: number | null | undefined;
  proc.once('exit', (code) => {
    exitCode = code;
  });

  // A launch failure here happens BEFORE `start`'s try/catch harness is in scope,
  // so without this guard a Chrome that spawned helpers then failed to publish its
  // DevTools port would leak its process tree AND its temp profile dir. Reap both
  // before rethrowing; surface the chrome.log tail so the failure is diagnosable.
  const isTempProfile = !args.userDataDir;
  const failLaunch = async (message: string): Promise<never> => {
    const tail = await readFile(logPath, 'utf8')
      .then((raw) => raw.split('\n').filter(Boolean).slice(-10).join('\n'))
      .catch(() => '');
    if (proc.pid) await terminateProcessTree(proc.pid).catch(() => undefined);
    await reapByProfileDir(profileDir).catch(() => undefined);
    if (isTempProfile) {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
        () => undefined,
      );
    }
    throw new Error(`${message} Chrome log (${logPath}):\n${tail || '(empty — Chrome wrote nothing)'}`);
  };

  while (Date.now() - started < 20_000) {
    if (exitCode !== undefined) {
      return failLaunch('Chrome exited before DevTools was ready.');
    }
    const raw = await readFile(activePortPath, 'utf8').catch(() => null);
    if (raw) {
      const lines = raw.trim().split(/\r?\n/);
      const port = lines[0];
      const browserPath = lines[1];
      if (port && browserPath) {
        return {
          pid: proc.pid ?? null,
          profileDir,
          wsUrl: `ws://127.0.0.1:${port}${browserPath}`,
          debuggingUrl: `http://127.0.0.1:${port}`,
          logPath,
        };
      }
    }
    await sleep(100);
  }
  return failLaunch('Timed out waiting for Chrome DevTools.');
}

export async function resolveBrowserWebSocketUrl(connectToBrowser: string): Promise<{
  wsUrl: string;
  debuggingUrl: string;
}> {
  if (connectToBrowser.startsWith('ws://') || connectToBrowser.startsWith('wss://')) {
    const url = new URL(connectToBrowser);
    return {
      wsUrl: connectToBrowser,
      debuggingUrl: `${url.protocol === 'wss:' ? 'https' : 'http'}://${url.host}`,
    };
  }

  const base = new URL(connectToBrowser);
  const response = await fetch(new URL('/json/version', base));
  if (!response.ok) {
    throw new Error(`could not read Chrome DevTools metadata from ${base.toString()}: ${response.status}`);
  }
  const metadata = (await response.json()) as { webSocketDebuggerUrl?: unknown };
  if (typeof metadata.webSocketDebuggerUrl !== 'string') {
    throw new Error(`Chrome DevTools metadata did not include webSocketDebuggerUrl`);
  }
  return {
    wsUrl: metadata.webSocketDebuggerUrl,
    debuggingUrl: `${base.protocol}//${base.host}`,
  };
}

export async function measureTargetViewport(
  cdp: Cdp,
  sessionId: string,
): Promise<{
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
}> {
  const raw = await evaluate(
    cdp,
    sessionId,
    `JSON.stringify({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    })`,
    5_000,
  );
  const parsed = JSON.parse(String(raw)) as {
    innerWidth?: unknown;
    innerHeight?: unknown;
    outerWidth?: unknown;
    outerHeight?: unknown;
  };
  const metrics = {
    innerWidth: Number(parsed.innerWidth),
    innerHeight: Number(parsed.innerHeight),
    outerWidth: Number(parsed.outerWidth),
    outerHeight: Number(parsed.outerHeight),
  };
  if (
    !Number.isFinite(metrics.innerWidth) ||
    !Number.isFinite(metrics.innerHeight) ||
    !Number.isFinite(metrics.outerWidth) ||
    !Number.isFinite(metrics.outerHeight)
  ) {
    throw new Error(`could not measure Chrome viewport: ${JSON.stringify(parsed)}`);
  }
  return metrics;
}

export async function resizeTargetContentViewport(
  cdp: Cdp,
  sessionId: string,
  targetId: string,
  width: number,
  height: number,
): Promise<void> {
  try {
    const windowResult = await cdp.send('Browser.getWindowForTarget', { targetId });
    const windowId = windowResult.windowId;
    if (typeof windowId !== 'number') throw new Error('Browser.getWindowForTarget returned no windowId');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await measureTargetViewport(cdp, sessionId);
      const widthDelta = Math.max(0, current.outerWidth - current.innerWidth);
      const heightDelta = Math.max(0, current.outerHeight - current.innerHeight);
      const nextOuterWidth = width + widthDelta;
      const nextOuterHeight = height + heightDelta;

      if (
        Math.abs(current.innerWidth - width) <= 1 &&
        Math.abs(current.innerHeight - height) <= 1
      ) {
        return;
      }

      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: {
          windowState: 'normal',
          width: nextOuterWidth,
          height: nextOuterHeight,
        },
      });
      await sleep(250);
    }
  } catch {
    // Browser window bounds are unavailable in some attached/headless cases.
  }
  await cdp
    .send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height,
        deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
        mobile: false,
      },
      sessionId,
    )
    .catch(() => undefined);
  await sleep(100);
}

export async function openTargetPage(
  cdp: Cdp,
  url: string,
  width: number,
  height: number,
  timeoutMs: number,
): Promise<{ targetId: string; sessionId: string }> {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const targetId = created.targetId;
  if (typeof targetId !== 'string') throw new Error('Target.createTarget returned no targetId');
  const sessionId = await attachToTarget(cdp, targetId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await resizeTargetContentViewport(cdp, sessionId, targetId, width, height);

  let loaded = false;
  const offLoad = cdp.on('Page.loadEventFired', (_params, sid) => {
    if (sid === sessionId) loaded = true;
  });
  await cdp.send('Page.navigate', { url }, sessionId);
  const started = Date.now();
  while (!loaded && Date.now() - started < timeoutMs) await sleep(100);
  offLoad();
  await sleep(1_000);
  return { targetId, sessionId };
}
