/**
 * The detached auto-capture listener. Spawned by `capture start`, it attaches
 * to the captured page, arms the in-page recorder, and turns every click into
 * a recorded step until `stop` or `cancel` removes the session.
 */
import { CAPTURE_DEVICE_SCALE_FACTOR, Cdp, attachToTarget, getPageTargets, resizeTargetContentViewport, type TargetInfo } from './chrome.js';
import { requireString, sleep, type ParsedArgs } from './options.js';
import {
  installRecorder,
  parseRecorderPayload,
  readCaptureMetadata,
  type CaptureMetadata,
} from './recorder.js';
import { readListenerMeta, readSessionState, writeSession } from './session.js';
import {
  VIDEO_FRAME_BUFFER_LIMIT,
  VIDEO_MAX_SEGMENT_MS,
  VIDEO_MOTION_STALE_MS,
  captureImageStepFromData,
  captureStep,
  captureVideoStep,
  selectPreClickFrame,
  type VideoFrame,
} from './steps.js';

export const LISTENER_USAGE = 'capture-listener --session <id>';

export async function runListen(args: ParsedArgs): Promise<number> {
  const sessionId = requireString(args, 'session', LISTENER_USAGE);
  const initialState = await readSessionState(sessionId);
  // The foreground `start` records this listener's pid/log in a sidecar (so it
  // never writes the session JSON after spawning us). As the single writer of
  // the session JSON, fold those into our first persisted write so stop/cancel
  // can find the listener pid.
  const listenerMeta = await readListenerMeta(sessionId);

  process.stderr.write(
    `capture listener: session ${sessionId} connecting to ${initialState.browserWsUrl}\n`,
  );

  const cdp = new Cdp(initialState.browserWsUrl);
  let targetSessionId: string | null = null;
  let activeTargetId = initialState.targetId;
  let captureChain: Promise<unknown> = Promise.resolve();
  let targetSwitchChain: Promise<unknown> = Promise.resolve();
  let followNewPageUntil = 0;
  const knownPageTargetIds = new Set<string>();
  let videoFrames: VideoFrame[] = [];
  let hadScrollOrTypeSinceClick = false;
  let motionStartedAt: number | null = null;
  let motionLastAt: number | null = null;
  let closed = false;

  async function attachRecorderToTarget(targetId: string): Promise<void> {
    if (targetSessionId) {
      await cdp.send('Page.stopScreencast', {}, targetSessionId).catch(() => undefined);
      await cdp.send('Target.detachFromTarget', { sessionId: targetSessionId }).catch(() => undefined);
    }
    videoFrames = [];
    hadScrollOrTypeSinceClick = false;
    motionStartedAt = null;
    motionLastAt = null;
    activeTargetId = targetId;
    targetSessionId = await attachToTarget(cdp, targetId);
    await cdp.send('Page.enable', {}, targetSessionId).catch(() => undefined);
    await cdp.send('Runtime.enable', {}, targetSessionId).catch(() => undefined);
    const latestForViewport = await readSessionState(sessionId).catch(() => initialState);
    await resizeTargetContentViewport(
      cdp,
      targetSessionId,
      targetId,
      latestForViewport.width,
      latestForViewport.height,
    );
    await installRecorder(cdp, targetSessionId, true);
    const latestForVideo = await readSessionState(sessionId).catch(() => latestForViewport);
    if (latestForVideo.recordVideo) {
      await cdp
        .send(
          'Page.startScreencast',
          {
            format: 'png',
            quality: 90,
            maxWidth: latestForVideo.width * CAPTURE_DEVICE_SCALE_FACTOR,
            maxHeight: latestForVideo.height * CAPTURE_DEVICE_SCALE_FACTOR,
            everyNthFrame: 1,
          },
          targetSessionId,
        )
        .catch((err) => {
          process.stderr.write(`capture video start failed: ${(err as Error).message}\n`);
        });
    }
    const latest = await readSessionState(sessionId).catch(() => initialState);
    await writeSession({
      ...latest,
      targetId,
      listenerPid: latest.listenerPid ?? listenerMeta?.listenerPid ?? null,
      listenerLogPath: latest.listenerLogPath ?? listenerMeta?.listenerLogPath ?? null,
      listenerReadyAt: latest.listenerReadyAt ?? new Date().toISOString(),
    });
  }

  async function closeAndExit(code: number): Promise<void> {
    if (closed) return;
    closed = true;
    if (targetSessionId) {
      await cdp.send('Page.stopScreencast', {}, targetSessionId).catch(() => undefined);
      await cdp.send('Target.detachFromTarget', { sessionId: targetSessionId }).catch(() => undefined);
    }
    cdp.close();
    process.exit(code);
  }

  process.once('SIGTERM', () => {
    void closeAndExit(0);
  });
  process.once('SIGINT', () => {
    void closeAndExit(0);
  });

  await cdp.send('Target.setDiscoverTargets', { discover: true }).catch(() => undefined);
  for (const target of await getPageTargets(cdp).catch(() => [])) {
    knownPageTargetIds.add(target.targetId);
  }
  await attachRecorderToTarget(initialState.targetId);

  // attachRecorderToTarget already persisted readyAt + the listener pid by
  // reading fresh state; read fresh again here (never spread the stale entry
  // snapshot) so this confirmation write can't clobber what it wrote.
  {
    const latest = await readSessionState(sessionId).catch(() => initialState);
    await writeSession({
      ...latest,
      targetId: activeTargetId,
      listenerPid: latest.listenerPid ?? listenerMeta?.listenerPid ?? null,
      listenerLogPath: latest.listenerLogPath ?? listenerMeta?.listenerLogPath ?? null,
      listenerReadyAt: latest.listenerReadyAt ?? new Date().toISOString(),
    });
  }
  process.stderr.write(`capture listener: session ${sessionId} armed and recording\n`);

  cdp.on('Target.targetCreated', (params) => {
    const event = params as { targetInfo?: TargetInfo };
    const target = event.targetInfo;
    if (!target || target.type !== 'page') return;
    const shouldFollow = target.openerId === activeTargetId || Date.now() < followNewPageUntil;
    if (!shouldFollow) return;
    targetSwitchChain = targetSwitchChain
      .then(async () => {
        await sleep(250);
        await attachRecorderToTarget(target.targetId);
        knownPageTargetIds.add(target.targetId);
      })
      .catch((err) => {
        process.stderr.write(`capture target follow failed: ${(err as Error).message}\n`);
      });
  });

  cdp.on('Page.screencastFrame', (params, sid) => {
    if (sid !== targetSessionId) return;
    const frame = params as { data?: unknown; sessionId?: unknown };
    if (typeof frame.sessionId === 'number') {
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }, sid).catch(() => undefined);
    }
    if (typeof frame.data !== 'string') return;
    videoFrames.push({ data: frame.data, receivedAt: Date.now() });
    if (videoFrames.length > VIDEO_FRAME_BUFFER_LIMIT) {
      videoFrames = videoFrames.slice(-VIDEO_FRAME_BUFFER_LIMIT);
    }
  });

  async function followLikelyNewTarget(): Promise<void> {
    const pages = await getPageTargets(cdp).catch(() => []);
    const candidate =
      pages.find((target) => target.openerId === activeTargetId) ??
      pages.find((target) => target.targetId !== activeTargetId && !knownPageTargetIds.has(target.targetId));
    for (const target of pages) knownPageTargetIds.add(target.targetId);
    if (!candidate || candidate.targetId === activeTargetId) return;
    await attachRecorderToTarget(candidate.targetId);
  }

  async function navigateAfterSourceCapture(url: string | null | undefined): Promise<void> {
    if (!url || !targetSessionId) return;
    await cdp.send('Page.navigate', { url }, targetSessionId).catch((err) => {
      process.stderr.write(`capture post-click navigation failed: ${(err as Error).message}\n`);
    });
  }

  cdp.on('Runtime.bindingCalled', (params, sid) => {
    if (sid !== targetSessionId) return;
    const event = params as { name?: unknown; payload?: unknown };
    const recorderEvent = parseRecorderPayload(String(event.name ?? ''), event.payload);
    if (!recorderEvent) {
      process.stderr.write(`capture listener: ignored an invalid ${String(event.name ?? '')} payload from the page\n`);
      return;
    }
    // Stamp the click's arrival the instant the binding fires — before the async
    // captureChain runs — so the consumer can reject screencast frames that
    // arrived after the click (i.e. ones already showing its effect).
    const clickArrivalAt = recorderEvent.type === 'click' ? Date.now() : null;
    if (recorderEvent.type === 'click') {
      followNewPageUntil = Date.now() + 3_000;
    } else {
      const motionAt = Date.now();
      motionStartedAt = motionStartedAt ?? motionAt;
      motionLastAt = motionAt;
      hadScrollOrTypeSinceClick = true;
    }
    captureChain = captureChain
      .then(async () => {
        if (recorderEvent.type !== 'click') return;
        const now = Date.now();
        const motionStart = motionStartedAt;
        const motionLast = motionLastAt;
        const attachVideo =
          hadScrollOrTypeSinceClick &&
          motionStart !== null &&
          motionLast !== null &&
          now - motionLast <= VIDEO_MOTION_STALE_MS;
        hadScrollOrTypeSinceClick = false;
        motionStartedAt = null;
        motionLastAt = null;
        const segmentStartedAt = Math.max(
          motionStart ? motionStart - 250 : 0,
          now - VIDEO_MAX_SEGMENT_MS,
        );
        const frames = motionStart
          ? videoFrames.filter((frame) => frame.receivedAt >= segmentStartedAt)
          : [...videoFrames];
        const navigationUrl = recorderEvent.page?.navigationUrl ?? null;

        // Snapshot the page the click happened ON, BEFORE navigation/settle,
        // so the screenshot, pointer, and label all describe the same page.
        // Pick the newest buffered frame that arrived BEFORE the click — never
        // `frames[last]`, which the click's own paint may already have polluted.
        // Falling back to a live screenshot covers the --no-video path where no
        // frames buffer.
        let sourcePng: string | null = selectPreClickFrame(videoFrames, clickArrivalAt);
        // Prefer the URL/title/scroll captured IN-PAGE at click time (carried
        // on the recorder event) — it is taken before navigation, so it names
        // the source page.
        let sourceMeta: CaptureMetadata | null = recorderEvent.page
          ? {
              viewport: recorderEvent.page.viewport,
              sourceUrl: recorderEvent.page.url,
              title: recorderEvent.page.title,
              click: recorderEvent.click,
              scroll: recorderEvent.page.scroll,
            }
          : null;
        if (targetSessionId) {
          if (!sourceMeta) {
            sourceMeta = await readCaptureMetadata(cdp, targetSessionId).catch(() => null);
          }
          if (!sourcePng) {
            const shot = await cdp
              .send(
                'Page.captureScreenshot',
                { format: 'png', fromSurface: true, captureBeyondViewport: false },
                targetSessionId,
              )
              .catch(() => null);
            const data = shot && (shot as { data?: unknown }).data;
            sourcePng = typeof data === 'string' ? data : null;
          }
        }
        videoFrames = [];

        const latest = await readSessionState(sessionId).catch(() => null);
        if (!latest) {
          await closeAndExit(0);
          return;
        }

        await navigateAfterSourceCapture(navigationUrl);

        // Re-arm the recorder on whatever page the click navigated to so the
        // NEXT click is captured there; the current step uses the source-page
        // snapshot taken above, not the destination.
        await sleep(2_000);
        await targetSwitchChain;
        await followLikelyNewTarget();
        if (latest.recordVideo && attachVideo) {
          await captureVideoStep(latest, frames, recorderEvent.click, sourceMeta ?? undefined, sourcePng);
          return;
        }
        if (sourcePng && sourceMeta) {
          await captureImageStepFromData(latest, sourcePng, sourceMeta, recorderEvent.click ?? null);
          return;
        }
        await captureStep(latest, undefined, recorderEvent.click, 'click');
      })
      .catch((err) => {
        process.stderr.write(`capture listener failed: ${(err as Error).message}\n`);
      });
  });

  const interval = setInterval(() => {
    void readSessionState(sessionId).catch(() => {
      clearInterval(interval);
      void closeAndExit(0);
    });
  }, 1_000);

  await new Promise(() => {
    // Keep the detached listener alive until stop/cancel removes the session
    // or cleanup sends SIGTERM.
  });
  return 0;
}
