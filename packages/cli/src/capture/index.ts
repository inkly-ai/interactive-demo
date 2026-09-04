/**
 * `capture` command dispatch: start / stop / cancel / status / undo / profiles
 * / login. Every subcommand prints JSON so it can be driven by a script or an
 * agent as easily as by a person.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECT_FILE, ProjectSchema, findProjectRoot, readJsonFile } from '../project.js';
import { atomicWriteFile } from '../fs-atomic.js';
import {
  Cdp,
  DEFAULT_HEIGHT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  clearStaleProfileLocks,
  findChrome,
  launchChrome,
  openTargetPage,
  pidAlive,
  reapByProfileDir,
  resolveBrowserWebSocketUrl,
  terminateProcessTree,
} from './chrome.js';
import {
  booleanOption,
  jsonOut,
  numberOption,
  parseWindowSizeOption,
  resolveArgPath,
  stringOption,
  type ParsedArgs,
} from './options.js';
import { assembleCapturedDemo, uniqueDemoSlug, writeDemoFolder } from './output.js';
import { profileNameFromUrl, profilesRootDir, resolveProfileDir } from './profiles.js';
import { installRecorder } from './recorder.js';
import {
  CorruptSessionError,
  captureDataDir,
  cleanupHarness,
  closeCapturesOnProfile,
  labelFor,
  listSessions,
  liveScreens,
  readDroppedKeys,
  readListenerMeta,
  readSessionState,
  removeCaptureDir,
  removeSessionState,
  screenKey,
  sessionPath,
  spawnListener,
  waitForListenerReady,
  writeDroppedKeys,
  writeListenerMeta,
  writeSession,
  type CaptureSession,
} from './session.js';
import { ffmpegAvailable } from './steps.js';

const BIN = 'interactive-demo';

export const CAPTURE_USAGE = `${BIN} capture — record a click-through of a live web app as a demo

Usage:
  ${BIN} capture start <url> [--name <name>] [options]
  ${BIN} capture stop [--session <id>] [--out <dir>]
  ${BIN} capture cancel [--session <id>]
  ${BIN} capture status [--session <id>]
  ${BIN} capture undo [--session <id>]
  ${BIN} capture profiles
  ${BIN} capture login <url> [--profile <name>]

How it works:
  \`start\` opens the URL in Chrome and arms a recorder. Every click you make
  records one step: a screenshot of the page you clicked on, with a pointer on
  the clicked element. Scrolling or typing before a click records that motion
  as a short video step instead (needs ffmpeg). \`stop\` writes the demo into
  the current project at demos/<slug>/ (or into --out).

Options:
  --name <name>           Demo title. Defaults to the page host.
  --session <id>          Session id printed by start. Optional when exactly one
                          session is running.
  --out <dir>             With stop: write the demo folder at <dir>/<slug>
                          instead of the current project's demos/ folder.
  --browser <path>        Chrome/Chromium binary. Defaults to an installed Chrome
                          (or the CHROME_PATH environment variable).
  --connect-to-browser <url>
                          Attach to an already-running Chrome DevTools endpoint.
  --width <n>             Browser viewport width. Defaults to 1440.
  --height <n>            Browser viewport height. Defaults to 900.
  --window-size <w>x<h>   Shortcut for --width <w> --height <h>.
  --timeout <ms>          Page load timeout. Defaults to 120000.
  --headed                Use a visible Chrome window (the default, so you can
                          click through the product yourself).
  --headless              Use headless Chrome. Only useful with
                          --connect-to-browser or a script driving the page.
  --profile <name>        Reuse a PERSISTENT Chrome profile across captures (a bare
                          name maps to a folder under the capture home, or pass a
                          directory path). A login done once in this profile
                          survives, so later captures need no re-login.
  --keep-profile          Leave the temporary Chrome profile after stop/cancel.
  --no-video              Record still images only; never build video steps.
  --no-zoom               Don't zoom screenshot steps in on the clicked point.
  --compress-images       Re-encode screenshots to WebP (smaller files).

Output:
  Every subcommand prints JSON.
`;

export interface DispatchCaptureOptions {
  cwd: string;
  subcommand: string | undefined;
  args: ParsedArgs;
}

export async function dispatchCapture(options: DispatchCaptureOptions): Promise<number> {
  const { cwd, subcommand, args } = options;
  switch (subcommand) {
    case 'start':
      return runStart(cwd, args);
    case 'stop':
      return runStop(cwd, args);
    case 'cancel':
      return runCancel(args);
    case 'status':
      return runStatus(args);
    case 'undo':
      return runUndo(args);
    case 'profiles':
      return runProfiles();
    case 'login':
      return runLogin(cwd, args);
    default:
      process.stdout.write(CAPTURE_USAGE);
      return 1;
  }
}

function positional(args: ParsedArgs, index: number): string | undefined {
  const value = args._[index];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * `--session <id>`, or the only running session when there is exactly one, so
 * the common single-capture flow never needs the id copied around.
 */
async function resolveSessionId(args: ParsedArgs): Promise<string> {
  const explicit = stringOption(args, 'session');
  if (explicit) return explicit;
  const listings = await listSessions();
  const corrupt = listings.filter((s) => s.error);
  if (corrupt.length > 0) {
    throw new Error(corrupt.map((s) => s.error).join('\n'));
  }
  const states = listings.flatMap((s) => (s.state ? [s.state] : []));
  if (states.length === 1) return states[0]!.id;
  if (states.length === 0) {
    throw new Error(`No capture session is running. Start one with \`${BIN} capture start <url>\`.`);
  }
  throw new Error(
    `${states.length} capture sessions are running; pass --session <id>. Running: ${states
      .map((s) => `${s.id} (${s.name})`)
      .join(', ')}`,
  );
}

function optionalConnectToBrowser(args: ParsedArgs): string | undefined {
  return stringOption(args, 'connect-to-browser') ?? process.env.INTERACTIVE_DEMO_CAPTURE_BROWSER_URL;
}

function emptySession(input: {
  url: string;
  name: string;
  launched: { pid: number | null; profileDir: string | null; wsUrl: string; debuggingUrl: string; logPath: string | null };
  keepProfile: boolean;
  attached: boolean;
  width: number;
  height: number;
  listenerPid: number | null;
}): CaptureSession {
  return {
    id: '',
    createdAt: '',
    url: input.url,
    name: input.name,
    chromePid: input.launched.pid,
    profileDir: input.launched.profileDir,
    keepProfile: input.keepProfile,
    browserWsUrl: input.launched.wsUrl,
    browserDebuggingUrl: input.launched.debuggingUrl,
    chromeLogPath: input.launched.logPath,
    attached: input.attached,
    tabUrl: '',
    targetId: '',
    width: input.width,
    height: input.height,
    screens: [],
    captureDir: null,
    listenerPid: input.listenerPid,
    listenerLogPath: null,
    listenerReadyAt: null,
  };
}

async function runStart(cwd: string, args: ParsedArgs): Promise<number> {
  const url = stringOption(args, 'url') || positional(args, 1);
  if (!url) throw new Error(`missing <url>\n\n${CAPTURE_USAGE}`);
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`capture start needs an http(s) URL, got ${parsedUrl.protocol}`);
  }
  const name = stringOption(args, 'name') || parsedUrl.host.replace(/^www\./i, '') || 'Captured demo';

  const windowSize = parseWindowSizeOption(stringOption(args, 'window-size'));
  const width = windowSize?.width ?? numberOption(args, 'width', DEFAULT_WIDTH);
  const height = windowSize?.height ?? numberOption(args, 'height', DEFAULT_HEIGHT);
  const timeoutMs = numberOption(args, 'timeout', DEFAULT_TIMEOUT_MS);
  const connectToBrowser = optionalConnectToBrowser(args);
  const autoApplyZoom = booleanOption(args, ['zoom', 'auto-apply-zoom'], true);
  const videoRequested = booleanOption(args, ['record-video', 'video'], true);
  const compressImages = booleanOption(args, ['compress-images', 'compress-image'], false);
  // A person clicks through the product, so the window is visible by default.
  // `--headless` wins only when `--headed` was not also passed.
  const headless = booleanOption(args, ['headless'], false) && args.headed !== true;
  // A persistent named profile reuses the same Chrome user-data-dir across
  // captures, so a login done once survives. Ignored when attaching to an
  // external browser (that browser owns its own profile).
  const profileName = stringOption(args, 'profile');
  const persistentProfileDir = !connectToBrowser && profileName ? resolveProfileDir(cwd, profileName) : null;
  // Chrome writes a `Default/` subdir on first run, so its presence means this
  // profile was used before — i.e. any prior login is already in it.
  const profileReused = persistentProfileDir != null && existsSync(join(persistentProfileDir, 'Default'));
  if (!Number.isInteger(width) || width < 320) throw new Error('--width must be an integer >= 320');
  if (!Number.isInteger(height) || height < 240) throw new Error('--height must be an integer >= 240');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new Error('--timeout must be an integer >= 1000');
  }
  // Decide video ONCE, here: the listener only takes the video path when the
  // session says so, and a session that promises video without ffmpeg would
  // lose every motion step.
  let videoDisabledReason: string | null = null;
  if (videoRequested && !(await ffmpegAvailable())) {
    videoDisabledReason = 'ffmpeg was not found on PATH';
    process.stderr.write(
      `${videoDisabledReason}, so scroll/typing motion will be recorded as still images. ` +
        'Install ffmpeg to get video steps, or pass --no-video to silence this.\n',
    );
  }
  const recordVideo = videoRequested && videoDisabledReason === null;

  const launched = connectToBrowser
    ? {
        pid: null,
        profileDir: null,
        ...(await resolveBrowserWebSocketUrl(connectToBrowser)),
        logPath: null,
      }
    : await (async () => {
        const browser = await findChrome(cwd, stringOption(args, 'browser'));
        return launchChrome({
          browser,
          width,
          height,
          headless,
          timeoutMs,
          userDataDir: persistentProfileDir,
        });
      })();
  const cdp = new Cdp(launched.wsUrl);

  // Tear down a just-spawned harness (Chrome + detached listener) if `start` is
  // interrupted (^C / SIGTERM) before it returns. A SUCCESSFUL start clears this
  // handler so the listener is left running for a later `stop`/`cancel`.
  let spawnedListenerPid: number | null = null;
  // Set once the session file exists so a failed/interrupted start removes it
  // (and its capture dir) instead of leaving a dead session that the next
  // stop/status would bind to.
  let createdSessionId: string | null = null;
  let createdCaptureDir: string | null = null;
  let teardownInstalled = false;
  // Never delete a persistent (or attached) profile on interrupt or error —
  // that would wipe the user's saved login.
  const harnessOnFailure = (): CaptureSession =>
    emptySession({
      url,
      name,
      launched,
      keepProfile: persistentProfileDir != null || !!connectToBrowser,
      attached: !!connectToBrowser,
      width,
      height,
      listenerPid: spawnedListenerPid,
    });
  const discardFailedStart = async (): Promise<void> => {
    await cleanupHarness(harnessOnFailure());
    if (createdCaptureDir) {
      await removeCaptureDir({ ...harnessOnFailure(), captureDir: createdCaptureDir });
    }
    if (createdSessionId) await removeSessionState(createdSessionId);
  };
  const interruptTeardown = (): void => {
    void discardFailedStart().finally(() => {
      process.exit(130);
    });
  };
  process.on('SIGINT', interruptTeardown);
  process.on('SIGTERM', interruptTeardown);
  teardownInstalled = true;
  const removeInterruptTeardown = (): void => {
    if (!teardownInstalled) return;
    process.removeListener('SIGINT', interruptTeardown);
    process.removeListener('SIGTERM', interruptTeardown);
    teardownInstalled = false;
  };

  try {
    await cdp.send('Target.setDiscoverTargets', { discover: true }).catch(() => undefined);
    const page = await openTargetPage(cdp, url, width, height, timeoutMs);
    await cdp.send('Target.activateTarget', { targetId: page.targetId }).catch(() => undefined);
    const id = randomUUID();

    await installRecorder(cdp, page.sessionId);
    const captureDir = captureDataDir(id);
    const state: CaptureSession = {
      id,
      createdAt: new Date().toISOString(),
      url,
      name,
      chromePid: launched.pid,
      profileDir: launched.profileDir,
      keepProfile: connectToBrowser ? true : persistentProfileDir != null || args['keep-profile'] === true,
      browserWsUrl: launched.wsUrl,
      browserDebuggingUrl: launched.debuggingUrl,
      chromeLogPath: launched.logPath,
      attached: !!connectToBrowser,
      tabUrl: url,
      targetId: page.targetId,
      width,
      height,
      screens: [],
      recordVideo,
      headless: connectToBrowser ? false : headless,
      compressImages,
      autoApplyZoom,
      captureDir,
      listenerPid: null,
      listenerLogPath: null,
      listenerReadyAt: null,
    };
    await mkdir(captureDir, { recursive: true });
    await writeSession(state);
    createdSessionId = state.id;
    createdCaptureDir = captureDir;
    const listener = await spawnListener(state.id, captureDir);
    spawnedListenerPid = listener.pid;
    // Hand the listener pid off via the sidecar instead of re-writing the
    // session JSON here. Once spawned, the listener is the SINGLE writer of the
    // session JSON.
    await writeListenerMeta(state.id, {
      listenerPid: listener.pid,
      listenerLogPath: listener.logPath,
    });
    // 15s: the poll returns the instant the listener writes readyAt, so a
    // healthy session is unaffected — the extra budget only gives a loaded
    // machine room to arm before we declare the session dead.
    const ARM_TIMEOUT_MS = 15_000;
    const readyState = await waitForListenerReady(state.id, ARM_TIMEOUT_MS);
    // FAIL LOUDLY if the recorder never armed. Returning ok with a dead listener
    // silently drops every click and exports zero steps.
    if (!readyState.listenerReadyAt) {
      const tailOf = async (path: string | null | undefined): Promise<string> => {
        if (!path) return '';
        return readFile(path, 'utf8')
          .then((raw) => raw.split('\n').filter(Boolean).slice(-12).join('\n'))
          .catch(() => '');
      };
      const listenerTail = await tailOf(listener.logPath);
      const chromeTail = await tailOf(readyState.chromeLogPath ?? launched.logPath);
      throw new Error(
        `capture recorder failed to arm within ${ARM_TIMEOUT_MS / 1000}s (listenerReadyAt is null). ` +
          `Every click would be silently dropped, so this session is unusable.\n` +
          `Listener log (${listener.logPath}):\n${listenerTail || '(empty)'}\n` +
          `Chrome log (${readyState.chromeLogPath ?? launched.logPath}):\n${chromeTail || '(empty)'}`,
      );
    }
    // Start succeeded: the listener must keep running for a later stop.
    removeInterruptTeardown();
    jsonOut({
      ok: true,
      session: {
        id: readyState.id,
        stateFile: sessionPath(readyState.id),
        createdAt: readyState.createdAt,
      },
      browser: {
        pid: readyState.chromePid,
        debuggingUrl: readyState.browserDebuggingUrl,
        webSocketDebuggerUrl: readyState.browserWsUrl,
        headless: connectToBrowser ? null : headless,
        attached: readyState.attached,
        profile: persistentProfileDir
          ? { dir: persistentProfileDir, persistent: true, reused: profileReused }
          : null,
      },
      tab: {
        targetId: readyState.targetId,
        url: readyState.tabUrl,
      },
      capture: {
        name,
        video: readyState.recordVideo === true,
        videoDisabledReason,
        autoApplyZoom: readyState.autoApplyZoom !== false,
        window: { width: readyState.width, height: readyState.height },
        stepCount: 0,
        listenerPid: readyState.listenerPid ?? listener.pid,
        listenerReadyAt: readyState.listenerReadyAt,
      },
      next:
        `Click through the product in the Chrome window, then run \`${BIN} capture stop\`. ` +
        (readyState.recordVideo === true
          ? 'Clicks that follow scrolling or typing are recorded as short videos; other clicks as stills.'
          : 'Every click is recorded as a still.'),
    });
    return 0;
  } catch (err) {
    await discardFailedStart();
    throw err;
  } finally {
    removeInterruptTeardown();
    cdp.close();
  }
}

/**
 * Where `stop` writes the demo: `--out <dir>` verbatim, else `demos/<slug>/`
 * inside the enclosing project. Registers the slug in the project file only
 * when that file keeps a `demos` list.
 */
async function resolveOutput(
  cwd: string,
  args: ParsedArgs,
  name: string,
): Promise<{ demoDir: string; slug: string; projectRoot: string | null; register: () => Promise<boolean> }> {
  const outArg = stringOption(args, 'out');
  if (outArg) {
    const outDir = resolveArgPath(cwd, outArg);
    const slug = await uniqueDemoSlug(outDir, name);
    return { demoDir: join(outDir, slug), slug, projectRoot: null, register: async () => false };
  }
  const projectRoot = await findProjectRoot(cwd);
  if (!projectRoot) {
    throw new Error(
      `Not inside a project (no ${PROJECT_FILE} found). Run \`${BIN} init <name>\` first, or pass --out <dir>.`,
    );
  }
  const demosRoot = join(projectRoot, 'demos');
  const slug = await uniqueDemoSlug(demosRoot, name);
  const register = async (): Promise<boolean> => {
    const projectPath = join(projectRoot, PROJECT_FILE);
    const parsed = ProjectSchema.safeParse(await readJsonFile(projectPath));
    if (!parsed.success || !Array.isArray(parsed.data.demos) || parsed.data.demos.includes(slug)) {
      return false;
    }
    const updated = { ...parsed.data, demos: [...parsed.data.demos, slug] };
    await atomicWriteFile(projectPath, `${JSON.stringify(updated, null, 2)}\n`);
    return true;
  };
  return { demoDir: join(demosRoot, slug), slug, projectRoot, register };
}

async function runStop(cwd: string, args: ParsedArgs): Promise<number> {
  const sessionId = await resolveSessionId(args);
  const state = await readSessionState(sessionId);
  // Honor `capture undo`: build from the screens that survive the undo sidecar.
  const droppedScreenKeys = await readDroppedKeys(sessionId);
  const exportScreens = liveScreens(state.screens ?? [], droppedScreenKeys);
  // A stop with no recorded steps has nothing to export. Tear the harness down
  // exactly like `cancel` — but still report failure so the caller learns its
  // clicks were never recorded.
  if (exportScreens.length === 0) {
    await cleanupHarness(state);
    await removeCaptureDir(state);
    await removeSessionState(state.id);
    jsonOut({
      ok: false,
      session: { id: state.id },
      error:
        'No steps captured — nothing to export. Each step comes from a click on the page; the initial page load is not a step. The session has been cleaned up, so no `cancel` is needed.',
      output: { demoDir: null, stepCount: 0 },
    });
    return 1;
  }

  // One step per click: each recorded screen is a click on the page it shows.
  // The final page a click navigates to is NOT captured unless you click again.
  const output = await resolveOutput(cwd, args, state.name);
  const built = await assembleCapturedDemo({
    name: state.name,
    screens: exportScreens,
    autoApplyZoom: state.autoApplyZoom !== false,
    compressImages: state.compressImages === true,
  });
  await writeDemoFolder(output.demoDir, built);
  const registered = await output.register();

  await cleanupHarness(state);
  await removeCaptureDir(state);
  await removeSessionState(state.id);
  jsonOut({
    ok: true,
    session: { id: state.id },
    output: {
      demoDir: output.demoDir,
      slug: output.slug,
      id: built.demo.id,
      registered,
      stepCount: built.stepCount,
      // The captured story, one label per step (clicked element's accessible
      // name), so the flow can be checked without opening the demo JSON.
      stepLabels: built.labels,
    },
    next: output.projectRoot
      ? `Preview it: ${BIN} dev  (then open /${output.slug}/)`
      : `Preview it: ${BIN} dev ${relative(cwd, output.demoDir) || '.'}`,
  });
  return 0;
}

async function runCancel(args: ParsedArgs): Promise<number> {
  const sessionId = await resolveSessionId(args);
  let state: CaptureSession;
  try {
    state = await readSessionState(sessionId);
  } catch (err) {
    if (!(err instanceof CorruptSessionError)) throw err;
    // Best effort: the session JSON is unreadable, but the listener sidecar
    // (written by start) may still name the listener, and the capture dir is
    // derived from the id. Chrome itself is reaped when the listener dies and
    // by the profile-dir backstop on the next start.
    const listenerPid = (await readListenerMeta(sessionId))?.listenerPid ?? null;
    if (listenerPid) await terminateProcessTree(listenerPid);
    await removeCaptureDir({ captureDir: captureDataDir(sessionId) } as CaptureSession);
    await removeSessionState(sessionId);
    jsonOut({ ok: true, session: { id: sessionId }, recovered: true, warning: err.message });
    return 0;
  }
  await cleanupHarness(state);
  await removeCaptureDir(state);
  await removeSessionState(state.id);
  jsonOut({ ok: true, session: { id: state.id } });
  return 0;
}

/**
 * Drop the most recent recorded step from a live session. Records the dropped
 * screen's key in the undo sidecar (the listener keeps owning the session JSON).
 */
async function runUndo(args: ParsedArgs): Promise<number> {
  const sessionId = await resolveSessionId(args);
  const state = await readSessionState(sessionId);
  const dropped = await readDroppedKeys(sessionId);
  const live = liveScreens(state.screens ?? [], dropped);
  if (live.length === 0) {
    jsonOut({
      ok: false,
      session: { id: state.id },
      error: 'No recorded step to undo.',
      capture: { stepCount: 0 },
    });
    return 1;
  }
  const last = live[live.length - 1]!;
  const undone = labelFor(last, live.length - 1);
  dropped.push(screenKey(last));
  await writeDroppedKeys(sessionId, dropped);
  const remaining = liveScreens(state.screens ?? [], dropped);
  jsonOut({
    ok: true,
    session: { id: state.id },
    capture: {
      undone,
      stepCount: remaining.length,
      stepLabels: remaining.map((s, i) => labelFor(s, i)),
    },
  });
  return 0;
}

/**
 * Report a live session's recorder readiness + recorded steps WITHOUT touching
 * the browser. Honors `capture undo`. Read-only.
 */
async function runStatus(args: ParsedArgs): Promise<number> {
  const sessionId = await resolveSessionId(args);
  const state = await readSessionState(sessionId);
  const dropped = await readDroppedKeys(sessionId);
  const screens = liveScreens(state.screens ?? [], dropped);
  const stepLabels = screens.map((s, i) => labelFor(s, i));
  const steps = screens.map((s, i) => ({
    index: i + 1,
    label: stepLabels[i],
    url: s.sourceUrl || null,
    kind: s.kind ?? 'image',
  }));
  jsonOut({
    ok: true,
    session: { id: state.id, name: state.name, url: state.url },
    capture: {
      ready: Boolean(state.listenerReadyAt),
      // Liveness of the capture browser itself. `ready` only reflects that the
      // recorder armed at some point; it stays true even after the browser
      // crashes. When `browserAlive` is false, further clicks record nothing.
      browserAlive: state.attached ? null : Boolean(state.chromePid && pidAlive(state.chromePid)),
      listenerReadyAt: state.listenerReadyAt ?? null,
      stepCount: screens.length,
      stepLabels,
      lastLabel: stepLabels[stepLabels.length - 1] ?? null,
      steps,
    },
  });
  return 0;
}

async function runProfiles(): Promise<number> {
  const root = profilesRootDir();
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    // A used profile has a `Default/` subdir; cookies live in
    // `Default/Network/Cookies` (current Chrome) or `Default/Cookies` (older).
    const initialized = existsSync(join(dir, 'Default'));
    const hasCookies =
      existsSync(join(dir, 'Default', 'Network', 'Cookies')) || existsSync(join(dir, 'Default', 'Cookies'));
    profiles.push({ name: entry.name, dir, initialized, hasCookies });
  }
  jsonOut({ ok: true, profilesDir: root, profiles });
  return 0;
}

/**
 * Hand the keyboard to the user for a sign-in the automation cannot do itself —
 * principally OAuth ("Sign in with Google/GitHub"), which a provider rejects in a
 * CDP-driven browser even when a human clicks. This opens a SEPARATE real Chrome
 * on the persistent `--profile` dir with NO `--remote-debugging-port` and no
 * automation flags — an ordinary browser the provider accepts. The user signs
 * in; the session cookies persist in the profile, and a later
 * `capture start --profile <name>` reuses them.
 *
 * NON-BLOCKING: returns as soon as the window is open. The user does NOT have to
 * close the window — `capture start` gracefully evicts this Chrome (flushing its
 * cookies) before taking the profile.
 *
 * `--use-mock-keychain` MUST match `launchChrome` so cookies written here decrypt
 * under the same key when capture reuses the profile.
 */
async function runLogin(cwd: string, args: ParsedArgs): Promise<number> {
  if (optionalConnectToBrowser(args)) {
    throw new Error(
      'login manages a persistent --profile and cannot be combined with --connect-to-browser (an attached browser owns its own profile).',
    );
  }
  const url = stringOption(args, 'url') || positional(args, 1);
  if (!url) {
    throw new Error(`login requires a <login-url>.\n\n${CAPTURE_USAGE}`);
  }
  new URL(url); // validate early
  const profileName = stringOption(args, 'profile') ?? profileNameFromUrl(url);
  const profileDir = resolveProfileDir(cwd, profileName);
  const windowSize = parseWindowSizeOption(stringOption(args, 'window-size'));
  const width = windowSize?.width ?? numberOption(args, 'width', DEFAULT_WIDTH);
  const height = windowSize?.height ?? numberOption(args, 'height', DEFAULT_HEIGHT);

  // 1) Free the profile: tear down any capture holding it, reap stray Chrome, and
  // clear stale lock/port files so the login Chrome launches clean.
  const closedSessions = await closeCapturesOnProfile(profileDir);
  await reapByProfileDir(profileDir);
  await mkdir(profileDir, { recursive: true });
  await clearStaleProfileLocks(profileDir);

  // 2) Launch ordinary real Chrome — NO debugging port, NO automation flags — so
  // OAuth/SSO sees a human browser.
  const browser = await findChrome(cwd, stringOption(args, 'browser'));
  const logPath = join(profileDir, 'login.log');
  const logFile = await open(logPath, 'a');
  const flags = [
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--use-mock-keychain',
    // "Continue where you left off" — sets persist_session_cookies, so the
    // SESSION cookies many logins set (no expiry, in-memory by default and lost
    // on close) are committed to the profile's Cookies store instead.
    '--restore-last-session',
    '--hide-crash-restore-bubble',
    url,
  ];
  // Detached + unref so the sign-in window outlives THIS command.
  const proc = spawn(browser, flags, { detached: true, stdio: ['ignore', logFile.fd, logFile.fd] });
  proc.unref();
  await logFile.close();

  process.stderr.write(
    `\nA Chrome window opened for sign-in (profile "${profileName}" at ${url}).\n` +
      'Sign in there — "Sign in with Google/GitHub" works in this window.\n' +
      'You do not need to close it. Once signed in, start the capture with --profile.\n\n',
  );

  const hasCookies =
    existsSync(join(profileDir, 'Default', 'Network', 'Cookies')) || existsSync(join(profileDir, 'Default', 'Cookies'));

  jsonOut({
    ok: true,
    action: 'login',
    loginUrl: url,
    profile: { name: profileName, dir: profileDir, hasCookies },
    closedSessions,
    next:
      `Sign in in the window that opened (you do not need to close it), then start the capture: ` +
      `${BIN} capture start <app-url> --profile ${profileName} --window-size ${width}x${height}`,
  });
  return 0;
}

