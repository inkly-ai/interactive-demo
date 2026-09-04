import { useEffect, useRef, useState } from "react";
import {
    ChevronDownIcon,
    FolderOpenIcon,
    Mic2Icon,
    MicIcon,
    MicOffIcon,
    PauseIcon,
    PlayIcon,
    SquareIcon,
    Trash2Icon,
    Volume2Icon,
    VolumeXIcon,
} from "lucide-react";
import type { Step } from "@inkly-org/interactive-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { ToolbarCountPill } from "@/components/demo-editor/toolbar-count-pill";
import { type AssetMeta } from "@/lib/assets";
import { putDemoAssetBlob } from "@/lib/assets/client-demo-upload";
import { isAudioAsset } from "./media-measure";
import {
    MediaAssetPickerDialog,
    type MediaPickResult,
    type MediaUploader,
} from "./inspectors";

export function splitSentencesClient(text: string): string[] {
    const matches = text.match(/[^.!?…\n]+[.!?…]?[\s]*/g);
    const chunks = (matches ?? [text])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return chunks.length > 0 ? chunks : [text.trim()];
}

/**
 * Read the duration of an audio file in seconds via a hidden `<audio>`
 * element. Resolves to `null` if the metadata fails to load.
 */
export function probeAudioDuration(src: string): Promise<number | null> {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = "metadata";
        audio.crossOrigin = "anonymous";
        const cleanup = () => {
            audio.removeEventListener("loadedmetadata", onLoad);
            audio.removeEventListener("error", onError);
        };
        const onLoad = () => {
            const d = Number.isFinite(audio.duration) ? audio.duration : null;
            cleanup();
            resolve(d && d > 0 ? d : null);
        };
        const onError = () => {
            cleanup();
            resolve(null);
        };
        audio.addEventListener("loadedmetadata", onLoad);
        audio.addEventListener("error", onError);
        audio.src = src;
    });
}

function AudioPreview({
    src,
    preload = "none",
}: {
    src: string;
    preload?: "none" | "metadata" | "auto";
}) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = 0.5;
        setPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, [src]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = muted;
        }
    }, [muted]);

    const togglePlayback = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            setPlaying(false);
            return;
        }
        void audio
            .play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
    };

    const toggleMuted = () => {
        const next = !muted;
        setMuted(next);
        if (audioRef.current) {
            audioRef.current.muted = next;
        }
    };

    const scrub = (nextTime: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(nextTime)) return;
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    const maxTime = duration || 0;

    return (
        <div className="flex h-8 w-full items-center gap-2 rounded-full bg-[color:var(--surface)] px-2 shadow-[var(--shadow-press)]">
            <audio
                ref={audioRef}
                src={src}
                preload={preload}
                onLoadedMetadata={(event) => {
                    const nextDuration = event.currentTarget.duration;
                    setDuration(
                        Number.isFinite(nextDuration) && nextDuration > 0
                            ? nextDuration
                            : 0,
                    );
                }}
                onTimeUpdate={(event) =>
                    setCurrentTime(event.currentTarget.currentTime)
                }
                onPause={() => setPlaying(false)}
                onEnded={() => {
                    setPlaying(false);
                    setCurrentTime(duration);
                }}
                className="hidden"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 rounded-full"
                onClick={togglePlayback}
                aria-label={playing ? "Pause audio" : "Play audio"}
            >
                {playing ? (
                    <PauseIcon className="size-3.5" />
                ) : (
                    <PlayIcon className="size-3.5" />
                )}
            </Button>
            <span className="w-[4.5rem] shrink-0 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)]">
                {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
            </span>
            <input
                type="range"
                min={0}
                max={maxTime}
                step={0.05}
                value={Math.min(currentTime, maxTime)}
                onChange={(event) => scrub(Number(event.target.value))}
                aria-label="Audio position"
                disabled={maxTime <= 0}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-[color:var(--accent)] disabled:cursor-default disabled:opacity-40"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 rounded-full"
                onClick={toggleMuted}
                aria-label={muted ? "Unmute audio" : "Mute audio"}
            >
                {muted ? (
                    <VolumeXIcon className="size-3.5" />
                ) : (
                    <Volume2Icon className="size-3.5" />
                )}
            </Button>
        </div>
    );
}

/**
 * Distribute `durationMs` across `sentences`, proportional to char
 * length. Returns `Caption[]`-shaped objects with millisecond timing —
 * matches the schema the player resolves against the audio clock when
 * the step has a voiceover.
 */
export function buildCaptionCues(
    stepId: string,
    sentences: ReadonlyArray<string>,
    durationMs: number,
): Array<{ id: string; start: number; end: number; text: string }> {
    const total = sentences.reduce((n, s) => n + Math.max(1, s.length), 0);
    let cursor = 0;
    return sentences.map((text, i) => {
        const share = (Math.max(1, text.length) / total) * durationMs;
        const start = cursor;
        const end = cursor + share;
        cursor = end;
        return { id: `${stepId}_c${i + 1}`, start, end, text };
    });
}

/**
 * Footer trigger for the active step's voiceover. Opening it no longer
 * pops a modal — it swaps the right sidebar over to {@link VoiceoverInspector}
 * (same pattern as the step / cover settings panels). The icon turns
 * accent-colored, with a count pill, once the step has a voiceover attached.
 */
export function VoiceoverButton({
    step,
    onOpen,
    compact,
}: {
    step: Step;
    onOpen: () => void;
    /** Hide the label — icon-only. Used on video steps where the
     *  scrubber needs the horizontal room. */
    compact?: boolean;
}) {
    const voiceover = step.voiceover;
    const count = voiceover ? 1 : 0;
    const icon = (
        <span className="relative inline-grid size-4 place-items-center">
            <Mic2Icon
                className={cn(
                    "size-3.5",
                    voiceover && "text-[color:var(--accent)]",
                )}
            />
            <ToolbarCountPill count={count} />
        </span>
    );

    if (compact) {
        return (
            <SimpleTooltip
                content={voiceover ? "Edit voiceover" : "Voiceover"}
                side="top"
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="default"
                    className="hover:bg-[color:var(--sidebar)]"
                    onClick={onOpen}
                >
                    {icon}
                </Button>
            </SimpleTooltip>
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="default"
            className="hover:bg-[color:var(--sidebar)]"
            onClick={onOpen}
            title={
                voiceover ? "Edit voiceover" : "Add a voiceover for this step"
            }
        >
            {icon}
            <span className="hidden lg:inline">Voiceover</span>
        </Button>
    );
}

/**
 * Strip Markdown formatting to plain text. Message copy can carry markdown
 * (e.g. AI Polish emits a `**bold title**`), but narration is read aloud and
 * pasted as plain text, so the syntax characters must go. Line breaks are
 * preserved; only inline/heading markers and link/code wrappers are removed.
 */
function stripMarkdown(value: string): string {
    return value
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) / ![alt](src) -> text
        .replace(/`+/g, "") // inline/code-fence backticks
        .replace(/(\*\*\*|___)(.*?)\1/g, "$2") // bold+italic
        .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
        .replace(/(\*|_)(.*?)\1/g, "$2") // italic
        .replace(/~~(.*?)~~/g, "$1") // strikethrough
        .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
        .replace(/^\s{0,3}>\s?/gm, "") // blockquote markers
        .replace(/^\s{0,3}[-*+]\s+/gm, "") // bullet list markers
        .replace(/[ \t]+$/gm, "") // trailing whitespace per line
        .trim();
}

/**
 * Message/text annotation copy on a content step, joined into one blurb the
 * author can drop into (or auto-seed) the narration script. Markdown is
 * stripped so the narration reads as plain text.
 */
export function messageTextForStep(step: Step): string {
    if (step.kind !== "content") return "";
    return step.annotations
        .map((a) =>
            a.type === "message" || a.type === "text" ? a.text ?? "" : "",
        )
        .map((t) => stripMarkdown(t.trim()))
        .filter(Boolean)
        .join(" ");
}

/**
 * Inline microphone recorder for a single step. Captures audio via
 * MediaRecorder, uploads it to the demo's assets, and hands the parent an
 * `asset:<id>` src (+ probed duration + the served url for instant playback).
 * Self-contained so its recorder state resets whenever the parent unmounts
 * it (e.g. switching steps or closing the recorder).
 */
function InlineRecorder({
    slug,
    stepId,
    onRecorded,
}: {
    slug: string;
    stepId: string;
    onRecorded: (result: {
        src: string;
        durationMs: number;
        publicUrl?: string;
        asset?: AssetMeta;
    }) => void;
}) {
    const [recording, setRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStreamRef = useRef<MediaStream | null>(null);
    const recordTimerRef = useRef<number | null>(null);
    const recordMimeRef = useRef<string>("audio/webm");
    const recordedUrlRef = useRef<string | null>(null);

    const stopRecordTimer = () => {
        if (recordTimerRef.current != null) {
            window.clearInterval(recordTimerRef.current);
            recordTimerRef.current = null;
        }
    };
    const releaseStream = () => {
        const stream = recordStreamRef.current;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            recordStreamRef.current = null;
        }
    };

    // Stop the mic + clear timers on unmount. Reads only refs so the
    // cleanup never closes over stale state.
    useEffect(() => {
        return () => {
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                recorder.ondataavailable = null;
                recorder.onstop = null;
                try {
                    recorder.stop();
                } catch {
                    /* already terminal */
                }
            }
            if (recordTimerRef.current != null) {
                window.clearInterval(recordTimerRef.current);
            }
            const stream = recordStreamRef.current;
            if (stream) stream.getTracks().forEach((t) => t.stop());
            if (recordedUrlRef.current) {
                URL.revokeObjectURL(recordedUrlRef.current);
            }
        };
    }, []);

    const setRecordedUrlSafe = (url: string | null) => {
        recordedUrlRef.current = url;
        setRecordedUrl(url);
    };

    const startRecording = async () => {
        setError(null);
        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            setError("Microphone capture isn't supported in this browser.");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            setError("MediaRecorder isn't supported in this browser.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            recordStreamRef.current = stream;
            const candidates = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/mp4",
                "audio/ogg;codecs=opus",
            ];
            const mime =
                candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
            recordMimeRef.current = mime || "audio/webm";
            const recorder = new MediaRecorder(
                stream,
                mime ? { mimeType: mime } : undefined,
            );
            audioChunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };
            recorder.onstop = () => {
                stopRecordTimer();
                releaseStream();
                const blob = new Blob(audioChunksRef.current, {
                    type: recordMimeRef.current,
                });
                audioChunksRef.current = [];
                if (blob.size === 0) {
                    setError("Recording was empty.");
                    setRecording(false);
                    return;
                }
                if (recordedUrlRef.current) {
                    URL.revokeObjectURL(recordedUrlRef.current);
                }
                setRecordedBlob(blob);
                setRecordedUrlSafe(URL.createObjectURL(blob));
                setRecording(false);
            };
            mediaRecorderRef.current = recorder;
            if (recordedUrlRef.current) {
                URL.revokeObjectURL(recordedUrlRef.current);
            }
            setRecordedBlob(null);
            setRecordedUrlSafe(null);
            setRecordSeconds(0);
            setRecording(true);
            recorder.start();
            recordTimerRef.current = window.setInterval(() => {
                setRecordSeconds((s) => s + 1);
            }, 1000);
        } catch (err) {
            releaseStream();
            setRecording(false);
            setError(
                err instanceof Error
                    ? `Could not start recording: ${err.message}`
                    : "Could not start recording.",
            );
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        } else {
            stopRecordTimer();
            releaseStream();
            setRecording(false);
        }
    };

    const save = async () => {
        if (!recordedBlob) return;
        setBusy(true);
        setError(null);
        try {
            const mime = recordMimeRef.current;
            const ext = mime.includes("mp4")
                ? "m4a"
                : mime.includes("ogg")
                ? "ogg"
                : "webm";
            const filename = `recording-${stepId}-${Date.now().toString(36)}.${ext}`;
            const path = `assets/${filename}`;
            // Strip the `;codecs=…` parameter MediaRecorder appends so the
            // manifest records a bare `audio/webm` content type.
            const contentType = mime.split(";")[0].trim() || "audio/webm";
            const commit = await putDemoAssetBlob({
                slug,
                blob: recordedBlob,
                path,
                contentType,
                kind: "audio",
            });
            if (!commit.assetId) {
                throw new Error("Saved recording did not return an asset id.");
            }
            const src = `asset:${commit.assetId}`;
            const probedSec = commit?.publicUrl
                ? await probeAudioDuration(commit.publicUrl)
                : null;
            const durationMs = (probedSec ?? Math.max(1, recordSeconds)) * 1000;
            onRecorded({
                src,
                durationMs,
                publicUrl: commit?.publicUrl,
                asset: commit.asset,
            });
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unexpected error saving recording.",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2">
            <div className="flex flex-col items-center gap-2 py-1">
                <Button
                    type="button"
                    variant={recording ? "primary" : "secondary"}
                    size="default"
                    onClick={() =>
                        recording ? stopRecording() : void startRecording()
                    }
                    disabled={busy}
                >
                    {recording ? (
                        <>
                            <SquareIcon className="size-4" />
                            Stop
                        </>
                    ) : (
                        <>
                            <MicIcon className="size-4" />
                            {recordedBlob ? "Record again" : "Start recording"}
                        </>
                    )}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                    {recording
                        ? `Recording… ${formatClock(recordSeconds)}`
                        : recordedBlob
                        ? `Recorded ${formatClock(recordSeconds)}.`
                        : "Your browser will ask for mic access."}
                </p>
            </div>
            {recordedBlob && recordedUrl ? (
                <AudioPreview src={recordedUrl} preload="metadata" />
            ) : null}
            {error ? (
                <p className="text-[11px] text-destructive">{error}</p>
            ) : null}
            <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => void save()}
                disabled={busy || recording || !recordedBlob}
            >
                {busy ? "Saving…" : "Use recording"}
            </Button>
        </div>
    );
}

function formatClock(totalSeconds: number): string {
    const mm = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
    const ss = Math.floor(totalSeconds % 60)
        .toString()
        .padStart(2, "0");
    return `${mm}:${ss}`;
}

function formatAudioTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mm = Math.floor(seconds / 60);
    const ss = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    return `${mm}:${ss}`;
}

/**
 * Sidebar panel that lists every step's narration in one place. Authors
 * write/edit a per-step script (persisted on `step.script`) and attach a
 * voiceover per step three ways: generate it from the script with the voice
 * picked at the top, record one from the mic, or reuse an audio asset.
 * Each step is a collapsible card; the step the panel was opened from
 * expands by default, and — opened from the toolbar on a fresh step — its
 * script is seeded once from the step's on-screen message text.
 *
 * Generated/attached audio is stored as an `asset:<id>` uri so it resolves
 * through the same host resolver as image/video assets, in both the editor
 * preview and the runtime player.
 */
export function VoiceoverInspector({
    steps,
    selectedStepId,
    onUpdateStep,
    slug,
    demoId,
    assets,
    onAssetsChanged,
    onAssetUploaded,
    resolveAudioSrc,
}: {
    steps: ReadonlyArray<Step>;
    /** Step to auto-expand + seed when the panel opens. */
    selectedStepId: string | null;
    onUpdateStep: (stepId: string, patch: Partial<Step>) => void;
    slug: string;
    demoId: string;
    assets: ReadonlyArray<AssetMeta>;
    onAssetsChanged: () => void;
    onAssetUploaded?: (asset: AssetMeta) => void;
    /** Resolve a stored voiceover uri (`asset:<id>` | path) to a playable
     *  URL for the inline `<audio>` preview. */
    resolveAudioSrc: (src: string) => string;
}) {
    // Which step card is expanded (null = all collapsed).
    const initialExpandedId = selectedStepId ?? steps[0]?.id ?? null;
    const [expandedId, setExpandedId] = useState<string | null>(
        initialExpandedId,
    );
    // Per-step body view: undefined → default (script + actions); "record"
    // swaps the card body to the recorder. A Cancel in the recorder clears it
    // back to default. (Asset selection uses the shared picker modal instead.)
    const [stepView, setStepView] = useState<
        Record<string, "record" | undefined>
    >({});
    const setView = (stepId: string, view: "record" | null) =>
        setStepView((m) => ({ ...m, [stepId]: view ?? undefined }));
    // Step whose audio-asset picker modal is open (null = closed). The picker
    // is the shared MediaAssetPickerDialog, scoped to audio assets.
    const [assetPickerStepId, setAssetPickerStepId] = useState<string | null>(
        null,
    );

    // Local script drafts so typing doesn't re-serialize the whole config on
    // every keystroke — committed to `step.script` on blur / before generate.
    // Seeded for the initially-expanded step, and for any other step the first
    // time its card is expanded (see `expandStep`): if the step has no script
    // and no voiceover yet, drop its on-screen message text in as a starting
    // point so an empty narration box auto-fills from the first message.
    const [scriptDrafts, setScriptDrafts] = useState<Record<string, string>>(
        () => {
            if (!initialExpandedId) return {};
            const step = steps.find((s) => s.id === initialExpandedId);
            if (!step) return {};
            if ((step.script ?? "").trim()) return {};
            if (step.voiceover) return {};
            const seed = messageTextForStep(step);
            return seed ? { [initialExpandedId]: seed } : {};
        },
    );

    // Toggle a step card, seeding its narration draft from the step's message
    // text the first time it opens with an empty/un-narrated script.
    const expandStep = (step: Step) => {
        if (expandedId === step.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(step.id);
        setScriptDrafts((m) => {
            if (m[step.id] != null) return m;
            if ((step.script ?? "").trim()) return m;
            if (step.voiceover) return m;
            const seed = messageTextForStep(step);
            return seed ? { ...m, [step.id]: seed } : m;
        });
    };
    // Per-step errors, keyed by step id.
    const [errors] = useState<Record<string, string | null>>({});
    // Served urls for audio attached this session, so the inline player
    // works before the refreshed asset manifest lands. Keyed by stored src.
    const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

    // Attached-voiceover playback. A hidden <audio> drives the per-step
    // preview button; `playingAttachedId` is the step playing now.
    const attachedAudioRef = useRef<HTMLAudioElement | null>(null);
    const [playingAttachedId, setPlayingAttachedId] = useState<string | null>(
        null,
    );

    useEffect(() => {
        const attached = attachedAudioRef.current;
        return () => {
            attached?.pause();
        };
    }, []);

    const audioAssets = assets.filter(isAudioAsset);

    const scriptValue = (step: Step) =>
        scriptDrafts[step.id] ?? step.script ?? "";

    const commitScript = (step: Step) => {
        const draft = scriptDrafts[step.id];
        if (draft == null) return;
        const next = draft.trim() ? draft : undefined;
        if ((step.script ?? "") !== (next ?? "")) {
            onUpdateStep(step.id, { script: next });
        }
    };

    const removeVoiceover = (step: Step) => {
        if (playingAttachedId === step.id) {
            attachedAudioRef.current?.pause();
            setPlayingAttachedId(null);
        }
        // Captions are tied to the audio — drop them alongside the voiceover
        // so the next generation doesn't inherit stale cues.
        onUpdateStep(step.id, { voiceover: undefined, captions: undefined });
    };

    // Resolve a stored voiceover src to a playable URL — prefer the
    // session-local url captured at attach time, then the host resolver.
    const playableSrc = (src: string) => localUrls[src] ?? resolveAudioSrc(src);

    const toggleAttached = (step: Step) => {
        if (!step.voiceover) return;
        const el = attachedAudioRef.current;
        if (!el) return;
        if (playingAttachedId === step.id) {
            el.pause();
            setPlayingAttachedId(null);
            return;
        }
        el.src = playableSrc(step.voiceover.src);
        el.currentTime = 0;
        void el
            .play()
            .then(() => setPlayingAttachedId(step.id))
            .catch(() => setPlayingAttachedId(null));
    };

    // Upload handler for the audio-asset picker's "upload new" tile. Stores
    // the blob as an audio asset and reports it back in MediaUploader shape
    // (width/height are irrelevant for audio).
    const uploadAudioAsset: MediaUploader = async (file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "webm";
        const path = `assets/voiceover-${Date.now().toString(36)}.${ext}`;
        const contentType = file.type || "audio/webm";
        const commit = await putDemoAssetBlob({
            slug,
            blob: file,
            path,
            contentType,
            kind: "audio",
        });
        if (!commit.assetId) return null;
        const src = `asset:${commit.assetId}`;
        if (commit.publicUrl) {
            setLocalUrls((m) => ({ ...m, [src]: commit.publicUrl as string }));
        }
        if (commit.asset) onAssetUploaded?.(commit.asset);
        onAssetsChanged();
        return { asset: commit.asset, path, src, width: 0, height: 0 };
    };

    // Attach the asset chosen in the picker as this step's voiceover, probing
    // its duration so the runtime knows how long the step should hold.
    const attachPickedAudio = async (step: Step, result: MediaPickResult) => {
        const src = result.src;
        const publicUrl =
            localUrls[src] ??
            audioAssets.find((a) => a.id && `asset:${a.id}` === src)
                ?.publicUrl ??
            resolveAudioSrc(src);
        const probedSec = publicUrl
            ? await probeAudioDuration(publicUrl)
            : null;
        const durationMs = (probedSec ?? 1) * 1000;
        if (publicUrl) {
            setLocalUrls((m) => ({ ...m, [src]: publicUrl }));
        }
        onUpdateStep(step.id, { voiceover: { src, duration: durationMs } });
    };

    return (
        <div className="space-y-3">
            {/* Shared, hidden player for the attached voiceover. */}
            <audio
                ref={attachedAudioRef}
                onEnded={() => setPlayingAttachedId(null)}
                className="hidden"
            />

            {/* Per-step scripts. */}
            <div className="space-y-2">
                {steps.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[color:var(--line-soft)] px-3 py-6 text-center text-[12px] text-muted-foreground">
                        No steps in this demo yet.
                    </div>
                ) : null}
                {steps.map((step, i) => {
                    const expanded = expandedId === step.id;
                    const hasVoiceover = !!step.voiceover;
                    const busy = false;
                    const err = errors[step.id] ?? null;
                    const draft = scriptValue(step);
                    const title = step.label
                        ? `Step ${i + 1} - ${step.label}`
                        : `Step ${i + 1}`;
                    return (
                        <div
                            key={step.id}
                            className="overflow-hidden rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--surface)]"
                        >
                            <button
                                type="button"
                                onClick={() => expandStep(step)}
                                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--surface-2)]"
                                aria-expanded={expanded}
                            >
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[color:var(--ink-strong)]">
                                    {title}
                                </span>
                                {/* Steps without audio yet flag it with a
                                    muted mic-off icon, open or collapsed. */}
                                {!hasVoiceover ? (
                                    <MicOffIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : null}
                                <ChevronDownIcon
                                    className={cn(
                                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                                        expanded && "rotate-180",
                                    )}
                                />
                            </button>

                            {/* Animated expand/collapse via grid-rows. */}
                            <div
                                className={cn(
                                    "grid transition-[grid-template-rows] duration-200 ease-out",
                                    expanded
                                        ? "grid-rows-[1fr]"
                                        : "grid-rows-[0fr]",
                                )}
                            >
                              <div className="overflow-hidden">
                                <div className="border-t border-[color:var(--line-soft)] px-3 py-3">
                                    {stepView[step.id] === "record" ? (
                                        /* ── Record view ── */
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[12px] font-medium text-[color:var(--ink-2)]">
                                                    Record voiceover
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="xs"
                                                    onClick={() =>
                                                        setView(step.id, null)
                                                    }
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                            {expanded ? (
                                                <InlineRecorder
                                                    slug={slug}
                                                    stepId={step.id}
                                                    onRecorded={({
                                                        src,
                                                        durationMs,
                                                        publicUrl,
                                                        asset,
                                                    }) => {
                                                        if (publicUrl) {
                                                            setLocalUrls((m) => ({
                                                                ...m,
                                                                [src]: publicUrl,
                                                            }));
                                                        }
                                                        if (asset) {
                                                            onAssetUploaded?.(
                                                                asset,
                                                            );
                                                        }
                                                        onUpdateStep(step.id, {
                                                            voiceover: {
                                                                src,
                                                                duration:
                                                                    durationMs,
                                                            },
                                                        });
                                                        onAssetsChanged();
                                                        setView(step.id, null);
                                                    }}
                                                />
                                            ) : null}
                                        </div>
                                    ) : (
                                        /* ── Default view ── */
                                        <div className="space-y-2">
                                            <span className="block text-[11px] font-medium text-[color:var(--ink-2)]">
                                                Voiceover text
                                            </span>

                                            <textarea
                                                value={draft}
                                                onChange={(e) =>
                                                    setScriptDrafts((d) => ({
                                                        ...d,
                                                        [step.id]:
                                                            e.target.value,
                                                    }))
                                                }
                                                onBlur={() => commitScript(step)}
                                                placeholder="Type what the narrator should say…"
                                                rows={3}
                                                maxLength={500}
                                                disabled={busy}
                                                className="flex w-full min-h-[84px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                            />

                                            {/* Action group — Record · Asset. Buttons (flat
                                                variant) joined into one segmented group via
                                                the container. */}
                                            <div className="flex w-full divide-x divide-[color:var(--line)] overflow-hidden rounded-lg border border-[color:var(--line)]">
                                                <Button
                                                    type="button"
                                                    variant="flat"
                                                    size="sm"
                                                    onClick={() =>
                                                        setView(step.id, "record")
                                                    }
                                                    disabled={busy}
                                                    className="flex-1 rounded-none border-0 shadow-none"
                                                >
                                                    <MicIcon />
                                                    Record
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="flat"
                                                    size="sm"
                                                    onClick={() =>
                                                        setAssetPickerStepId(
                                                            step.id,
                                                        )
                                                    }
                                                    disabled={busy}
                                                    className="flex-1 rounded-none border-0 shadow-none"
                                                >
                                                    <FolderOpenIcon />
                                                    Asset
                                                </Button>
                                            </div>

                                            {err ? (
                                                <p className="text-[11px] text-destructive">
                                                    {err}
                                                </p>
                                            ) : null}

                                            {hasVoiceover && step.voiceover ? (
                                                <div className="flex items-center gap-2 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] px-2 py-1.5">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="icon"
                                                        className="size-8 shrink-0 rounded-full"
                                                        onClick={() =>
                                                            toggleAttached(step)
                                                        }
                                                        aria-label={
                                                            playingAttachedId ===
                                                            step.id
                                                                ? "Pause voiceover"
                                                                : "Play voiceover"
                                                        }
                                                    >
                                                        {playingAttachedId ===
                                                        step.id ? (
                                                            <PauseIcon className="size-4" />
                                                        ) : (
                                                            <PlayIcon className="size-4" />
                                                        )}
                                                    </Button>
                                                    <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--ink-2)]">
                                                        Voiceover attached
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="xs"
                                                        onClick={() =>
                                                            removeVoiceover(step)
                                                        }
                                                        className="shrink-0 text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2Icon className="size-3" />
                                                        Remove
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                              </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Shared asset library modal, scoped to audio — the same picker
                used by step insertion and other media surfaces. */}
            {assetPickerStepId ? (
                <MediaAssetPickerDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setAssetPickerStepId(null);
                    }}
                    title="Use audio asset"
                    mediaKind="audio"
                    currentSrc={
                        steps.find((s) => s.id === assetPickerStepId)?.voiceover
                            ?.src ?? ""
                    }
                    assets={audioAssets}
                    demoId={demoId}
                    uploadMedia={uploadAudioAsset}
                    onPick={(result) => {
                        const step = steps.find(
                            (s) => s.id === assetPickerStepId,
                        );
                        if (step) void attachPickedAudio(step, result);
                    }}
                />
            ) : null}
        </div>
    );
}
