/**
 * On-disk session state for a running capture, the detached listener that
 * records steps into it, and the process cleanup that ends a session.
 *
 * The detached listener is the SINGLE writer of the session JSON once it is
 * spawned. The foreground commands (`start`, `undo`, `status`, `stop`) only
 * read it, and write through separate sidecar files, so a recorded step can
 * never be clobbered by a stale foreground overwrite.
 */
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaptureClick } from '@inkly-org/interactive-demo/schema';
import { atomicWriteFile } from '../fs-atomic.js';

import { closeBrowserGracefully, reapByProfileDir, terminateProcessTree } from './chrome.js';
import { sleep } from './options.js';
import { captureHome } from './profiles.js';
import type { PageScroll } from './recorder.js';

export interface CapturedScreen {
  kind?: 'image' | 'video';
  pngPath?: string | null;
  videoPath?: string | null;
  posterPngPath?: string | null;
  viewport: { width: number; height: number };
  naturalSize: { width: number; height: number };
  sourceUrl: string;
  title: string;
  click: CaptureClick | null;
  scroll?: PageScroll | null;
  capturedAt: string;
}

export interface CaptureSession {
  id: string;
  createdAt: string;
  url: string;
  name: string;
  chromePid: number | null;
  profileDir: string | null;
  keepProfile: boolean;
  browserWsUrl: string;
  browserDebuggingUrl: string;
  chromeLogPath: string | null;
  attached: boolean;
  tabUrl: string;
  targetId: string;
  width: number;
  height: number;
  screens?: CapturedScreen[];
  recordVideo?: boolean;
  // Headless Chrome's screencast is starved (~2-3 fps), too few frames for a
  // video step; the listener plays headless clips at a higher fps to compensate.
  headless?: boolean;
  autoApplyZoom?: boolean;
  compressImages?: boolean;
  captureDir?: string | null;
  listenerPid?: number | null;
  listenerLogPath?: string | null;
  listenerReadyAt?: string | null;
}

export function sessionsDir(): string {
  return join(captureHome(), 'sessions');
}

export function captureDataDir(sessionId: string): string {
  return join(captureHome(), 'captures', sessionId);
}

export function sessionPath(sessionId: string): string {
  if (!/^[a-zA-Z0-9._:-]+$/.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`);
  }
  return join(sessionsDir(), `${sessionId}.json`);
}

// Listener process metadata (pid + log path) lives in a sidecar file owned by
// the foreground `start`, NOT in the session JSON.
export interface ListenerMeta {
  listenerPid: number | null;
  listenerLogPath: string | null;
}

function listenerMetaPath(sessionId: string): string {
  return join(sessionsDir(), `${sessionId}.listener.json`);
}

export async function writeListenerMeta(sessionId: string, meta: ListenerMeta): Promise<void> {
  await atomicWriteFile(listenerMetaPath(sessionId), `${JSON.stringify(meta, null, 2)}\n`);
}

export async function readListenerMeta(sessionId: string): Promise<ListenerMeta | null> {
  try {
    const raw = await readFile(listenerMetaPath(sessionId), 'utf8');
    return JSON.parse(raw) as ListenerMeta;
  } catch {
    return null;
  }
}

export async function writeSession(state: CaptureSession): Promise<void> {
  await atomicWriteFile(sessionPath(state.id), `${JSON.stringify(state, null, 2)}\n`);
}

/** A session file exists but is not readable JSON (a crashed writer, a full disk). */
export class CorruptSessionError extends Error {
  constructor(
    readonly sessionId: string,
    readonly path: string,
    cause: string,
  ) {
    super(`Capture session file ${path} is not valid JSON (${cause}). Run \`capture cancel --session ${sessionId}\` to clean it up.`);
    this.name = 'CorruptSessionError';
  }
}

export async function readSessionState(sessionId: string): Promise<CaptureSession> {
  const path = sessionPath(sessionId);
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw) as CaptureSession;
  } catch (err) {
    throw new CorruptSessionError(sessionId, path, (err as Error).message);
  }
}

export async function removeSessionState(sessionId: string): Promise<void> {
  await rm(sessionPath(sessionId), { force: true });
  await rm(listenerMetaPath(sessionId), { force: true });
  await rm(undoSidecarPath(sessionId), { force: true }).catch(() => undefined);
}

export interface SessionListing {
  id: string;
  state: CaptureSession | null;
  /** Set when the session file exists but could not be parsed. */
  error: string | null;
}

/**
 * Every persisted capture session (ignoring the sidecar JSON files), including
 * ones whose file is corrupt so callers can surface them instead of hiding a
 * session whose Chrome may still be running.
 */
export async function listSessions(): Promise<SessionListing[]> {
  const dir = sessionsDir();
  const entries = await readdir(dir).catch(() => []);
  const listings: SessionListing[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (name.endsWith('.listener.json') || name.endsWith('.undo.json')) continue;
    const id = name.slice(0, -'.json'.length);
    try {
      listings.push({ id, state: await readSessionState(id), error: null });
    } catch (err) {
      if (err instanceof CorruptSessionError) listings.push({ id, state: null, error: err.message });
      // A file removed between readdir and read is simply gone.
    }
  }
  return listings;
}

/** Read every readable capture session. */
export async function listSessionStates(): Promise<CaptureSession[]> {
  return (await listSessions()).flatMap((s) => (s.state ? [s.state] : []));
}

export async function spawnListener(
  sessionId: string,
  captureDir: string,
): Promise<{ pid: number | null; logPath: string }> {
  await mkdir(captureDir, { recursive: true });
  const logPath = join(captureDir, 'listener.log');
  const log = await open(logPath, 'a');
  // Resolve the listener from THIS module's real location (dist/), not
  // `process.argv[1]`. When the CLI is invoked through a symlink (a global
  // shim or `npm link`), argv[1] is the symlink path, so its dirname has no
  // `capture-listener.js`. import.meta.url is the resolved bundle path
  // regardless of how the binary was invoked.
  const cliPath = fileURLToPath(import.meta.url);
  // The listener is the auto-capture engine but NOT part of the public command
  // surface. It runs as a detached process because `start` must return
  // immediately while capture keeps going until `stop`. It is its own build
  // entry (`capture-listener.js`, a sibling of the CLI bundle).
  const listenerEntry = join(dirname(cliPath), 'capture-listener.js');
  const child = spawn(process.execPath, [listenerEntry, '--session', sessionId], {
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  child.unref();
  await log.close();
  return { pid: child.pid ?? null, logPath };
}

export async function waitForListenerReady(sessionId: string, timeoutMs: number): Promise<CaptureSession> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readSessionState(sessionId).catch(() => null);
    if (state?.listenerReadyAt) return state;
    await sleep(100);
  }
  return readSessionState(sessionId);
}

export async function cleanupHarness(state: CaptureSession): Promise<void> {
  // Prefer the listener pid recorded in the session JSON (the listener merges it
  // in once it starts), but fall back to the foreground-owned sidecar in case
  // the listener never got far enough to persist it (e.g. interrupted start).
  let listenerPid = state.listenerPid ?? null;
  if (!listenerPid && state.id) {
    listenerPid = (await readListenerMeta(state.id))?.listenerPid ?? null;
  }
  if (listenerPid) {
    await terminateProcessTree(listenerPid);
  }
  if (state.attached) return;
  // Graceful CDP shutdown first (reaps Chrome's own helper tree), then the
  // SIGKILL process-group + profile-dir backstops below catch anything left.
  await closeBrowserGracefully(state.browserWsUrl);
  if (state.chromePid) {
    await terminateProcessTree(state.chromePid);
  }
  await reapByProfileDir(state.profileDir);
  if (!state.keepProfile && state.profileDir) {
    await rm(state.profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined,
    );
  }
}

export async function removeCaptureDir(state: CaptureSession): Promise<void> {
  if (!state.captureDir) return;
  await rm(state.captureDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    () => undefined,
  );
}

/**
 * Close any running capture that owns `profileDir` so a fresh Chrome can take the
 * profile over. Forces keepProfile so the saved login is never deleted. Returns
 * the ids it closed.
 */
export async function closeCapturesOnProfile(profileDir: string): Promise<string[]> {
  const target = resolve(profileDir);
  const closed: string[] = [];
  for (const state of await listSessionStates()) {
    if (!state.profileDir || resolve(state.profileDir) !== target) continue;
    await cleanupHarness({ ...state, keepProfile: true });
    await removeCaptureDir(state);
    await removeSessionState(state.id);
    closed.push(state.id);
  }
  return closed;
}

// --- Undo support -----------------------------------------------------------
// `capture undo` drops the last recorded step so a probing click ("does this
// control work?") is not permanently baked into the demo. The listener owns
// `screens`, so undo records the dropped screens' stable keys in a
// foreground-owned sidecar; `status` and `stop` filter them out.

/** Stable per-screen key — capture asset paths are unique per recorded step. */
export function screenKey(s: CapturedScreen): string {
  return s.pngPath || s.videoPath || s.posterPngPath || `t:${s.capturedAt ?? ''}`;
}

export function undoSidecarPath(sessionId: string): string {
  return join(sessionsDir(), `${sessionId}.undo.json`);
}

export async function readDroppedKeys(sessionId: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(undoSidecarPath(sessionId), 'utf8')) as {
      droppedKeys?: unknown;
    };
    return Array.isArray(parsed.droppedKeys)
      ? parsed.droppedKeys.filter((k): k is string => typeof k === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function writeDroppedKeys(sessionId: string, droppedKeys: string[]): Promise<void> {
  await atomicWriteFile(undoSidecarPath(sessionId), `${JSON.stringify({ droppedKeys }, null, 2)}\n`);
}

/** Screens that survive the undo sidecar, in capture order. */
export function liveScreens(screens: CapturedScreen[], dropped: string[]): CapturedScreen[] {
  if (dropped.length === 0) return screens;
  const drop = new Set(dropped);
  return screens.filter((s) => !drop.has(screenKey(s)));
}

export function labelFor(s: CapturedScreen, i: number): string {
  return s.click?.label || s.title || `Step ${i + 1}`;
}
