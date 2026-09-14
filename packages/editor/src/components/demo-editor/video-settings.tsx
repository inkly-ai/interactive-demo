import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { putDemoAssetBlob } from "@/lib/assets/client-demo-upload";
import { resolveEditorAssetUrl } from "@/lib/demo-resource-paths";
import {
  FIT_OPTIONS,
  loadMediaBlob,
  POSITION_GRID,
  type MediaSettingsButtonProps,
  type ObjectFit,
  type ObjectPosition,
  type VideoContentStep,
} from "@/components/demo-editor/media-settings-shared";

// ─── browser-side video trimming + scrubber filmstrip ──────────────────────

const MIN_TRIM_SECONDS = 0.25;
const VIDEO_MIME_OPTIONS = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

type VideoTrimResult = {
  videoBlob: Blob;
  posterBlob: Blob;
  width: number;
  height: number;
  contentType: string;
};

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function bestVideoMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of VIDEO_MIME_OPTIONS) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function extensionForVideoMime(mime: string): string {
  const clean = mime.toLowerCase().split(";")[0]?.trim();
  if (clean === "video/mp4") return "mp4";
  if (clean === "video/ogg") return "ogv";
  return "webm";
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${m}:${s.toString().padStart(2, "0")}.${t}`;
}

function clampTrimValue(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(duration, 0));
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video ${eventName}.`));
    }, 15_000);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not decode this video."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, time);
  if (Math.abs(video.currentTime - target) < 0.03) return;
  const seeked = waitForVideoEvent(video, "seeked");
  video.currentTime = target;
  await seeked;
}

// MediaRecorder-produced WebM files (what `hardTrimVideoInBrowser` writes) omit
// the duration from their header, so `video.duration` reads `Infinity` until the
// playhead is forced past the end. Seek to a huge time, wait for the browser to
// compute the real duration, then rewind. Falls back to 0 if it can't resolve.
function resolveMediaDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(video.duration);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeEventListener("durationchange", onDurationChange);
      try {
        video.currentTime = 0;
      } catch {
        // ignore — rewinding is best-effort
      }
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const onDurationChange = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish(video.duration);
      }
    };
    const timeout = window.setTimeout(() => finish(0), 5_000);
    video.addEventListener("durationchange", onDurationChange);
    try {
      video.currentTime = 1e101;
    } catch {
      finish(0);
    }
  });
}

// `drawImage` only yields pixels once the element holds a decoded frame. After a
// seek to ~0 (the default "trim the end" case), `seekVideo` early-returns while
// the video is still at HAVE_METADATA, so the poster canvas would capture a
// blank frame. Wait for a painted frame before sampling.
async function waitForDecodedFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState < 2 /* HAVE_CURRENT_DATA */) {
    await new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        video.removeEventListener("loadeddata", done);
        resolve();
      };
      const timer = window.setTimeout(done, 3_000);
      video.addEventListener("loadeddata", done, { once: true });
    });
  }
  const rvfc = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }
  ).requestVideoFrameCallback?.bind(video);
  if (!rvfc) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 200);
    rvfc(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function videoPosterBlob(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode video poster."));
    }, "image/png");
  });
}

async function hardTrimVideoInBrowser(args: {
  src: string;
  /** Pre-fetched source bytes, if the caller already loaded them — avoids a
   *  re-fetch over the non-rangeable draft file route. */
  sourceBlob?: Blob | null;
  startSeconds: number;
  endSeconds: number;
  onProgress?: (progress: number) => void;
}): Promise<VideoTrimResult> {
  const mimeType = bestVideoMimeType();
  if (!mimeType) {
    throw new Error("This browser cannot record trimmed video assets.");
  }

  const sourceBlob =
    args.sourceBlob ?? (await loadMediaBlob(args.src, "video"));
  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement("video") as CapturableVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  video.style.position = "fixed";
  video.style.left = "-1px";
  video.style.top = "-1px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";

  let raf = 0;
  let timeout = 0;
  let stream: MediaStream | null = null;

  try {
    document.body.appendChild(video);
    await waitForVideoEvent(video, "loadedmetadata");

    const duration = await resolveMediaDuration(video);
    const start = clampTrimValue(args.startSeconds, duration);
    const end = clampTrimValue(args.endSeconds, duration);
    if (end - start < MIN_TRIM_SECONDS) {
      throw new Error("Trim range is too short.");
    }

    await seekVideo(video, start);
    await waitForDecodedFrame(video);
    const posterBlob = await videoPosterBlob(video);

    stream = video.captureStream?.() ?? video.mozCaptureStream?.() ?? null;
    if (!stream || stream.getVideoTracks().length === 0) {
      throw new Error("This browser cannot capture the video stream.");
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });

    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        reject(new Error("Video recording failed."));
      };
      recorder.onstop = () => {
        if (chunks.length === 0) {
          reject(new Error("Trimmed video recording was empty."));
          return;
        }
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (timeout) window.clearTimeout(timeout);
      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
    };

    const tick = () => {
      const elapsed = Math.max(0, video.currentTime - start);
      const total = Math.max(MIN_TRIM_SECONDS, end - start);
      args.onProgress?.(Math.min(elapsed / total, 1));
      if (video.currentTime >= end || video.ended) {
        stop();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    await video.play();
    recorder.start(250);
    raf = window.requestAnimationFrame(tick);
    timeout = window.setTimeout(stop, Math.ceil((end - start + 1) * 1000));

    const videoBlob = await recording;
    args.onProgress?.(1);
    return {
      videoBlob,
      posterBlob,
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
      contentType: mimeType.split(";")[0]?.trim() || "video/webm",
    };
  } finally {
    if (raf) window.cancelAnimationFrame(raf);
    if (timeout) window.clearTimeout(timeout);
    stream?.getTracks().forEach((track) => track.stop());
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}

type VideoTrimDialogProps = Omit<MediaSettingsButtonProps, "step"> & {
  step: VideoContentStep;
};

export function VideoTrimDialog({
  step,
  onChange,
  slug,
  assets,
  onAssetsChanged,
  onAssetUploaded,
  stageAspect,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: VideoTrimDialogProps) {
  const bg = step.background;
  const resolvedBgSrc = resolveEditorAssetUrl(assets, bg.src, {
    demoSlug: slug,
  });
  const resolvedPosterSrc = bg.posterSrc
    ? resolveEditorAssetUrl(assets, bg.posterSrc, {
        demoSlug: slug,
      })
    : null;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafRef = useRef(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [paused, setPaused] = useState(true);
  const [trimProgress, setTrimProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"trim" | "align">("trim");
  // Preview off a `blob:` object URL rather than `resolvedBgSrc` directly.
  // The same-origin draft file route serves videos with status 200 and no
  // `Accept-Ranges`, so a `<video>` pointed at it cannot seek — and WebM
  // captures (whose header omits duration) need a seek-to-end to resolve
  // their duration, which silently times out to 0. An in-memory blob URL
  // supports seeking, so duration/scrubbing work and the trim canvas stays
  // untainted (same origin). We reuse the fetched blob for the trim itself.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const sourceBlobRef = useRef<Blob | null>(null);
  // Real frames sampled across the video for the scrubber filmstrip (instead
  // of tiling a single poster frame). Generated off the same in-memory blob.
  const [filmstrip, setFilmstrip] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setVideoDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setPaused(true);
    setTrimProgress(null);
    setError(null);
    setMode("trim");
    setFilmstrip(null);
  }, [open, resolvedBgSrc]);

  // Alignment controls mirror the image dialog: object-fit + anchor are
  // written straight back to the video background (undefined === default,
  // so a default selection drops the key rather than persisting it).
  const fit: ObjectFit = (bg.objectFit ?? "contain") as ObjectFit;
  const position: ObjectPosition = (bg.objectPosition ??
    "center center") as ObjectPosition;
  const setFit = (next: ObjectFit) => {
    onChange({
      background: {
        ...bg,
        objectFit: next === "contain" ? undefined : next,
      },
    });
  };
  const setPosition = (next: ObjectPosition) => {
    onChange({
      background: {
        ...bg,
        objectPosition: next === "center center" ? undefined : next,
      },
    });
  };

  useEffect(() => {
    if (!open || !resolvedBgSrc) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    sourceBlobRef.current = null;
    setPreviewSrc(null);
    void loadMediaBlob(resolvedBgSrc, "video")
      .then((blob) => {
        if (cancelled) return;
        sourceBlobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[image-settings] video load failed", err);
        setError(
          err instanceof Error ? err.message : "Couldn't load this video.",
        );
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      sourceBlobRef.current = null;
      setPreviewSrc(null);
    };
  }, [open, resolvedBgSrc]);

  // Sample evenly-spaced frames off the in-memory blob to build a real
  // filmstrip for the scrubber. Uses a throwaway offscreen <video>, so it
  // never disturbs the visible preview's playback/seek state.
  useEffect(() => {
    if (!open || !previewSrc || videoDuration <= 0) return;
    let cancelled = false;
    setFilmstrip(null);
    void extractFilmstripFrames(previewSrc, videoDuration, () => cancelled)
      .then((frames) => {
        if (!cancelled && frames.length > 0) setFilmstrip(frames);
      })
      .catch((err) => {
        console.warn("[image-settings] filmstrip failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [open, previewSrc, videoDuration]);

  useEffect(() => {
    return () => {
      if (seekRafRef.current) {
        window.cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = 0;
      }
    };
  }, []);

  const syncVideoDuration = (duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    setVideoDuration(duration);
    setTrimStart((current) => clampTrimValue(current, duration));
    setTrimEnd((current) => {
      if (current <= 0 || current > duration) return duration;
      return Math.max(current, MIN_TRIM_SECONDS);
    });
  };

  const flushPendingSeek = useCallback(() => {
    seekRafRef.current = 0;
    const video = videoRef.current;
    const target = pendingSeekRef.current;
    if (!video || target == null) return;
    pendingSeekRef.current = null;
    if (Math.abs(video.currentTime - target) > 0.025) {
      video.currentTime = target;
    }
  }, []);

  const scheduleVideoSeek = useCallback(
    (next: number) => {
      pendingSeekRef.current = next;
      if (seekRafRef.current) return;
      seekRafRef.current = window.requestAnimationFrame(flushPendingSeek);
    },
    [flushPendingSeek],
  );

  const seekPreview = (next: number) => {
    const video = videoRef.current;
    const clamped = clampTrimValue(next, videoDuration);
    if (video && !video.paused) video.pause();
    setCurrentTime(clamped);
    scheduleVideoSeek(clamped);
  };

  const beginScrub = () => {
    scrubbingRef.current = true;
    videoRef.current?.pause();
  };

  const endScrub = () => {
    scrubbingRef.current = false;
    flushPendingSeek();
  };

  const setTrimStartValue = (next: number) => {
    const max = Math.max(0, (trimEnd || videoDuration) - MIN_TRIM_SECONDS);
    const clamped = Math.min(clampTrimValue(next, videoDuration), max);
    setTrimStart(clamped);
    if (currentTime < clamped) seekPreview(clamped);
  };

  const setTrimEndValue = (next: number) => {
    const min = Math.min(videoDuration, trimStart + MIN_TRIM_SECONDS);
    const clamped = Math.max(clampTrimValue(next, videoDuration), min);
    setTrimEnd(clamped);
    if (currentTime > clamped) seekPreview(clamped);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !videoDuration) return;
    if (video.paused || video.ended) {
      if (
        video.currentTime < trimStart ||
        video.currentTime >= effectiveTrimEnd
      ) {
        video.currentTime = trimStart;
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const applyTrim = async () => {
    const effectiveEnd = trimEnd || videoDuration;
    if (!videoDuration || effectiveEnd - trimStart < MIN_TRIM_SECONDS) {
      setError("Choose a longer trim range.");
      return;
    }
    const mimeType = bestVideoMimeType();
    if (!mimeType) {
      setError("This browser can't create trimmed video files.");
      return;
    }

    setBusy(true);
    setError(null);
    setTrimProgress(0);
    try {
      const result = await hardTrimVideoInBrowser({
        src: previewSrc ?? resolvedBgSrc,
        sourceBlob: sourceBlobRef.current,
        startSeconds: trimStart,
        endSeconds: effectiveEnd,
        onProgress: setTrimProgress,
      });
      const stamp = Date.now().toString(36);
      const ext = extensionForVideoMime(result.contentType);
      const videoCommit = await putDemoAssetBlob({
        slug,
        blob: result.videoBlob,
        path: `assets/trim-${step.id}-${stamp}.${ext}`,
        contentType: result.contentType,
        kind: "video",
      });
      if (!videoCommit.path) {
        throw new Error("Saved trim did not return an asset id.");
      }

      const posterCommit = await putDemoAssetBlob({
        slug,
        blob: result.posterBlob,
        path: `assets/trim-${step.id}-${stamp}-poster.png`,
        contentType: "image/png",
        kind: "image",
      });
      if (!posterCommit.path) {
        throw new Error("Saved poster did not return a file path.");
      }

      onAssetUploaded?.(videoCommit.asset);
      onAssetUploaded?.(posterCommit.asset);
      onAssetsChanged();
      onChange({
        background: {
          type: "video",
          src: videoCommit.path,
          posterSrc: posterCommit.path,
          naturalWidth: result.width,
          naturalHeight: result.height,
          alt: bg.alt,
          sourceUrl: bg.sourceUrl,
          title: bg.title,
          autoplay: bg.autoplay,
          muted: bg.muted,
          objectFit: bg.objectFit,
          objectPosition: bg.objectPosition,
        },
      });
      setOpen(false);
    } catch (err) {
      console.error("[image-settings] trim failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't trim this video. Please try again.",
      );
    } finally {
      setBusy(false);
      setTrimProgress(null);
    }
  };

  const effectiveTrimEnd = trimEnd || videoDuration;

  // Drive the playhead off requestAnimationFrame while playing. The native
  // `timeupdate` event only fires ~4x/sec, which makes the scrubber jump in a
  // handful of discrete steps; reading currentTime every frame is smooth.
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && !scrubbingRef.current) {
        const next = video.currentTime;
        if (next >= effectiveTrimEnd) {
          video.pause();
          video.currentTime = effectiveTrimEnd;
          setCurrentTime(effectiveTrimEnd);
          return;
        }
        setCurrentTime(next);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [paused, effectiveTrimEnd]);

  // Spacebar toggles playback while the trim preview is open. Keep the handler
  // pointed at the latest `togglePlay` closure without re-binding every render.
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  useEffect(() => {
    if (!open || mode !== "trim") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      togglePlayRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, mode]);

  const trimChanged =
    videoDuration > 0 &&
    (trimStart > 0.05 || effectiveTrimEnd < videoDuration - 0.05);
  const trimSupported =
    typeof MediaRecorder !== "undefined" &&
    bestVideoMimeType() !== null &&
    typeof document !== "undefined";
  const markerTime =
    videoDuration > 0
      ? Math.min(Math.max(currentTime, trimStart), effectiveTrimEnd)
      : 0;
  const videoAspect =
    bg.naturalWidth > 0 && bg.naturalHeight > 0
      ? bg.naturalWidth / bg.naturalHeight
      : 16 / 9;

  return (
    <>
      {hideTrigger ? null : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          title="Trim this video step"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Video settings</DialogTitle>
          </DialogHeader>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "trim" | "align")}
          >
            <TabsList variant="default" className="w-full">
              <TabsTrigger value="trim" className="flex-1">
                Trim
              </TabsTrigger>
              <TabsTrigger value="align" className="flex-1">
                Alignment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trim" className="mt-3 space-y-3">
              <div className="grid min-h-0 gap-3">
                <div className="flex justify-center">
                  <div
                    className="relative w-full max-w-[760px] overflow-hidden rounded-md border border-[color:var(--line-soft)] bg-[#0b1118]"
                    style={{
                      aspectRatio: Math.max(videoAspect, 2.35),
                      maxHeight: "300px",
                    }}
                  >
                    <video
                      ref={videoRef}
                      key={previewSrc ?? resolvedBgSrc}
                      src={previewSrc ?? undefined}
                      poster={resolvedPosterSrc ?? undefined}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 h-full w-full object-cover object-top"
                      onError={() => {
                        if (previewSrc) {
                          setError("Couldn't decode this video.");
                        }
                      }}
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        setCurrentTime(video.currentTime);
                        void resolveMediaDuration(video).then(
                          syncVideoDuration,
                        );
                      }}
                      onTimeUpdate={(event) => {
                        const next = event.currentTarget.currentTime;
                        if (next >= effectiveTrimEnd) {
                          event.currentTarget.pause();
                          event.currentTarget.currentTime = effectiveTrimEnd;
                          if (!scrubbingRef.current) {
                            setCurrentTime(effectiveTrimEnd);
                          }
                          return;
                        }
                        if (!scrubbingRef.current) {
                          setCurrentTime(next);
                        }
                      }}
                      onPlay={() => setPaused(false)}
                      onPause={() => setPaused(true)}
                      onEnded={() => setPaused(true)}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface)] shadow-[var(--shadow-press)]">
                  <div className="flex h-10 items-center justify-between border-b border-[color:var(--line-soft)] px-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={togglePlay}
                        disabled={!videoDuration || busy}
                        aria-label={paused ? "Play video" : "Pause video"}
                      >
                        {paused ? (
                          <PlayIcon className="size-4" />
                        ) : (
                          <PauseIcon className="size-4" />
                        )}
                      </Button>
                    </div>
                    <div className="font-mono text-[13px] font-semibold tabular-nums text-[color:var(--ink-2)]">
                      {formatSeconds(markerTime)} /{" "}
                      {formatSeconds(videoDuration)}
                    </div>
                    <div className="w-16" />
                  </div>

                  <TrimTimeline
                    duration={videoDuration}
                    currentTime={markerTime}
                    start={trimStart}
                    end={effectiveTrimEnd}
                    posterSrc={resolvedPosterSrc}
                    frames={filmstrip}
                    disabled={busy || !videoDuration}
                    onSeek={seekPreview}
                    onStartChange={setTrimStartValue}
                    onEndChange={setTrimEndValue}
                    onScrubStart={beginScrub}
                    onScrubEnd={endScrub}
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                  <div className="grid gap-1.5">
                    {trimProgress !== null ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--line-soft)]">
                        <div
                          className="h-full bg-[color:var(--accent)] transition-[width]"
                          style={{
                            width: `${Math.round(trimProgress * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                    {!trimSupported ? (
                      <p className="text-[11px] text-destructive">
                        This browser cannot create trimmed video files.
                      </p>
                    ) : null}
                    {error ? (
                      <p className="break-words text-[11px] text-destructive">
                        {error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpen(false)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => void applyTrim()}
                      disabled={
                        busy || !trimSupported || !videoDuration || !trimChanged
                      }
                    >
                      {busy ? "Trimming..." : "Apply trim"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="align" className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Player preview
                </p>
                <div className="flex justify-center rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2">
                  <div
                    className="relative w-full overflow-hidden rounded-sm bg-[#0b1118] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{ aspectRatio: stageAspect }}
                  >
                    {resolvedPosterSrc ? (
                      <img
                        src={resolvedPosterSrc}
                        alt={bg.alt ?? ""}
                        draggable={false}
                        className="absolute inset-0 h-full w-full select-none"
                        style={{
                          objectFit: fit,
                          objectPosition: fit === "fill" ? undefined : position,
                        }}
                      />
                    ) : (
                      <video
                        src={previewSrc ?? undefined}
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 h-full w-full"
                        style={{
                          objectFit: fit,
                          objectPosition: fit === "fill" ? undefined : position,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fit
                  </p>
                  <div className="flex gap-1">
                    {FIT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFit(opt.value)}
                        className={cn(
                          "cursor-pointer flex-1 rounded-md border px-2 py-1.5 text-[12px] transition",
                          fit === opt.value
                            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                            : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-2)] hover:border-[color:var(--accent)]",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Anchor
                  </p>
                  <div
                    className={cn(
                      "grid w-fit gap-0.5 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1",
                      fit === "fill" && "opacity-50",
                    )}
                    style={{
                      gridTemplateColumns: "repeat(3, 1fr)",
                    }}
                  >
                    {POSITION_GRID.map((p) => {
                      const [hx, vy] = p.value.split(" ") as [
                        "left" | "center" | "right",
                        "top" | "center" | "bottom",
                      ];
                      const cellAlign = {
                        left: "items-start",
                        center: "items-center",
                        right: "items-end",
                      }[hx];
                      const cellJustify = {
                        top: "justify-start",
                        center: "justify-center",
                        bottom: "justify-end",
                      }[vy];
                      const active = position === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPosition(p.value)}
                          disabled={fit === "fill"}
                          title={p.label}
                          className={cn(
                            "flex h-6 w-6 cursor-pointer flex-col rounded-sm border transition disabled:cursor-not-allowed",
                            cellAlign,
                            cellJustify,
                            active
                              ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15"
                              : "border-[color:var(--line-soft)] bg-[color:var(--surface)] hover:border-[color:var(--accent)]",
                          )}
                        >
                          <span
                            className={cn(
                              "block h-1 w-1 rounded-[1px]",
                              active
                                ? "bg-[color:var(--accent)]"
                                : "bg-[color:var(--ink-2)]",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Pixel size each scrubber frame is rasterized at. The hover preview reuses
// this exact ratio so the strip and the floating preview are always the same
// shape (and never re-crop each other).
const FRAME_W = 100;
const FRAME_H = 64;

// Decode a handful of evenly-spaced frames from a video blob URL into JPEG
// data URLs for the scrubber filmstrip. Runs on a throwaway <video>/<canvas>
// so it never touches the visible preview. `isCancelled` lets the caller bail
// mid-extraction (dialog closed / source swapped).
async function extractFilmstripFrames(
  src: string,
  duration: number,
  isCancelled: () => boolean,
): Promise<string[]> {
  if (typeof document === "undefined" || duration <= 0) return [];
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onError = () => reject(new Error("Couldn't decode video frames."));
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
    if (isCancelled()) return [];

    // Capture a top-anchored "cover" crop of each frame — the same framing the
    // player uses (object-cover / object-top). This fully paints the canvas
    // (no transparent area that JPEG would flatten to black) and zooms past any
    // letterbox baked into the source so the strip matches the preview.
    const targetW = FRAME_W;
    const targetH = FRAME_H;
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const vw = video.videoWidth > 0 ? video.videoWidth : 16;
    const vh = video.videoHeight > 0 ? video.videoHeight : 9;
    const coverScale = Math.max(targetW / vw, targetH / vh);
    const drawW = vw * coverScale;
    const drawH = vh * coverScale;
    const drawX = (targetW - drawW) / 2; // center horizontally
    const drawY = 0; // anchor to top, like object-top

    // Roughly one frame per ~36px of a 560px-wide track, clamped to a sane
    // range so very short and very long clips both stay legible.
    const count = Math.max(8, Math.min(16, Math.round(duration * 2)));
    const seekTo = (time: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => resolve();
        video.addEventListener("seeked", onSeeked, { once: true });
        video.currentTime = Math.min(Math.max(time, 0), Math.max(0, duration - 0.05));
      });

    const frames: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (isCancelled()) return frames;
      await seekTo(duration * ((i + 0.5) / count));
      if (isCancelled()) return frames;
      ctx.drawImage(video, drawX, drawY, drawW, drawH);
      frames.push(canvas.toDataURL("image/jpeg", 0.62));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function TrimTimeline({
  duration,
  currentTime,
  start,
  end,
  posterSrc,
  frames,
  disabled,
  onSeek,
  onStartChange,
  onEndChange,
  onScrubStart,
  onScrubEnd,
}: {
  duration: number;
  currentTime: number;
  start: number;
  end: number;
  posterSrc: string | null;
  frames: string[] | null;
  disabled?: boolean;
  onSeek: (next: number) => void;
  onStartChange: (next: number) => void;
  onEndChange: (next: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<"start" | "end" | "seek" | null>(null);
  // YouTube-style hover scrub: position (0–1) of the cursor over the track,
  // used to float a frame preview + timestamp above it.
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  // Adapt the tick spacing to the clip length: short clips get sub-second
  // ticks (labelled to a tenth, e.g. "1.5s") so a 2-second video isn't just
  // "0s 1s 2s"; longer clips fall back to whole-second (or coarser) ticks.
  const tickStep =
    duration <= 0
      ? 1
      : duration <= 1.2
        ? 0.2
        : duration <= 3
          ? 0.5
          : duration <= 6
            ? 1
            : Math.ceil(duration / 6);
  const tickValues =
    duration > 0
      ? (() => {
          const values: number[] = [];
          // Stop half a step short of the end so the exact-duration tick we
          // append next never collides with a regular tick.
          for (let t = 0; t <= duration - tickStep * 0.5; t += tickStep) {
            values.push(Number(t.toFixed(3)));
          }
          values.push(duration);
          return values;
        })()
      : [0];
  const ticks = tickValues.map((value) => ({
    value,
    left:
      duration > 0
        ? `${(clampTrimValue(value, duration) / duration) * 100}%`
        : "0%",
    label: tickStep < 1 ? `${value.toFixed(1)}s` : `${Math.round(value)}s`,
  }));
  const toPercent = (value: number) =>
    duration > 0
      ? `${(clampTrimValue(value, duration) / duration) * 100}%`
      : "0%";
  const valueFromPointer = useCallback(
    (clientX: number) => {
      const box = trackRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || duration <= 0) return 0;
      const ratio = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const value = valueFromPointer(event.clientX);
      if (drag === "start") onStartChange(value);
      else if (drag === "end") onEndChange(value);
      else onSeek(value);
      event.preventDefault();
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        onScrubEnd?.();
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [
    duration,
    onEndChange,
    onScrubEnd,
    onSeek,
    onStartChange,
    valueFromPointer,
  ]);

  const startDrag =
    (kind: "start" | "end" | "seek") =>
    (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
      if (disabled) return;
      dragRef.current = kind;
      onScrubStart?.();
      const value = valueFromPointer(event.clientX);
      if (kind === "start") onStartChange(value);
      else if (kind === "end") onEndChange(value);
      else onSeek(value);
      event.preventDefault();
      event.stopPropagation();
    };

  const updateHover = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    setHoverRatio(
      Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
    );
  };

  const hoverFrame =
    hoverRatio !== null && frames && frames.length > 0
      ? frames[
          Math.min(
            frames.length - 1,
            Math.max(0, Math.floor(hoverRatio * frames.length)),
          )
        ]
      : null;

  return (
    <div className="grid gap-1 px-3 py-2.5">
      <div className="relative h-5 text-[10px] font-medium tabular-nums text-muted-foreground">
        {ticks.map((tick) => (
          <div
            key={tick.left}
            className="absolute top-0 -translate-x-1/2"
            style={{ left: tick.left }}
          >
            <span>{tick.label}</span>
            <span className="mx-auto mt-1 block h-2 w-px bg-[color:var(--line)]" />
          </div>
        ))}
      </div>
      <div className="relative">
        {hoverRatio !== null ? (
          <div
            className="pointer-events-none absolute bottom-[calc(100%+8px)] z-30 flex -translate-x-1/2 flex-col items-center gap-1"
            // Clamp the centred preview (112px wide → 56px half) inside the
            // track so it can't overflow into — and get clipped by — the
            // dialog's scroll container near the start/end.
            style={{
              left: `clamp(56px, ${hoverRatio * 100}%, calc(100% - 56px))`,
            }}
          >
            {hoverFrame ? (
              <img
                src={hoverFrame}
                alt=""
                draggable={false}
                className="w-[112px] rounded-md border-2 border-white object-cover shadow-[0_4px_16px_rgba(0,0,0,0.28)]"
                style={{ aspectRatio: FRAME_W / FRAME_H }}
              />
            ) : null}
            <span className="rounded bg-[#111827] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow">
              {formatSeconds(hoverRatio * duration)}
            </span>
          </div>
        ) : null}
        <div
          ref={trackRef}
          onPointerDown={startDrag("seek")}
          onPointerMove={updateHover}
          onPointerLeave={() => setHoverRatio(null)}
          className={cn(
            "relative h-12 overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)]",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
        >
        {frames && frames.length > 0 ? (
          <div aria-hidden className="absolute inset-0 flex">
            {frames.map((frame, index) => (
              <img
                key={index}
                src={frame}
                alt=""
                draggable={false}
                className="h-full min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: posterSrc
                ? `url("${posterSrc}")`
                : "linear-gradient(90deg,#eef1f6,#d9dee7 40%,#eef1f6)",
              backgroundRepeat: "repeat-x",
              backgroundSize: "112px 180%",
              backgroundPosition: "center top",
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-white/65 backdrop-brightness-75"
          style={{ width: toPercent(start) }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 bg-white/65 backdrop-brightness-75"
          style={{
            left: toPercent(end),
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 rounded-md border-2 border-[color:var(--accent)] shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
          style={{
            left: toPercent(start),
            right:
              duration > 0
                ? `${100 - (clampTrimValue(end, duration) / duration) * 100}%`
                : "100%",
          }}
        />
        <button
          type="button"
          aria-label="Trim start"
          disabled={disabled}
          onPointerDown={startDrag("start")}
          className="absolute top-1/2 z-10 h-11 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-[color:var(--accent)] shadow-[0_1px_8px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed"
          style={{ left: toPercent(start) }}
        />
        <button
          type="button"
          aria-label="Trim end"
          disabled={disabled}
          onPointerDown={startDrag("end")}
          className="absolute top-1/2 z-10 h-11 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-[color:var(--accent)] shadow-[0_1px_8px_rgba(0,0,0,0.25)] disabled:cursor-not-allowed"
          style={{ left: toPercent(end) }}
        />
        {hoverRatio !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-[8] w-px -translate-x-1/2 bg-white/80 mix-blend-difference"
            style={{ left: `${hoverRatio * 100}%` }}
          />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-y-0 z-[9] w-0.5 -translate-x-1/2 bg-[#111827]"
          style={{ left: toPercent(currentTime) }}
        />
        </div>
      </div>
    </div>
  );
}
