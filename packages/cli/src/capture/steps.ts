/**
 * Turning a click into a recorded step: a screenshot (image step) or a clip
 * assembled from buffered screencast frames (video step, via ffmpeg).
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaptureClick } from './build.js';
import {
  Cdp,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  attachToTarget,
  resizeTargetContentViewport,
} from './chrome.js';
import { installRecorder, readCaptureMetadata, type CaptureMetadata } from './recorder.js';
import { writeSession, type CaptureSession } from './session.js';

// How far back from the committing click we LOOK for motion frames. We
// deliberately do NOT build the clip from this whole window — `trimToMotionBurst`
// keeps only the densest run, so widening the lookback never lengthens the
// clip or lets a stale settle frame become the poster.
export const VIDEO_MAX_SEGMENT_MS = 30_000;
export const VIDEO_FPS = 30;
// Holds ~8s of pure continuous-scroll frames (~59fps) plus all the sparse idle
// repaints across a long gap (a static page emits ~0fps).
export const VIDEO_FRAME_BUFFER_LIMIT = 720;
// How long after the last scroll/type sample a committing click may still attach
// the preceding motion as a video step.
export const VIDEO_MOTION_STALE_MS = 30_000;
// Frames whose consecutive `receivedAt` gap is at or below this are considered
// part of one continuous-motion burst. Wheel-driven scroll lands frames ~110-130ms
// apart (one repaint per wheel step); idle/settle repaints are ≥500ms apart.
const VIDEO_BURST_MAX_GAP_MS = 350;
// A clip below these thresholds reads as a flicker rather than motion, so it
// falls back to a still image step instead of a sub-second "video". The
// DURATION floor is the real quality gate; the frame floor is only a sanity
// check that the burst is more than a couple of repaints.
const VIDEO_MIN_FRAMES = 10;
const VIDEO_MIN_DURATION_MS = 1_200;
// Pad a qualifying-but-short clip up to this readable length by holding its
// final frame, so a brief-but-real scroll still plays long enough to register.
const VIDEO_MIN_OUTPUT_MS = 1_500;
// Open every clip with a still beat on its FIRST frame before the motion starts,
// so a scroll step doesn't drop the viewer straight into movement.
const VIDEO_LEAD_HOLD_MS = 500;
// Headless clips play at this fps: dense synthesized frames at 60fps are smooth
// AND crisp. Headed clips keep VIDEO_FPS (the live screencast is already dense
// and plays back at real time).
export const VIDEO_HEADLESS_FPS = 60;

export interface VideoFrame {
  data: string;
  receivedAt: number;
}

export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngSignature.length; i += 1) {
    if (bytes[i] !== pngSignature[i]) return null;
  }
  const type = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (type !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

// Pick the buffered screencast frame that shows the page BEFORE the committing
// click's effect. The recorder fires its binding the instant the click lands,
// so any frame that arrived after `clickArrivalAt` already reflects the result
// (animation started, route changed). We take the newest frame received before
// the click instead of `frames[last]` (which is post-effect). If every buffered
// frame somehow post-dates the click, the oldest frame is the closest available;
// with no arrival time we fall back to the latest frame.
export function selectPreClickFrame(frames: VideoFrame[], clickArrivalAt: number | null): string | null {
  if (!frames.length) return null;
  if (clickArrivalAt == null) return frames[frames.length - 1]!.data;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    if (frames[i]!.receivedAt < clickArrivalAt) return frames[i]!.data;
  }
  return frames[0]!.data;
}

/** Whether an `ffmpeg` binary is reachable on PATH. */
export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolveCheck) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolveCheck(false));
    child.on('close', (code) => resolveCheck(code === 0));
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (err: NodeJS.ErrnoException) => {
      rejectRun(
        err.code === 'ENOENT'
          ? new Error('ffmpeg is not installed or not on PATH; it is required to write video steps.')
          : err,
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-2000)}`));
    });
  });
}

// Keep the SINGLE longest CONTIGUOUS run of densely-spaced frames — the actual
// continuous-scroll/type burst — and drop sparse leading idle frames plus any
// trailing settle burst that arrived after the click. We split the buffer into
// contiguous runs wherever a consecutive `receivedAt` gap exceeds
// VIDEO_BURST_MAX_GAP_MS, then return the run spanning the longest duration.
// Ties (equal duration) break toward the LATER run so a genuine fast scroll
// right before the click still wins over stale motion.
export function trimToMotionBurst(frames: VideoFrame[]): VideoFrame[] {
  if (frames.length <= 2) return frames;
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = 0;
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i]!.receivedAt - frames[i - 1]!.receivedAt;
    if (gap > VIDEO_BURST_MAX_GAP_MS) {
      runs.push({ start: runStart, end: i - 1 });
      runStart = i;
    }
  }
  runs.push({ start: runStart, end: frames.length - 1 });
  let best = runs[0]!;
  let bestDuration = frames[best.end]!.receivedAt - frames[best.start]!.receivedAt;
  for (const run of runs) {
    const duration = frames[run.end]!.receivedAt - frames[run.start]!.receivedAt;
    // >= so ties resolve toward the later (more recent) run.
    if (duration >= bestDuration) {
      best = run;
      bestDuration = duration;
    }
  }
  return frames.slice(best.start, best.end + 1);
}

export async function writeVideoFromFrames(args: {
  frames: VideoFrame[];
  captureDir: string;
  index: number;
  fps: number;
}): Promise<{ videoPath: string; posterPngPath: string; naturalSize: { width: number; height: number } } | null> {
  const fps = args.fps;
  const orderedFrames = [...args.frames].sort((a, b) => a.receivedAt - b.receivedAt);
  const sampledFrames: VideoFrame[] = [];
  const firstReceivedAt = orderedFrames[0]?.receivedAt;
  if (firstReceivedAt !== undefined) {
    const frameIntervalMs = 1_000 / fps;
    let nextFrameAt = firstReceivedAt;
    for (const frame of orderedFrames) {
      if (frame.receivedAt < nextFrameAt && frame !== orderedFrames[orderedFrames.length - 1]) continue;
      sampledFrames.push(frame);
      nextFrameAt = frame.receivedAt + frameIntervalMs;
    }
  }
  // Trim to the dense motion burst BEFORE the segment-length cap so the clip is
  // the scroll motion itself, not the wide motion lookback window.
  const preTrim = sampledFrames.slice(-Math.ceil((VIDEO_MAX_SEGMENT_MS / 1_000) * fps) - 2);
  const frames = trimToMotionBurst(preTrim);
  const firstFrameAt = frames[0]?.receivedAt;
  const lastFrameAt = frames[frames.length - 1]?.receivedAt;
  const durationMs = firstFrameAt !== undefined && lastFrameAt !== undefined ? lastFrameAt - firstFrameAt : 0;
  if (frames.length < VIDEO_MIN_FRAMES || durationMs < VIDEO_MIN_DURATION_MS) {
    return null;
  }
  // Reject a frozen clip: a no-op/zero-delta scroll still emits scroll events,
  // but the screencast frames come back byte-identical. With no real visual
  // change there is no motion worth a video step.
  if (new Set(frames.map((frame) => frame.data)).size <= 1) {
    return null;
  }
  // Open with a still beat on the first frame, THEN play the motion.
  const leadHoldFrames = Math.round((VIDEO_LEAD_HOLD_MS / 1_000) * fps);
  const withLead = Array.from({ length: leadHoldFrames }, () => frames[0]!).concat(frames);
  // Hold the final frame so a brief-but-real scroll still plays long enough to
  // read as motion rather than a flicker.
  const minOutputFrames = Math.ceil((VIDEO_MIN_OUTPUT_MS / 1_000) * fps);
  const outputFrames =
    withLead.length >= minOutputFrames
      ? withLead
      : withLead.concat(
          Array.from({ length: minOutputFrames - withLead.length }, () => withLead[withLead.length - 1]!),
        );
  const dir = join(args.captureDir, `video-${String(args.index).padStart(3, '0')}`);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(dir, { recursive: true });
  for (const [i, frame] of outputFrames.entries()) {
    await writeFile(join(dir, `frame-${String(i + 1).padStart(5, '0')}.png`), Buffer.from(frame.data, 'base64'));
  }
  const posterPngPath = join(dir, 'poster.png');
  await writeFile(posterPngPath, Buffer.from(frames[0]!.data, 'base64'));
  const videoPath = join(args.captureDir, `video-${String(args.index).padStart(3, '0')}.webm`);
  await runFfmpeg([
    '-y',
    '-framerate',
    String(fps),
    '-i',
    join(dir, 'frame-%05d.png'),
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    '-deadline',
    'realtime',
    '-cpu-used',
    '6',
    videoPath,
  ]);
  const posterBytes = new Uint8Array(await readFile(posterPngPath));
  return {
    videoPath,
    posterPngPath,
    naturalSize: readPngSize(posterBytes) ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  };
}

/**
 * Commit an image step from already-captured PNG bytes + metadata, without
 * touching the live page. Used to record the page as it looked AT CLICK TIME
 * (the last screencast frame of the source page) so the screenshot, pointer,
 * and label all describe the same page — instead of stamping a source-page
 * click onto the post-navigation destination screenshot.
 */
export async function captureImageStepFromData(
  state: CaptureSession,
  pngBase64: string,
  meta: CaptureMetadata,
  clickOverride: CaptureClick | null,
): Promise<CaptureSession> {
  if (!state.captureDir) throw new Error('capture session has no captureDir');
  const bytes = Buffer.from(pngBase64, 'base64');
  const index = (state.screens?.length ?? 0) + 1;
  const pngPath = join(state.captureDir, `screen-${String(index).padStart(3, '0')}.png`);
  await mkdir(state.captureDir, { recursive: true });
  await writeFile(pngPath, bytes);
  const naturalSize = readPngSize(bytes) ?? meta.viewport;
  const next: CaptureSession = {
    ...state,
    screens: [
      ...(state.screens ?? []),
      {
        kind: 'image',
        pngPath,
        viewport: meta.viewport,
        naturalSize,
        sourceUrl: meta.sourceUrl,
        title: meta.title,
        click: clickOverride,
        scroll: meta.scroll,
        capturedAt: new Date().toISOString(),
      },
    ],
    tabUrl: meta.sourceUrl,
  };
  await writeSession(next);
  return next;
}

export async function captureVideoStep(
  state: CaptureSession,
  frames: VideoFrame[],
  clickOverride?: CaptureClick | null,
  metaOverride?: CaptureMetadata,
  fallbackPngBase64?: string | null,
): Promise<CaptureSession> {
  if (!state.captureDir) throw new Error('capture session has no captureDir');
  // The motion frames are all from the source page, so prefer the source-page
  // metadata captured at click time. Only attach to the live page when no
  // override was supplied.
  let meta = metaOverride ?? null;
  let cdp: Cdp | null = null;
  try {
    if (!meta) {
      cdp = new Cdp(state.browserWsUrl);
      const sessionId = await attachToTarget(cdp, state.targetId);
      await cdp.send('Page.enable', {}, sessionId).catch(() => undefined);
      await cdp.send('Runtime.enable', {}, sessionId).catch(() => undefined);
      await installRecorder(cdp, sessionId);
      await resizeTargetContentViewport(cdp, sessionId, state.targetId, state.width, state.height);
      meta = await readCaptureMetadata(cdp, sessionId);
      await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
    }
    const index = (state.screens?.length ?? 0) + 1;
    const fps = state.headless ? VIDEO_HEADLESS_FPS : VIDEO_FPS;
    const video = await writeVideoFromFrames({ frames, captureDir: state.captureDir, index, fps });
    if (!video) {
      // Motion was too brief for a readable clip — fall back to a still image
      // of the source page rather than a sub-second flicker.
      if (fallbackPngBase64 && metaOverride) {
        return captureImageStepFromData(state, fallbackPngBase64, metaOverride, clickOverride ?? null);
      }
      return captureStep(state, undefined, clickOverride, 'click');
    }
    const next: CaptureSession = {
      ...state,
      screens: [
        ...(state.screens ?? []),
        {
          kind: 'video',
          pngPath: video.posterPngPath,
          videoPath: video.videoPath,
          posterPngPath: video.posterPngPath,
          viewport: meta.viewport,
          naturalSize: video.naturalSize,
          sourceUrl: meta.sourceUrl,
          title: meta.title,
          click: clickOverride ?? meta.click,
          scroll: meta.scroll,
          capturedAt: new Date().toISOString(),
        },
      ],
      tabUrl: meta.sourceUrl,
    };
    await writeSession(next);
    return next;
  } finally {
    cdp?.close();
  }
}

export async function captureStep(
  state: CaptureSession,
  label?: string,
  clickOverride?: CaptureClick | null,
  eventType: 'click' | 'input' | 'scroll' = 'click',
): Promise<CaptureSession> {
  if (!state.captureDir) throw new Error('capture session has no captureDir');
  const cdp = new Cdp(state.browserWsUrl);
  try {
    const sessionId = await attachToTarget(cdp, state.targetId);
    await cdp.send('Page.enable', {}, sessionId).catch(() => undefined);
    await cdp.send('Runtime.enable', {}, sessionId).catch(() => undefined);
    await installRecorder(cdp, sessionId);
    await resizeTargetContentViewport(cdp, sessionId, state.targetId, state.width, state.height);
    const meta = await readCaptureMetadata(cdp, sessionId);
    const result = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', fromSurface: true, captureBeyondViewport: false },
      sessionId,
    );
    const data = result.data;
    if (typeof data !== 'string') throw new Error('Page.captureScreenshot returned no data');
    const bytes = Buffer.from(data, 'base64');
    const index = (state.screens?.length ?? 0) + 1;
    const pngPath = join(state.captureDir, `screen-${String(index).padStart(3, '0')}.png`);
    await mkdir(state.captureDir, { recursive: true });
    await writeFile(pngPath, bytes);
    const naturalSize = readPngSize(bytes) ?? meta.viewport;
    const clickSource = eventType === 'click' ? (clickOverride ?? meta.click) : null;
    const click =
      label && eventType === 'click'
        ? {
            ...(clickSource ?? { x: 0.5, y: 0.5 }),
            label,
          }
        : clickSource;
    const next: CaptureSession = {
      ...state,
      screens: [
        ...(state.screens ?? []),
        {
          kind: 'image',
          pngPath,
          viewport: meta.viewport,
          naturalSize,
          sourceUrl: meta.sourceUrl,
          title: meta.title,
          click,
          scroll: meta.scroll,
          capturedAt: new Date().toISOString(),
        },
      ],
      tabUrl: meta.sourceUrl,
    };
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
    await writeSession(next);
    return next;
  } finally {
    cdp.close();
  }
}
