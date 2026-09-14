
/**
 * Structural editor for `demo.config.json`. Three-pane layout:
 *
 *   ┌────────┬───────────────────────┬─────────────────┐
 *   │ steps  │  stage (drag)         │  inspector      │
 *   │ strip  │  • bg image           │  selection      │
 *   │ thumbs │  • annotation overlays│  details + form │
 *   └────────┴───────────────────────┴─────────────────┘
 *
 * Edits re-serialize the whole demo.config.json through the shell's files
 * state, which the dev server writes back to disk.
 *
 * Visuals use `<Button>`, `<Tabs>`,
 * `.surface-lifted`, `.canvas-dotted`, the selection-card pattern, design
 * tokens (--surface, --sidebar, --accent, etc.). No hard-coded hexes.
 */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import {
    type Annotation,
    type Chrome,
    type DemoBackground,
    type DemoBrand,
    type DemoConfig,
    type Message,
    type MessageVariant,
    type Step,
    type CoverStep,
} from "@inkly-org/interactive-demo";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
    ArrowRightIcon,
    BlendIcon,
    ChevronDownIcon,
    AlertTriangleIcon,
    MessageCircleIcon,
    MicIcon,
    PauseIcon,
    PlayIcon,
    SquarePenIcon,
    Trash2Icon,
    TypeIcon,
    WandSparklesIcon,
    ZoomInIcon,
} from "lucide-react";
import { sanitizeAssetName, type AssetMeta } from "@/lib/assets";
import { findAssetReferenceEntry } from "@/lib/assets/resolve";
import { cn } from "@/lib/utils";
import { putDemoAssetBlob } from "@/lib/assets/client-demo-upload";
import {
    demoFileUrl,
    isExternalDemoResource,
    normalizeDemoResourcePath,
} from "@/lib/demo-resource-paths";
import {
    CONFIG_PATH,
    parseDemoConfig,
    serializeDemoConfig,
    type ParsedConfig,
    type ParseResult,
} from "@/components/demo-editor/codec";
import {
    ADD_BUTTONS,
    DEFAULT_ZOOM_TRANSFORM,
    MESSAGE_VARIANTS,
    type AddKind,
} from "@/components/demo-editor/constants";
import { ToolbarCountPill } from "@/components/demo-editor/toolbar-count-pill";
import {
    clamp01,
    resolveStageAspect,
} from "@/components/demo-editor/geometry";
import {
    isImageAsset,
    isMediaAsset,
    isVideoAsset,
    measureImageFile,
    measureVideoFile,
} from "@/components/demo-editor/media-measure";
import {
    slidesEqual,
    type RectPatch,
    type Slide,
    type ZoomMode,
} from "@/components/demo-editor/context";
import { VoiceoverInspector } from "@/components/demo-editor/voiceover";
import {
    DemoSettingsInspector,
    SettingsMenuButton,
    StepSettingsInspector,
} from "@/components/demo-editor/chrome-settings";
import { MediaSettingsButton } from "@/components/demo-editor/media-settings";
import {
    AnnotationInspector,
    CoverInspector,
    MediaAssetPickerDialog,
    type MediaPickResult,
    SidebarBreadcrumb,
} from "@/components/demo-editor/inspectors";
import {
    DeleteKeyHandler,
    Stage,
} from "@/components/demo-editor/stage";
import {
    SlideStrip,
    SlideStripVideoBuffer,
    type CoverVariant,
} from "@/components/demo-editor/slide-strip";
import { resolveDemoAssetReferencesForDisplay } from "@/components/demo-editor/asset-display";
import { deleteStepFromConfig } from "@/components/demo-editor/delete-step";
import { DEFAULT_DEMO_BACKGROUND_COLOR } from "@/lib/demo-background";
import {
    generateId,
    firstContentWidgetImage,
    makeAnnotation,
    makeMessage,
    makeOutroCtaWidget,
    makeWidget,
} from "@/components/demo-editor/factories";
import {
    playerAspectRatioForConfig,
    type PlayerAspectRatio,
} from "@/lib/demos/player-aspect-ratio";
import { toast } from "sonner";

type PendingAspectRatioChange = {
    current: PlayerAspectRatio;
    next: PlayerAspectRatio;
    commit: () => void;
};

const ASPECT_RATIO_WARNING_EPSILON = 0.005;

function ratioValue(ratio: PlayerAspectRatio): number {
    return ratio.width / ratio.height;
}

function aspectRatiosDiffer(
    current: PlayerAspectRatio,
    next: PlayerAspectRatio,
): boolean {
    return (
        Math.abs(ratioValue(current) - ratioValue(next)) >
        ASPECT_RATIO_WARNING_EPSILON
    );
}

function formatDimension(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDimensions(ratio: PlayerAspectRatio): string {
    return `${formatDimension(ratio.width)} × ${formatDimension(ratio.height)}`;
}

function formatRatio(ratio: PlayerAspectRatio): string {
    return ratioValue(ratio).toFixed(2);
}

function AspectRatioWarningDialog({
    pending,
    onCancel,
    onConfirm,
}: {
    pending: PendingAspectRatioChange | null;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Dialog
            open={pending !== null}
            onOpenChange={(open) => {
                if (!open) onCancel();
            }}
        >
            <DialogContent className="sm:max-w-lg" showCloseButton={false}>
                {pending ? (
                    <div className="grid gap-4">
                        <DialogHeader>
                            <div className="flex items-start gap-3">
                                <AlertTriangleIcon
                                    aria-hidden
                                    className="mt-0.5 size-5 shrink-0 fill-amber-500 text-amber-500 [stroke:white]"
                                />
                                <div className="min-w-0">
                                    <DialogTitle>
                                        Aspect ratio warning
                                    </DialogTitle>
                                    <DialogDescription className="mt-2">
                                        This change will update the demo&apos;s
                                        aspect ratio because the first content
                                        step uses media with different
                                        dimensions. To avoid hotspot and slide
                                        misalignment, use media that matches the
                                        current aspect ratio or crop it before
                                        changing the first content step.
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                            <AspectRatioSummaryCard
                                label="Current"
                                ratio={pending.current}
                            />
                            <ArrowRightIcon
                                aria-hidden
                                className="mx-auto size-4 rotate-90 text-muted-foreground sm:rotate-0"
                            />
                            <AspectRatioSummaryCard
                                label="New"
                                ratio={pending.next}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onCancel}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={onConfirm}
                            >
                                Change aspect ratio
                            </Button>
                        </DialogFooter>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function AspectRatioSummaryCard({
    label,
    ratio,
}: {
    label: string;
    ratio: PlayerAspectRatio;
}) {
    return (
        <div className="rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-3 text-sm text-[color:var(--ink-strong)]">
            <p className="font-semibold">{label}</p>
            <p className="mt-1 text-base font-medium">
                {formatDimensions(ratio)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
                With aspect ratio of {formatRatio(ratio)}:1
            </p>
        </div>
    );
}

// ─── inspectors ─────────────────────────────────────────────────────────────

/**
 * Inspector row for one of a message annotation's prev/next nav
 * buttons. The schema's `HotspotNavButton` is optional and stores
 * just `{ label?, hidden }` — defaulting to undefined when the
 * author hasn't touched it lets the player pick up the theme's
 * defaults. Clearing both label + hidden flips the field back to
 * `undefined` so the serialized config stays minimal.
 */
const MESSAGE_VARIANT_DESCRIPTIONS: Record<MessageVariant, string> = {
    pointer: "Tag an exact spot with a pin",
    callout: "Label a feature with a callout bubble",
    area: "Highlight a rectangular region",
    cursor: "Animate a cursor that clicks the spot",
};
const UNAVAILABLE_MESSAGE_DESCRIPTION =
    "This message type is not available on this step.";

const ANNOTATE_DESCRIPTIONS: Record<"blur" | "text" | "zoom", string> = {
    blur: "Mask out sensitive parts of the screen",
    text: "Drop freeform text onto the canvas",
    zoom: "Focus viewers on a region of the screen",
};
const UNAVAILABLE_ANNOTATION_DESCRIPTION =
    "This annotation is not available on this step.";

const ANNOTATE_ICONS = {
    blur: BlendIcon,
    text: TypeIcon,
} as const;

function MenuItemBody({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <span className="flex flex-col gap-0.5">
            <span className="text-[13px] leading-tight text-[color:var(--ink-strong)]">
                {title}
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
                {description}
            </span>
        </span>
    );
}

/**
 * Footer "Narration" dropdown: opens the voiceover inspector for the active
 * step. The icon turns accent-colored with a count pill when the step
 * already has a voiceover attached.
 */
function AiMenuButton({
    step,
    onOpenVoiceover,
    compact,
}: {
    step: Step;
    onOpenVoiceover: () => void;
    /** Hide the label + chevron — icon-only. Used on video steps where the
     *  footer scrubber needs the horizontal room (matches the other buttons). */
    compact?: boolean;
}) {
    const hasVoiceover = !!step.voiceover;
    return (
        <DropdownMenu>
            <CompactTooltip label="Narration" enabled={!!compact}>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="default"
                            className="hover:bg-[color:var(--sidebar)]"
                            title={compact ? undefined : "Narration"}
                        >
                            <span className="relative inline-grid size-4 place-items-center">
                                <WandSparklesIcon
                                    className={cn(
                                        "size-4",
                                        hasVoiceover &&
                                            "text-[color:var(--accent)]",
                                    )}
                                />
                                <ToolbarCountPill count={hasVoiceover ? 1 : 0} />
                            </span>
                            {!compact ? (
                                <>
                                    <span className="hidden lg:inline">Narration</span>
                                    <ChevronDownIcon className="hidden size-3.5 opacity-70 lg:inline-block" />
                                </>
                            ) : null}
                        </Button>
                    }
                />
            </CompactTooltip>
            <DropdownMenuContent align="center" sideOffset={6} className="w-72">
                <DropdownMenuItem onClick={onOpenVoiceover}>
                    <MicIcon className="size-4" />
                    <MenuItemBody
                        title="Voiceover"
                        description={
                            hasVoiceover
                                ? "Edit narration for this step"
                                : "Add narration for this step"
                        }
                    />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type MediaPlaybackElement = HTMLVideoElement;

function isActivePlaybackElement(el: MediaPlaybackElement): boolean {
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none"
    );
}

function finitePlaybackTime(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : 0;
}

/**
 * Editor-only scrubber for video steps. Reaches into the live
 * stage media element by class so we don't have to thread a ref through the
 * runtime package.
 */
function MediaPlaybackControl({
    stepId,
    kind,
}: {
    stepId: string;
    kind: "video";
}) {
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [paused, setPaused] = useState(true);
    const mediaRef = useRef<MediaPlaybackElement | null>(null);
    const scrubbingRef = useRef(false);

    useEffect(() => {
        // Stage is the on-screen `.demo-stage` painted by the editor's
        // <Demo>. The media element is the active step's background.
        const findMedia = (): MediaPlaybackElement | null => {
            const selector = ".demo-stage video.demo-stage-image";
            const candidates = [
                ...document.querySelectorAll<MediaPlaybackElement>(selector),
            ];
            return candidates.find(isActivePlaybackElement) ?? candidates[0] ?? null;
        };

        let cleanup: (() => void) | undefined;
        let bound: MediaPlaybackElement | null = null;
        let syncBound: (() => void) | undefined;

        const bind = (v: MediaPlaybackElement | null) => {
            if (!v) return false;
            if (v === bound) {
                syncBound?.();
                return true;
            }
            cleanup?.();
            bound = v;
            mediaRef.current = v;
            const sync = () => {
                setDuration(finitePlaybackTime(v.duration));
                if (!scrubbingRef.current) {
                    setCurrentTime(finitePlaybackTime(v.currentTime));
                }
                setPaused(v.paused);
            };
            syncBound = sync;
            sync();
            v.addEventListener("timeupdate", sync);
            v.addEventListener("durationchange", sync);
            v.addEventListener("loadedmetadata", sync);
            v.addEventListener("play", sync);
            v.addEventListener("pause", sync);
            v.addEventListener("ended", sync);
            cleanup = () => {
                v.removeEventListener("timeupdate", sync);
                v.removeEventListener("durationchange", sync);
                v.removeEventListener("loadedmetadata", sync);
                v.removeEventListener("play", sync);
                v.removeEventListener("pause", sync);
                v.removeEventListener("ended", sync);
                syncBound = undefined;
                if (bound === v) bound = null;
            };
            return true;
        };

        bind(findMedia());
        const poll = window.setInterval(() => {
            bind(findMedia());
        }, 150);

        return () => {
            window.clearInterval(poll);
            cleanup?.();
            mediaRef.current = null;
        };
    }, [stepId, kind]);

    const seekMedia = (value: number) => {
        const v = mediaRef.current;
        if (!v) return;
        const mediaDuration = finitePlaybackTime(v.duration) || duration;
        const maxTime = finitePlaybackTime(mediaDuration);
        const nextTime =
            maxTime > 0
                ? Math.min(Math.max(value, 0), maxTime)
                : Math.max(value, 0);
        v.currentTime = nextTime;
        setCurrentTime(nextTime);
        setDuration(maxTime);
        setPaused(v.paused);
    };

    const togglePlay = () => {
        const v = mediaRef.current;
        if (!v) return;
        const ended = v.ended;
        if (v.paused || ended) {
            if (ended) v.currentTime = 0;
            const result = v.play();
            if (result instanceof Promise) {
                void result.catch(() => {});
            }
        } else {
            v.pause();
        }
    };

    const onScrub = (value: number) => {
        seekMedia(value);
    };

    // Short captures need sub-second precision or the readout reads 0:00/0:00.
    const safeDuration = finitePlaybackTime(duration);
    const safeCurrentTime = Math.min(
        finitePlaybackTime(currentTime),
        safeDuration,
    );
    const showTenths = safeDuration > 0 && safeDuration < 10;
    const scrubProgress =
        safeDuration > 0 ? clamp01(safeCurrentTime / safeDuration) * 100 : 0;
    const mediaLabel = "Video";
    const scrubberStyle = {
        "--media-scrub-progress": `${scrubProgress}%`,
    } as CSSProperties;

    return (
        <div
            className="flex min-w-0 items-center gap-2 px-1.5"
            title={`Scrub the ${kind}`}
        >
            <Button
                type="button"
                variant="ghost"
                size="default"
                onClick={togglePlay}
                aria-label={paused ? `Play ${kind}` : `Pause ${kind}`}
            >
                {paused ? (
                    <PlayIcon className="size-3.5" />
                ) : (
                    <PauseIcon className="size-3.5" />
                )}
            </Button>
            <input
                type="range"
                min={0}
                max={safeDuration}
                step={0.05}
                value={safeCurrentTime}
                onPointerDown={() => {
                    scrubbingRef.current = true;
                }}
                onPointerUp={() => {
                    scrubbingRef.current = false;
                }}
                onPointerCancel={() => {
                    scrubbingRef.current = false;
                }}
                onBlur={() => {
                    scrubbingRef.current = false;
                }}
                onChange={(e) => onScrub(Number(e.target.value))}
                aria-label={`${mediaLabel} position`}
                className="editor-media-scrubber w-[clamp(10rem,24vw,16rem)] min-w-0"
                style={scrubberStyle}
                disabled={!safeDuration}
            />
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                {formatPlaybackTime(safeCurrentTime, showTenths)} /{" "}
                {formatPlaybackTime(safeDuration, showTenths)}
            </span>
        </div>
    );
}

/**
 * Format a playback timestamp as `M:SS`. Captured clips are often shorter
 * than a second, where whole-second flooring collapses both current and
 * total to `0:00`; pass `showTenths` (set when the clip is under 10s) to
 * render `M:SS.d` so sub-second durations stay visible.
 */
function formatPlaybackTime(seconds: number, showTenths = false): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return showTenths ? "0.0" : "0";
    }
    const m = Math.floor(seconds / 60);
    if (m === 0) {
        return showTenths
            ? (seconds % 60).toFixed(1)
            : Math.floor(seconds % 60).toString();
    }
    if (showTenths) {
        const s = (seconds % 60).toFixed(1).padStart(4, "0");
        return `${m}:${s}`;
    }
    const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    return `${m}:${s}`;
}

/**
 * Conditionally wraps a child with a tooltip — only when the button has
 * collapsed to icon-only (no visible label). For full-label buttons the
 * label itself does the labeling job, so we skip the wrapper and avoid
 * duplicating it as hover chrome.
 */
function CompactTooltip({
    enabled,
    label,
    children,
}: {
    enabled: boolean;
    label: string;
    children: React.ReactElement;
}) {
    if (!enabled) return children;
    return (
        <SimpleTooltip content={label} side="top">
            {children}
        </SimpleTooltip>
    );
}

function FooterDivider() {
    return (
        <div
            aria-hidden
            className="mx-0.5 h-4 w-px bg-[color:var(--line)]"
        />
    );
}

function StepFooter({
    step,
    onChange,
    onAddAnnotation,
    onAddMessage,
    setZoomMode,
    onOpenDemoSettings,
    onOpenStepSettings,
    onOpenVoiceover,
    onOpenEdit,
}: {
    step: Extract<Step, { kind: "content" }>;
    onChange: (patch: Partial<Step>) => void;
    onAddAnnotation: (kind: AddKind) => void;
    onAddMessage: (variant: MessageVariant) => void;
    setZoomMode: (mode: ZoomMode) => void;
    onOpenDemoSettings: () => void;
    onOpenStepSettings: () => void;
    onOpenVoiceover: () => void;
    onOpenEdit: () => void;
}) {
    const hasZoom = (step.transform?.zoom ?? 1) > 1;
    const messageCount = step.annotations.filter(
        (a) => a.type === "message",
    ).length;
    const annotationCount =
        step.annotations.filter((a) => a.type === "blur" || a.type === "text")
            .length + (hasZoom ? 1 : 0);
    const hasMessage = messageCount > 0;
    const hasAnnotate = annotationCount > 0;
    const annotateOptions = ADD_BUTTONS.filter(
        (b) => b.kind === "blur" || b.kind === "text",
    );
    // Video steps put the scrubber on the left and collapse every other
    // button to icon-only so the scrubber gets the horizontal room it needs
    // without wrapping the footer card. Image steps have no scrubber, so
    // they keep their full labels.
    const isVideo = step.background.type === "video";
    const hasPlaybackControl = isVideo;
    const compact = hasPlaybackControl;

    return (
        <>
            {hasPlaybackControl ? (
                <>
                    <MediaPlaybackControl stepId={step.id} kind="video" />
                    <FooterDivider />
                </>
            ) : null}

            <DropdownMenu>
                <CompactTooltip label="Message" enabled={compact}>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="default"
                                className="hover:bg-[color:var(--sidebar)]"
                                title={
                                    isVideo
                                        ? undefined
                                        : "Add a message annotation"
                                }
                            >
                                <span className="relative inline-grid size-4 place-items-center">
                                    <MessageCircleIcon
                                        className={cn(
                                            "size-4",
                                            hasMessage &&
                                                "text-[color:var(--accent)]",
                                        )}
                                    />
                                    <ToolbarCountPill count={messageCount} />
                                </span>
                                {!compact ? (
                                    <>
                                        <span className="hidden lg:inline">
                                            Message
                                        </span>
                                        <ChevronDownIcon className="hidden size-3.5 opacity-70 lg:inline-block" />
                                    </>
                                ) : null}
                            </Button>
                        }
                    />
                </CompactTooltip>
                <DropdownMenuContent
                    align="center"
                    sideOffset={6}
                    className="w-72"
                >
                    {MESSAGE_VARIANTS.map(({ value, label, Icon }) => (
                        <DropdownMenuItem
                            key={value}
                            onClick={() => onAddMessage(value)}
                        >
                            <Icon className="size-4" />
                            <MenuItemBody
                                title={label}
                                description={MESSAGE_VARIANT_DESCRIPTIONS[value]}
                            />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <CompactTooltip label="Annotate" enabled={compact}>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="default"
                                className="hover:bg-[color:var(--sidebar)]"
                                title={
                                    isVideo
                                        ? undefined
                                        : "Add an annotation overlay"
                                }
                            >
                                <span className="relative inline-grid size-4 place-items-center">
                                    <SquarePenIcon
                                        className={cn(
                                            "size-4",
                                            hasAnnotate &&
                                                "text-[color:var(--accent)]",
                                        )}
                                    />
                                    <ToolbarCountPill count={annotationCount} />
                                </span>
                                {!compact ? (
                                    <>
                                        <span className="hidden lg:inline">
                                            Annotate
                                        </span>
                                        <ChevronDownIcon className="hidden size-3.5 opacity-70 lg:inline-block" />
                                    </>
                                ) : null}
                            </Button>
                        }
                    />
                </CompactTooltip>
                <DropdownMenuContent align="center" sideOffset={6} className="w-72">
                    {annotateOptions.map(({ kind, label }) => {
                        const Icon = ANNOTATE_ICONS[kind as "blur" | "text"];
                        return (
                            <DropdownMenuItem
                                key={kind}
                                onClick={() => onAddAnnotation(kind)}
                            >
                                <Icon className="size-4" />
                                <MenuItemBody
                                    title={label}
                                    description={
                                        ANNOTATE_DESCRIPTIONS[
                                            kind as "blur" | "text"
                                        ]
                                    }
                                />
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuItem
                        disabled={hasZoom}
                        onClick={() => {
                            if (hasZoom) return;
                            onChange({
                                transform: { ...DEFAULT_ZOOM_TRANSFORM },
                            });
                            setZoomMode("editing");
                        }}
                    >
                        <ZoomInIcon className="size-4" />
                        <MenuItemBody
                            title={hasZoom ? "Zoom (already added)" : "Zoom"}
                            description={ANNOTATE_DESCRIPTIONS.zoom}
                        />
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AiMenuButton
                step={step}
                onOpenVoiceover={onOpenVoiceover}
                compact={compact}
            />

            <FooterDivider />

            <SettingsMenuButton
                onOpenDemoSettings={onOpenDemoSettings}
                onOpenStepSettings={onOpenStepSettings}
                onOpenEdit={onOpenEdit}
                compact={compact}
            />
        </>
    );
}

function CoverFooter({
    step,
    onOpenDemoSettings,
    onOpenStepSettings,
    onOpenVoiceover,
}: {
    step: Extract<Step, { kind: "cover" }>;
    onOpenDemoSettings: () => void;
    onOpenStepSettings: () => void;
    onOpenVoiceover: () => void;
}) {
    const annotateOptions = ADD_BUTTONS.filter(
        (b) => b.kind === "blur" || b.kind === "text",
    );

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="default"
                            className="hover:bg-[color:var(--sidebar)]"
                            title="Cover steps don't support messages"
                        >
                            <MessageCircleIcon className="size-4" />
                            <span className="hidden lg:inline">Message</span>
                            <ChevronDownIcon className="hidden size-3.5 opacity-70 lg:inline-block" />
                        </Button>
                    }
                />
                <DropdownMenuContent align="center" sideOffset={6} className="w-72">
                    {MESSAGE_VARIANTS.map(({ value, label, Icon }) => (
                        <DropdownMenuItem key={value} disabled>
                            <Icon className="size-4" />
                            <MenuItemBody
                                title={label}
                                description={UNAVAILABLE_MESSAGE_DESCRIPTION}
                            />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="default"
                            title="Add an annotation overlay"
                        >
                            <SquarePenIcon className="size-4" />
                            <span className="hidden lg:inline">Annotate</span>
                            <ChevronDownIcon className="hidden size-3.5 opacity-70 lg:inline-block" />
                        </Button>
                    }
                />
                <DropdownMenuContent align="center" sideOffset={6} className="w-72">
                    {annotateOptions.map(({ kind, label }) => {
                        const Icon = ANNOTATE_ICONS[kind as "blur" | "text"];
                        return (
                            <DropdownMenuItem key={kind} disabled>
                                <Icon className="size-4" />
                                <MenuItemBody
                                    title={label}
                                    description={UNAVAILABLE_ANNOTATION_DESCRIPTION}
                                />
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuItem disabled>
                        <ZoomInIcon className="size-4" />
                        <MenuItemBody
                            title="Zoom"
                            description={UNAVAILABLE_ANNOTATION_DESCRIPTION}
                        />
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AiMenuButton
                step={step}
                onOpenVoiceover={onOpenVoiceover}
            />

            <FooterDivider />

            <SettingsMenuButton
                onOpenDemoSettings={onOpenDemoSettings}
                onOpenStepSettings={onOpenStepSettings}
            />
        </>
    );
}

// ─── main editor view ──────────────────────────────────────────────────────

const DEFAULT_THEME_ID = "default";

// ─── sidebar screen history ──────────────────────────────────────────────────

type SidebarPanelKind = "demo" | "step" | "cover" | "voiceover" | null;
type SidebarScreenKind =
    | "strip"
    | "demo"
    | "step"
    | "voiceover"
    | "annotation"
    | "cover";

/**
 * One "screen" the right sidebar can show. We keep a small in-memory
 * back-stack of these so the header's back button returns to the
 * previously visited screen instead of always snapping to the slide
 * strip. `sig` is the stable identity used for both history dedupe and
 * the screen-transition animation key.
 */
interface SidebarScreen {
    kind: SidebarScreenKind;
    panel: SidebarPanelKind;
    annotationId: string | null;
    widgetId: string | null;
    stepId: string;
    sig: string;
}

/**
 * Names the active sidebar screen. Mirrors the render branches in the
 * `<aside>` exactly so history stays in lock-step with what's painted.
 */
function deriveSidebarScreenKind(
    step: Step | null,
    panel: SidebarPanelKind,
    annotationId: string | null,
    widgetId: string | null,
): SidebarScreenKind {
    if (panel === "demo") return "demo";
    if (panel === "step" && step) return "step";
    if (panel === "voiceover") return "voiceover";
    const annotation =
        step && step.kind === "content" && annotationId
            ? step.annotations.find((a) => a.id === annotationId)
            : null;
    if (annotation && step) return "annotation";
    const cover = step && step.kind === "cover" ? step : null;
    const widget =
        cover && widgetId
            ? cover.widgets.find((w) => w.id === widgetId)
            : null;
    if (cover && (widget || panel === "cover")) return "cover";
    return "strip";
}

function sidebarScreenSignature(
    kind: SidebarScreenKind,
    annotationId: string | null,
    stepId: string,
): string {
    switch (kind) {
        case "step":
            return `step:${stepId}`;
        case "annotation":
            return `annotation:${annotationId ?? ""}`;
        case "cover":
            return `cover:${stepId}`;
        default:
            // strip / demo / voiceover have a single instance each.
            return kind;
    }
}

export function DemoEditorView({
    files,
    onChange,
    slug,
    assets,
    onAssetsChanged,
    onAssetUploaded,
}: {
    files: Record<string, string>;
    onChange: (path: string, content: string) => void;
    slug: string;
    assets: ReadonlyArray<AssetMeta>;
    onAssetsChanged: () => void;
    onAssetUploaded?: (asset: AssetMeta) => void;
}) {
    // Inspectors take a `demoId` for display-URL helpers; locally the slug
    // is the only identity a demo has.
    const demoId = slug;
    const source = files[CONFIG_PATH];
    const parsed = useMemo<ParseResult>(() => {
        if (typeof source !== "string") {
            return {
                error: {
                    kind: "json",
                    message: `${CONFIG_PATH} not found in this demo.`,
                },
            };
        }
        return parseDemoConfig(source);
    }, [source]);
    const resolveAssetUri = useMemo(
        () => (uri: string) => {
            if (!uri || isExternalDemoResource(uri) || uri.startsWith("asset:")) {
                return uri;
            }
            if (uri.startsWith("/")) {
                return uri;
            }
            return demoFileUrl(slug, normalizeDemoResourcePath(uri));
        },
        [slug],
    );
    // Resolve a stored voiceover uri to a playable URL for the editor's
    // inline `<audio>` preview. `asset:<id>` maps to the asset's served
    // `publicUrl` (same source the runtime resolver uses); relative/raw
    // refs fall through to the shared resource resolver.
    const resolveAudioSrc = useCallback(
        (src: string) => {
            if (!src) return "";
            const asset = findAssetReferenceEntry(assets, src);
            if (asset?.publicUrl) return asset.publicUrl;
            if (src.startsWith("asset:")) {
                return "";
            }
            return resolveAssetUri(src);
        },
        [assets, resolveAssetUri],
    );

    const initialSlide: Slide =
        "config" in parsed
            ? { stepId: parsed.config.steps[0]?.id ?? "" }
            : { stepId: "" };
    const [slide, setSlide] = useState<Slide>(initialSlide);
    const slideRef = useRef(slide);
    useEffect(() => {
        slideRef.current = slide;
    }, [slide]);
    const [navTick, setNavTick] = useState(0);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<
        string | null
    >(null);
    const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
        null,
    );
    // Which settings panel the right sidebar is showing in place of the
    // slide strip. `null` means default (slide strip / annotation /
    // widget). Mutually exclusive with annotation/widget selection.
    const [sidebarPanel, setSidebarPanel] = useState<
        "demo" | "step" | "cover" | "voiceover" | null
    >(null);
    const openDemoSettings = useCallback(() => {
        setSelectedAnnotationId(null);
        setSelectedWidgetId(null);
        setSidebarPanel("demo");
    }, []);
    const openStepSettings = useCallback(() => {
        setSelectedAnnotationId(null);
        setSelectedWidgetId(null);
        setSidebarPanel("step");
    }, []);
    const openCoverSettings = useCallback((stepId: string) => {
        const next = { stepId };
        slideRef.current = next;
        setSlide((cur) =>
            slidesEqual(cur, next) ? cur : next,
        );
        setNavTick((t) => t + 1);
        setSelectedAnnotationId(null);
        setSelectedWidgetId(null);
        setSidebarPanel("cover");
    }, []);
    const openVoiceoverSettings = useCallback(() => {
        setSelectedAnnotationId(null);
        setSelectedWidgetId(null);
        setSidebarPanel("voiceover");
    }, []);
    // Whether the active step's zoom region is being edited (overlay
    // visible, stage un-zoomed) or previewed (overlay hidden, stage
    // zoomed). Resets to "editing" when the slide changes so each step
    // starts ready to tweak.
    const [zoomMode, setZoomMode] = useState<ZoomMode>("editing");
    useEffect(() => {
        setZoomMode("editing");
    }, [slide]);

    const hasConfig = "config" in parsed;
    const currentStepIndex = hasConfig
        ? parsed.config.steps.findIndex((s) => s.id === slide.stepId)
        : -1;
    const currentStep =
        hasConfig && currentStepIndex >= 0
            ? parsed.config.steps[currentStepIndex]
            : null;
    const currentStepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 0;
    const stepCount = hasConfig ? parsed.config.steps.length : 0;
    // Step-name draft is derived from the current step's label, but the
    // user can edit it locally before committing. Reset via the React
    // "derived state during render" pattern — running the reset inside an
    // effect would commit one paint with the previous step's draft still
    // in the input, which reads as a footer/header flicker on every
    // navigation. Tracking the previous step id with state lets the reset
    // happen synchronously in the same render.
    const [stepNameDraft, setStepNameDraft] = useState(currentStep?.label ?? "");
    const [draftStepId, setDraftStepId] = useState<string | undefined>(
        currentStep?.id,
    );
    if (currentStep?.id !== draftStepId) {
        setDraftStepId(currentStep?.id);
        setStepNameDraft(currentStep?.label ?? "");
    }

    const navigateTo = useCallback((next: Slide) => {
        slideRef.current = next;
        setSlide((cur) => (slidesEqual(cur, next) ? cur : next));
        setNavTick((t) => t + 1);
        setSelectedAnnotationId(null);
        setSelectedWidgetId(null);
    }, []);

    // Back-stack of visited sidebar screens. The header back button pops
    // this so it returns to the previous screen rather than always
    // snapping to the slide strip. `sidebarDirRef` drives the slide
    // direction of the screen-transition animation (forward = in from the
    // right, back = in from the left).
    const currentSidebarScreen = useMemo<SidebarScreen>(() => {
        const kind = deriveSidebarScreenKind(
            currentStep,
            sidebarPanel,
            selectedAnnotationId,
            selectedWidgetId,
        );
        return {
            kind,
            panel: sidebarPanel,
            annotationId: selectedAnnotationId,
            widgetId: selectedWidgetId,
            stepId: slide.stepId,
            sig: sidebarScreenSignature(
                kind,
                selectedAnnotationId,
                slide.stepId,
            ),
        };
    }, [
        currentStep,
        sidebarPanel,
        selectedAnnotationId,
        selectedWidgetId,
        slide.stepId,
    ]);
    const sidebarHistoryRef = useRef<SidebarScreen[]>([]);
    const prevSidebarScreenRef = useRef<SidebarScreen | null>(null);
    const sidebarBackRef = useRef(false);
    const sidebarDirRef = useRef<"forward" | "back">("forward");
    useEffect(() => {
        const prev = prevSidebarScreenRef.current;
        if (prev && prev.sig !== currentSidebarScreen.sig) {
            // A genuine screen change. Record the screen we left unless we
            // got here via the back button (which is unwinding history).
            if (!sidebarBackRef.current) {
                sidebarHistoryRef.current.push(prev);
                if (sidebarHistoryRef.current.length > 100) {
                    sidebarHistoryRef.current.shift();
                }
            }
        }
        sidebarBackRef.current = false;
        prevSidebarScreenRef.current = currentSidebarScreen;
        // Default the next transition to "forward"; goBack flips it.
        sidebarDirRef.current = "forward";
    }, [currentSidebarScreen]);

    const goBackSidebar = useCallback(() => {
        const prev = sidebarHistoryRef.current.pop();
        sidebarBackRef.current = true;
        sidebarDirRef.current = "back";
        if (!prev || prev.kind === "strip") {
            setSidebarPanel(null);
            setSelectedAnnotationId(null);
            setSelectedWidgetId(null);
            return;
        }
        if (prev.stepId && prev.stepId !== slideRef.current.stepId) {
            const next = { stepId: prev.stepId };
            slideRef.current = next;
            setSlide((cur) => (slidesEqual(cur, next) ? cur : next));
            setNavTick((t) => t + 1);
        }
        setSidebarPanel(prev.panel);
        setSelectedAnnotationId(prev.annotationId);
        setSelectedWidgetId(prev.widgetId);
    }, []);

    // Reverse channel: player → editor. Update `slide` (so the thumbnail
    // strip highlight follows the player) but DO NOT bump `navTick` — the
    // player is already on this slide, and bumping would re-fire SlideSync.
    const onPlayerSlide = useCallback((next: Slide) => {
        if (slidesEqual(slideRef.current, next)) return;
        slideRef.current = next;
        setSlide((cur) => (slidesEqual(cur, next) ? cur : next));
    }, []);

    useEffect(() => {
        if (!("config" in parsed)) return;
        const c = parsed.config;
        const stepIds = new Set(c.steps.map((s) => s.id));
        if (!stepIds.has(slide.stepId)) {
            const next = { stepId: c.steps[0]?.id ?? "" };
            slideRef.current = next;
            setSlide((cur) => (slidesEqual(cur, next) ? cur : next));
        }
        if (selectedAnnotationId) {
            const stillExists = c.steps.some(
                (s) =>
                    s.kind === "content" &&
                    s.annotations.some(
                        (a) => a.id === selectedAnnotationId,
                    ),
            );
            if (!stillExists) setSelectedAnnotationId(null);
        }
        if (selectedWidgetId) {
            const stillExists = c.steps.some(
                (s) =>
                    s.kind === "cover" &&
                    s.widgets.some((w) => w.id === selectedWidgetId),
            );
            if (!stillExists) setSelectedWidgetId(null);
        }
    }, [parsed, slide, selectedAnnotationId, selectedWidgetId]);

    const [pendingAspectRatioChange, setPendingAspectRatioChange] =
        useState<PendingAspectRatioChange | null>(null);

    const writeConfig = useCallback(
        (next: DemoConfig, prefix: string) => {
            void prefix;
            const nextSource = serializeDemoConfig(next, parsed as ParsedConfig);
            if (nextSource === source) return;
            onChange(CONFIG_PATH, nextSource);
        },
        [onChange, parsed, source],
    );

    const writeConfigWithAspectRatioWarning = useCallback(
        (next: DemoConfig, prefix: string, afterCommit?: () => void) => {
            if (!("config" in parsed)) {
                writeConfig(next, prefix);
                afterCommit?.();
                return;
            }

            const currentRatio = playerAspectRatioForConfig(parsed.config);
            const nextRatio = playerAspectRatioForConfig(next);
            if (!aspectRatiosDiffer(currentRatio, nextRatio)) {
                writeConfig(next, prefix);
                afterCommit?.();
                return;
            }

            setPendingAspectRatioChange({
                current: currentRatio,
                next: nextRatio,
                commit: () => {
                    writeConfig(next, prefix);
                    afterCommit?.();
                },
            });
        },
        [parsed, writeConfig],
    );

    const cancelAspectRatioChange = useCallback(() => {
        setPendingAspectRatioChange(null);
    }, []);

    const confirmAspectRatioChange = useCallback(() => {
        const pending = pendingAspectRatioChange;
        setPendingAspectRatioChange(null);
        pending?.commit();
    }, [pendingAspectRatioChange]);

    // Add-step UI state. Declared above the early return so the hooks
    // order stays stable between parse-success and parse-error renders.
    const [assetPickerIndex, setAssetPickerIndex] = useState<number | null>(
        null,
    );
    const [imageSettingsOpen, setImageSettingsOpen] = useState(false);

    /**
     * Upload an image file and return its public URL + dimensions —
     * shared by the widget-level media replacement flow (no step
     * insertion). Declared above the early return so the hook order
     * stays stable between parse-success and parse-error renders.
     * Returns null on failure (an alert is shown before bailing).
     */
    const uploadMediaAsset = useCallback(
        async (
            file: File,
            mediaKind: "image" | "video",
        ): Promise<{
            asset?: AssetMeta;
            path: string;
            src: string;
            width: number;
            height: number;
        } | null> => {
            const expectedPrefix = mediaKind === "image" ? "image/" : "video/";
            if (!file.type.startsWith(expectedPrefix)) {
                window.alert(
                    mediaKind === "image"
                        ? "Please choose an image file."
                        : "Please choose a video file.",
                );
                return null;
            }
            const path = `assets/${sanitizeAssetName(file.name)}`;
            const contentType = file.type || "application/octet-stream";
            let commit: Awaited<ReturnType<typeof putDemoAssetBlob>>;
            try {
                commit = await putDemoAssetBlob({
                    slug,
                    blob: file,
                    path,
                    contentType,
                    kind: mediaKind,
                });
            } catch (err) {
                toast.error(
                    err instanceof Error && err.message
                        ? err.message
                        : mediaKind === "image"
                          ? "Could not upload the image."
                          : "Could not upload the video.",
                );
                return null;
            }
            onAssetUploaded?.(commit.asset);
            onAssetsChanged();
            const dims =
                mediaKind === "image"
                    ? await measureImageFile(file)
                    : await measureVideoFile(file);
            return {
                asset: commit.asset,
                path,
                src: commit.path,
                width: dims.width,
                height: dims.height,
            };
        },
        [slug, onAssetsChanged, onAssetUploaded],
    );

    const uploadImageOnly = useCallback(
        (file: File) => uploadMediaAsset(file, "image"),
        [uploadMediaAsset],
    );

    const uploadVideoOnly = useCallback(
        (file: File) => uploadMediaAsset(file, "video"),
        [uploadMediaAsset],
    );

    const uploadMediaCombined = useCallback(
        (file: File) =>
            uploadMediaAsset(
                file,
                file.type.startsWith("video/") ? "video" : "image",
            ),
        [uploadMediaAsset],
    );

    const imageAssets = useMemo(
        () => assets.filter(isImageAsset),
        [assets],
    );

    const videoAssets = useMemo(
        () => assets.filter(isVideoAsset),
        [assets],
    );

    const mediaAssets = useMemo(
        () => assets.filter(isMediaAsset),
        [assets],
    );

    const displayConfig = useMemo<DemoConfig | null>(() => {
        if (!("config" in parsed)) return null;
        return resolveDemoAssetReferencesForDisplay(parsed.config, assets);
    }, [parsed, assets]);

    if ("error" in parsed) {
        const fail = parsed.error;
        return (
            <div className="canvas-dotted flex h-full items-center justify-center bg-[color:var(--canvas)] p-6">
                <div className="surface-lifted max-w-lg p-5 text-[13px]">
                    <p className="text-sm font-semibold text-[color:var(--ink-strong)]">
                        Editor unavailable
                    </p>
                    {fail.kind === "schema" ? (
                        <ul className="mt-2 space-y-1.5 text-[12px] text-[color:var(--ink-2)]">
                            {fail.issues.slice(0, 8).map((issue, i) => {
                                const path = issue.path.length
                                    ? issue.path.join(".")
                                    : "(root)";
                                return (
                                    <li key={i} className="leading-snug">
                                        <code className="rounded bg-[color:var(--surface)] px-1 py-0.5 font-mono text-[11px] text-[color:var(--ink-strong)]">
                                            {path}
                                        </code>{" "}
                                        — {issue.message}
                                    </li>
                                );
                            })}
                            {fail.issues.length > 8 ? (
                                <li className="text-[11px] text-muted-foreground">
                                    +{fail.issues.length - 8} more
                                </li>
                            ) : null}
                        </ul>
                    ) : (
                        <p className="mt-1 text-[color:var(--ink-2)]">
                            {fail.message}
                        </p>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                        <p className="text-[12px] text-muted-foreground">
                            Fix{" "}
                            <code className="rounded border border-[color:var(--line-soft)] bg-[color:var(--surface)] px-1 py-0.5 font-mono text-[11px]">
                                {CONFIG_PATH}
                            </code>{" "}
                            in your editor; this view reloads as soon as it parses.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const { config } = parsed;
    const prefix = "";
    const renderConfig = displayConfig ?? config;
    const themeId = config.theme?.preset ?? DEFAULT_THEME_ID;
    const themePrimary = config.theme?.tokens?.primary;
    const onChromeChange = (next: Chrome) => {
        writeConfig({ ...config, chrome: next }, prefix);
    };
    const onTitleCommit = (next: string | undefined) => {
        if ((config.title ?? undefined) === next) return;
        const { title: _drop, ...rest } = config;
        void _drop;
        writeConfig(
            next === undefined ? rest : { ...rest, title: next },
            prefix,
        );
    };
    const onSubtitleCommit = (next: string | undefined) => {
        if ((config.subtitle ?? undefined) === next) return;
        const { subtitle: _drop, ...rest } = config;
        void _drop;
        writeConfig(
            next === undefined ? rest : { ...rest, subtitle: next },
            prefix,
        );
    };
    const onBackgroundChange = (next: DemoBackground | undefined) => {
        if (!next) {
            const { background: _bg, backgroundColor: _color, ...rest } = config;
            void _bg;
            void _color;
            writeConfig(rest, prefix);
            return;
        }
        if (next.type === "color" && next.color) {
            if (
                config.background?.type === "color" &&
                config.background.color === next.color &&
                config.backgroundColor === next.color
            ) {
                return;
            }
            writeConfig(
                {
                    ...config,
                    background: next,
                    backgroundColor: next.color || DEFAULT_DEMO_BACKGROUND_COLOR,
                },
                prefix,
            );
            return;
        }
        const { backgroundColor: _drop, ...rest } = config;
        void _drop;
        writeConfig({ ...rest, background: next }, prefix);
    };
    const onThemePrimaryChange = (next: string | undefined) => {
        if ((config.theme?.tokens?.primary ?? undefined) === next) return;
        if (!next) {
            const currentTheme = config.theme ?? {};
            const { primary: _primary, ...remainingTokens } =
                currentTheme.tokens ?? {};
            void _primary;
            const nextTheme = { ...currentTheme };
            if (Object.keys(remainingTokens).length > 0) {
                nextTheme.tokens = remainingTokens;
            } else {
                delete nextTheme.tokens;
            }
            if (Object.keys(nextTheme).length === 0) {
                const { theme: _theme, ...rest } = config;
                void _theme;
                writeConfig(rest, prefix);
                return;
            }
            writeConfig({ ...config, theme: nextTheme }, prefix);
            return;
        }
        writeConfig(
            {
                ...config,
                theme: {
                    ...(config.theme ?? {}),
                    tokens: {
                        ...(config.theme?.tokens ?? {}),
                        primary: next,
                    },
                },
            },
            prefix,
        );
    };
    const updateBrand = (patch: Partial<DemoBrand>) => {
        const merged = { ...(config.theme?.brand ?? {}), ...patch };
        // Drop any field that's been cleared (undefined or empty string) —
        // DemoBrandSchema requires min(1) strings, so empties are invalid.
        const nextBrand = Object.fromEntries(
            Object.entries(merged).filter(
                ([, v]) => v !== undefined && v !== "",
            ),
        ) as DemoBrand;
        const currentTheme = config.theme ?? {};
        if (Object.keys(nextBrand).length === 0) {
            const { brand: _brand, ...remainingTheme } = currentTheme;
            void _brand;
            if (Object.keys(remainingTheme).length === 0) {
                const { theme: _theme, ...rest } = config;
                void _theme;
                writeConfig(rest, prefix);
                return;
            }
            writeConfig({ ...config, theme: remainingTheme }, prefix);
            return;
        }
        writeConfig(
            { ...config, theme: { ...currentTheme, brand: nextBrand } },
            prefix,
        );
    };
    const selectedStep =
        config.steps.find((s) => s.id === slide.stepId) ?? null;
    const slideLabel = selectedStep
        ? selectedStep.label
            ? selectedStep.label
            : selectedStep.kind === "cover"
            ? "Cover"
            : "Content"
        : "";
    const selectedAnnotation =
        selectedStep && selectedStep.kind === "content" && selectedAnnotationId
            ? selectedStep.annotations.find(
                  (a) => a.id === selectedAnnotationId,
              ) ?? null
            : null;
    const selectedCover =
        selectedStep && selectedStep.kind === "cover" ? selectedStep : null;
    const selectedWidget =
        selectedCover && selectedWidgetId
            ? selectedCover.widgets.find((w) => w.id === selectedWidgetId) ??
              null
            : null;

    const updateCover = (next: CoverStep) => {
        writeConfig(
            {
                ...config,
                steps: config.steps.map((s) => (s.id === next.id ? next : s)),
            },
            prefix,
        );
    };

    const updateStep = (stepId: string, patch: Partial<Step>) => {
        writeConfigWithAspectRatioWarning(
            {
                ...config,
                steps: config.steps.map((s) =>
                    s.id === stepId
                        ? ({ ...s, ...(patch as Record<string, unknown>) } as Step)
                        : s,
                ),
            },
            prefix,
        );
    };

    const updateAnnotation = (
        stepId: string,
        annotationId: string,
        patch: Partial<Annotation>,
    ) => {
        const normalizedPatch = { ...patch } as Record<string, unknown>;
        for (const key of ["x", "y", "w", "h"] as const) {
            const value = normalizedPatch[key];
            if (typeof value === "number") {
                normalizedPatch[key] = clamp01(value);
            }
        }
        let changed = false;
        const nextSteps = config.steps.map((step) => {
            if (step.id !== stepId || step.kind !== "content") return step;
            let stepChanged = false;
            const annotations = step.annotations.map((a) => {
                if (a.id !== annotationId) return a;
                for (const [key, value] of Object.entries(normalizedPatch)) {
                    if (
                        !Object.is(
                            (a as Record<string, unknown>)[key],
                            value,
                        )
                    ) {
                        stepChanged = true;
                        break;
                    }
                }
                return stepChanged
                    ? ({ ...a, ...normalizedPatch } as Annotation)
                    : a;
            });
            if (!stepChanged) return step;
            changed = true;
            return { ...step, annotations };
        });
        if (!changed) return;
        writeConfig(
            {
                ...config,
                steps: nextSteps,
            },
            prefix,
        );
    };

    const onUpdateAnnotation = (id: string, patch: RectPatch) => {
        if (!selectedStep) return;
        updateAnnotation(selectedStep.id, id, patch);
    };

    const replaceAnnotation = (
        stepId: string,
        annotationId: string,
        next: Annotation,
    ) => {
        writeConfig(
            {
                ...config,
                steps: config.steps.map((step) => {
                    if (step.id !== stepId || step.kind !== "content") return step;
                    return {
                        ...step,
                        annotations: step.annotations.map((a) =>
                            a.id === annotationId ? next : a,
                        ),
                    };
                }),
            },
            prefix,
        );
    };

    const addAnnotation = (kind: AddKind) => {
        if (!selectedStep || selectedStep.kind !== "content") return;
        const annotation = makeAnnotation(kind);
        writeConfig(
            {
                ...config,
                steps: config.steps.map((s) =>
                    s.id === selectedStep.id && s.kind === "content"
                        ? { ...s, annotations: [...s.annotations, annotation] }
                        : s,
                ),
            },
            prefix,
        );
        setSelectedAnnotationId(annotation.id);
    };

    const addMessageVariant = (variant: MessageVariant) => {
        if (!selectedStep || selectedStep.kind !== "content") return;
        const message: Message = makeMessage(variant);
        writeConfig(
            {
                ...config,
                steps: config.steps.map((s) =>
                    s.id === selectedStep.id && s.kind === "content"
                        ? { ...s, annotations: [...s.annotations, message] }
                        : s,
                ),
            },
            prefix,
        );
        setSelectedAnnotationId(message.id);
    };

    const removeAnnotation = (annotationId: string) => {
        if (!selectedStep || selectedStep.kind !== "content") return;
        writeConfig(
            {
                ...config,
                steps: config.steps.map((s) =>
                    s.id === selectedStep.id && s.kind === "content"
                        ? {
                              ...s,
                              annotations: s.annotations.filter(
                                  (a) => a.id !== annotationId,
                              ),
                          }
                        : s,
                ),
            },
            prefix,
        );
        setSelectedAnnotationId(null);
    };

    // Strips the zoom transform off the active step — same effect as the
    // zoom pill's trash button, surfaced to the Delete/Backspace hotkey.
    const removeZoom = () => {
        if (!selectedStep || selectedStep.kind !== "content") return;
        updateStep(selectedStep.id, { transform: undefined });
        setZoomMode("editing");
    };

    const updateStepLabel = (stepId: string, nextLabel: string) => {
        const trimmed = nextLabel.trim();
        writeConfig(
            {
                ...config,
                steps: config.steps.map((s) => {
                    if (s.id !== stepId) return s;
                    if (trimmed.length === 0) {
                        const { label: _drop, ...rest } = s;
                        void _drop;
                        return rest as Step;
                    }
                    return { ...s, label: trimmed };
                }),
            },
            prefix,
        );
    };

    const commitStepName = (nextName: string) => {
        if (!selectedStep) return;
        setStepNameDraft(nextName.trim());
        updateStepLabel(selectedStep.id, nextName);
    };

    const duplicateStep = (stepId: string) => {
        const index = config.steps.findIndex((s) => s.id === stepId);
        if (index === -1) return;
        const source = config.steps[index];
        const copy: Step =
            source.kind === "content"
                ? {
                      ...source,
                      id: generateId("step"),
                      annotations: source.annotations.map((a) => ({
                          ...a,
                          id: generateId(
                              a.type === "message" ? "msg" : a.type,
                          ),
                      })),
                  }
                : { ...source, id: generateId("step") };
        const next = [...config.steps];
        next.splice(index + 1, 0, copy);
        writeConfig({ ...config, steps: next }, prefix);
        navigateTo({ stepId: copy.id });
    };

    const deleteStep = (stepId: string) => {
        if (config.steps.length <= 1) {
            toast.error("A demo needs at least one step.");
            return;
        }
        const result = deleteStepFromConfig(config, stepId);
        if (!result) return;
        writeConfig(result.config, prefix);
        if (slide.stepId === stepId) {
            if (result.fallbackStepId) {
                navigateTo({ stepId: result.fallbackStepId });
            }
        }
    };

    const reorderSteps = (fromIndex: number, toIndex: number) => {
        if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= config.steps.length ||
            toIndex >= config.steps.length
        ) {
            return;
        }
        const next = [...config.steps];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        writeConfigWithAspectRatioWarning({ ...config, steps: next }, prefix);
    };

    const insertStep = (insertIndex: number, step: Step) => {
        const nextSteps = [...config.steps];
        nextSteps.splice(insertIndex, 0, step);
        writeConfigWithAspectRatioWarning(
            { ...config, steps: nextSteps },
            prefix,
            () => {
                navigateTo({ stepId: step.id });
            },
        );
    };

    const buildContentStepFromMedia = (
        src: string,
        kind: "image" | "video",
        naturalWidth: number,
        naturalHeight: number,
        alt?: string,
    ): Step => ({
        id: generateId("step"),
        kind: "content",
        background:
            kind === "video"
                ? {
                      type: "video",
                      src,
                      naturalWidth,
                      naturalHeight,
                      autoplay: true,
                      muted: true,
                      ...(alt ? { alt } : {}),
                  }
                : {
                      type: "image",
                      src,
                      naturalWidth,
                      naturalHeight,
                      ...(alt ? { alt } : {}),
                  },
        annotations: [],
        advance: { trigger: "auto" },
    });

    const buildCoverStep = (kind: CoverVariant): Step => {
        const defaultImage = firstContentWidgetImage(config.steps);
        switch (kind) {
            case "form":
                return {
                    id: generateId("cover"),
                    kind: "cover",
                    widgets: [makeWidget("form", defaultImage)],
                    advance: { trigger: "click" },
                };
            case "headline":
                return {
                    id: generateId("cover"),
                    kind: "cover",
                    widgets: [makeWidget("headline", defaultImage)],
                    advance: { trigger: "click" },
                };
            case "embed":
                return {
                    id: generateId("cover"),
                    kind: "cover",
                    widgets: [makeWidget("embed")],
                    advance: { trigger: "click" },
                };
            case "cta":
                return {
                    id: generateId("cover"),
                    kind: "cover",
                    widgets: [makeOutroCtaWidget()],
                    advance: { trigger: "click" },
                };
        }
    };

    // "Add image or video" / "Add from asset" both open the one canonical
    // picker (MediaAssetPickerDialog), which handles selecting an existing
    // asset and uploading a new one in a single surface. The stored index is
    // where the resulting content step gets inserted.
    const onAddMediaAt = (insertIndex: number) => {
        setAssetPickerIndex(insertIndex);
    };
    const handlePickMedia = (result: MediaPickResult) => {
        const insertIndex = assetPickerIndex;
        if (insertIndex == null) return;
        // This picker is media-only; audio never reaches it.
        if (result.mediaKind === "audio") return;
        insertStep(
            insertIndex,
            buildContentStepFromMedia(
                result.src,
                result.mediaKind,
                result.naturalWidth ?? 0,
                result.naturalHeight ?? 0,
                result.alt,
            ),
        );
    };

    const onAddCoverAt = (insertIndex: number, kind: CoverVariant) => {
        insertStep(insertIndex, buildCoverStep(kind));
    };

    const onAddIntroStep = () => {
        insertStep(0, buildCoverStep("headline"));
    };

    return (
        <div className="flex h-full w-full flex-row-reverse">
            <DeleteKeyHandler
                selectedAnnotationId={selectedAnnotationId}
                onDelete={removeAnnotation}
                zoomDeletable={
                    !selectedAnnotationId &&
                    !selectedWidgetId &&
                    selectedStep?.kind === "content" &&
                    (selectedStep.transform?.zoom ?? 1) > 1
                }
                onDeleteZoom={removeZoom}
            />
            <MediaAssetPickerDialog
                open={assetPickerIndex !== null}
                onOpenChange={(o) => {
                    if (!o) setAssetPickerIndex(null);
                }}
                title="Add image or video"
                mediaKind="media"
                currentSrc=""
                assets={mediaAssets}
                demoId={demoId}
                uploadMedia={uploadMediaCombined}
                onPick={handlePickMedia}
            />
            <AspectRatioWarningDialog
                pending={pendingAspectRatioChange}
                onCancel={cancelAspectRatioChange}
                onConfirm={confirmAspectRatioChange}
            />
            <SlideStripVideoBuffer config={renderConfig} />
            <aside className="flex h-full w-[299px] shrink-0 flex-col overflow-hidden border-l border-[color:var(--line-soft)] bg-[color:var(--surface-2)]">
                <div
                    key={currentSidebarScreen.sig}
                    className={cn(
                        "flex min-h-0 flex-1 flex-col duration-200 ease-out animate-in fade-in-0",
                        sidebarDirRef.current === "back"
                            ? "slide-in-from-left-3"
                            : "slide-in-from-right-3",
                    )}
                >
                {sidebarPanel === "demo" ? (
                    <>
                        <SidebarBreadcrumb
                            items={[
                                {
                                    label: "Steps",
                                    onClick: goBackSidebar,
                                },
                                { label: "Demo settings" },
                            ]}
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                            <DemoSettingsInspector
                                title={config.title}
                                onTitleCommit={onTitleCommit}
                                subtitle={config.subtitle}
                                onSubtitleCommit={onSubtitleCommit}
                                background={config.background}
                                backgroundColor={config.backgroundColor}
                                onBackgroundChange={onBackgroundChange}
                                themeId={themeId}
                                themePrimary={themePrimary}
                                onThemePrimaryChange={onThemePrimaryChange}
                                brand={config.theme?.brand}
                                onBrandChange={updateBrand}
                                chrome={config.chrome}
                                onChange={onChromeChange}
                                demoId={demoId}
                                assets={assets}
                                uploadImage={uploadImageOnly}
                            />
                        </div>
                    </>
                ) : sidebarPanel === "step" && selectedStep ? (
                    <>
                        <SidebarBreadcrumb
                            items={[
                                {
                                    label: "Steps",
                                    onClick: goBackSidebar,
                                },
                                { label: "Step settings" },
                            ]}
                            onOpenSettings={openDemoSettings}
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                            <StepSettingsInspector
                                step={selectedStep}
                                nameDraft={stepNameDraft}
                                onNameDraftChange={setStepNameDraft}
                                onNameCommit={commitStepName}
                                onChange={(patch) =>
                                    updateStep(selectedStep.id, patch)
                                }
                                placeholder={
                                    slideLabel || `Step ${currentStepNumber}`
                                }
                                demoId={demoId}
                                imageAssets={imageAssets}
                                videoAssets={videoAssets}
                                uploadImage={uploadImageOnly}
                                uploadVideo={uploadVideoOnly}
                                onOpenEdit={() => setImageSettingsOpen(true)}
                                onSelectAnnotation={(id) => {
                                    setSelectedAnnotationId(id);
                                    setSidebarPanel(null);
                                }}
                                onAddMessage={() => {
                                    addMessageVariant("cursor");
                                    setSidebarPanel(null);
                                }}
                            />
                        </div>
                    </>
                ) : sidebarPanel === "voiceover" ? (
                    <>
                        <SidebarBreadcrumb
                            items={[
                                {
                                    label: "Steps",
                                    onClick: goBackSidebar,
                                },
                                { label: "Voiceover" },
                            ]}
                            onOpenSettings={openDemoSettings}
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                            <VoiceoverInspector
                                steps={config.steps}
                                selectedStepId={selectedStep?.id ?? null}
                                onUpdateStep={updateStep}
                                slug={slug}
                                demoId={demoId}
                                assets={assets}
                                onAssetsChanged={onAssetsChanged}
                                onAssetUploaded={onAssetUploaded}
                                resolveAudioSrc={resolveAudioSrc}
                            />
                        </div>
                    </>
                ) : selectedAnnotation && selectedStep ? (
                    <>
                        <SidebarBreadcrumb
                            items={[
                                {
                                    label: "Steps",
                                    onClick: goBackSidebar,
                                },
                                {
                                    label:
                                        selectedAnnotation.type === "message"
                                            ? `${selectedAnnotation.type}`
                                            : selectedAnnotation.type,
                                },
                            ]}
                            rightAction={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                        removeAnnotation(selectedAnnotation.id)
                                    }
                                    aria-label="Delete annotation"
                                    title="Delete"
                                    className="size-7 text-destructive hover:text-destructive"
                                >
                                    <Trash2Icon className="size-3.5" />
                                </Button>
                            }
                            onOpenSettings={openDemoSettings}
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                            <AnnotationInspector
                                annotation={selectedAnnotation}
                                themeId={themeId}
                                onChange={(patch) =>
                                    updateAnnotation(
                                        selectedStep.id,
                                        selectedAnnotation.id,
                                        patch,
                                    )
                                }
                                onReplace={(next) =>
                                    replaceAnnotation(
                                        selectedStep.id,
                                        selectedAnnotation.id,
                                        next,
                                    )
                                }
                            />
                        </div>
                    </>
                ) : selectedCover &&
                  (selectedWidget || sidebarPanel === "cover") ? (
                    <>
                        <SidebarBreadcrumb
                            items={[
                                {
                                    label: "Steps",
                                    onClick: goBackSidebar,
                                },
                                { label: "Cover" },
                            ]}
                            onOpenSettings={openDemoSettings}
                            fadeBoundary
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                            <CoverInspector
                                step={selectedCover}
                                onChange={updateCover}
                                selectedWidgetId={selectedWidgetId}
                                onSelectWidget={setSelectedWidgetId}
                                steps={config.steps.map((s, i) => ({
                                    id: s.id,
                                    label: s.label
                                        ? `Step ${i + 1}: ${s.label}`
                                        : `Step ${i + 1}`,
                                }))}
                                demoSteps={config.steps}
                                demoId={demoId}
                                imageAssets={imageAssets}
                                uploadImage={uploadImageOnly}
                                themeId={themeId}
                                nameDraft={stepNameDraft}
                                onNameDraftChange={setStepNameDraft}
                                onNameCommit={commitStepName}
                                namePlaceholder={
                                    slideLabel || `Step ${currentStepNumber}`
                                }
                            />
                        </div>
                    </>
                ) : (
                    <SlideStrip
                        config={renderConfig}
                        themeId={themeId}
                        selectedSlide={slide}
                        onSelectSlide={navigateTo}
                        onOpenStepSettings={openStepSettings}
                        onOpenCoverSettings={openCoverSettings}
                        onAddMediaAt={onAddMediaAt}
                        onAddCoverAt={onAddCoverAt}
                        onAddIntroStep={onAddIntroStep}
                        onReorderSteps={reorderSteps}
                        onDuplicateStep={duplicateStep}
                        onDeleteStep={deleteStep}
                        canDeleteSteps={config.steps.length > 1}
                    />
                )}
                </div>
            </aside>

            <div className="relative flex min-w-0 flex-1 flex-col">
                {config.steps.length > 0 ? (
                    <>
                        <div className="min-h-0 flex-1">
                            <Stage
                                config={renderConfig}
                                slide={slide}
                                navTick={navTick}
                                onPlayerSlide={onPlayerSlide}
                                selectedAnnotationId={selectedAnnotationId}
                                onSelectAnnotation={(id) => {
                                    if (id !== null) setSidebarPanel(null);
                                    setSelectedAnnotationId(id);
                                }}
                                selectedWidgetId={selectedWidgetId}
                                onSelectWidget={(id) => {
                                    if (id !== null) setSidebarPanel(null);
                                    setSelectedWidgetId(id);
                                }}
                                onUpdateAnnotation={onUpdateAnnotation}
                                onUpdateStep={updateStep}
                                slideLabel={slideLabel}
                                currentStepNumber={currentStepNumber}
                                stepCount={stepCount}
                                stepNameDraft={stepNameDraft}
                                onStepNameDraftChange={setStepNameDraft}
                                onStepNameCommit={commitStepName}
                                zoomMode={zoomMode}
                                setZoomMode={setZoomMode}
                                themeId={themeId}
                                resolveAssetUrl={resolveAssetUri}
                            />
                        </div>
                        {selectedStep ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
                                <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-0.5 gap-y-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-1 shadow-[var(--shadow-lift)]">
                                {selectedStep.kind === "content" ? (
                                    <StepFooter
                                        step={selectedStep}
                                        onChange={(patch) =>
                                            updateStep(selectedStep.id, patch)
                                        }
                                        onAddAnnotation={addAnnotation}
                                        onAddMessage={addMessageVariant}
                                        setZoomMode={setZoomMode}
                                        onOpenDemoSettings={openDemoSettings}
                                        onOpenStepSettings={openStepSettings}
                                        onOpenVoiceover={openVoiceoverSettings}
                                        onOpenEdit={() =>
                                            setImageSettingsOpen(true)
                                        }
                                    />
                                ) : (
                                    <CoverFooter
                                        step={selectedStep}
                                        onOpenDemoSettings={openDemoSettings}
                                        onOpenStepSettings={() =>
                                            openCoverSettings(selectedStep.id)
                                        }
                                        onOpenVoiceover={openVoiceoverSettings}
                                    />
                                )}
                                </div>
                            </div>
                        ) : null}
                        {selectedStep && selectedStep.kind === "content" ? (
                            <MediaSettingsButton
                                step={selectedStep}
                                onChange={(patch) =>
                                    updateStep(selectedStep.id, patch)
                                }
                                slug={slug}
                                assets={assets}
                                onAssetsChanged={onAssetsChanged}
                                onAssetUploaded={onAssetUploaded}
                                stageAspect={resolveStageAspect(config)}
                                open={imageSettingsOpen}
                                onOpenChange={setImageSettingsOpen}
                                hideTrigger
                            />
                        ) : null}
                    </>
                ) : (
                    <div className="canvas-dotted flex h-full items-center justify-center bg-[color:var(--canvas)] text-[12px] text-muted-foreground">
                        No steps in this demo.
                    </div>
                )}
            </div>
        </div>
    );
}
