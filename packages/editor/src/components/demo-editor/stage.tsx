/*
 * Editor stage: hosts the real <Demo> player, the per-annotation drag
 * wrappers, the zoom-selection overlay, and the player-state observer.
 */
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import {
    AnnotationEditModeContext,
    Demo,
    builtInAnnotations,
    resolveControlsMode,
    useDemoPlayerContext,
    type Annotation,
    type AnnotationRenderer,
    type AnnotationRendererMap,
    type DemoConfig,
    type DemoControlsVisibility,
    type DemoLayout,
    type DemoSize,
    type Step,
} from "@inkly-org/interactive-demo";
import { Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    injectResolvedThemeIntoConfig,
    resolveDemoTheme,
} from "@inkly-org/interactive-demo/themes";
import {
    demoBackgroundBlur,
    demoBackgroundToStyle,
    resolveDemoBackground,
} from "@/lib/demo-background";
import {
    ALL_HANDLES,
    HANDLE_SPECS,
    clamp01,
    getRect,
    isRectAnnotation,
    rectToTransform,
    transformToRect,
    type Corner,
    type HandlePos,
    type HandleSpec,
} from "./geometry";
import {
    EditorCtx,
    NavCtx,
    slidesEqual,
    useEditorCtx,
    type EditorCtxValue,
    type NavCtxValue,
    type RectPatch,
    type Slide,
    type ZoomMode,
} from "./context";


// ─── stage: real <Demo> player + per-annotation drag wrappers ──────────────

/**
 * Lives inside `<Demo>` so it can dispatch player actions. Reads
 * `slide` / `navTick` from `NavCtx` so its enclosing layout function can be
 * a stable module-level reference — recreating the layout on every parent
 * render would force `<Demo>`'s `<Layout />` child to remount (different
 * function identity = different component type), wiping every descendant's
 * state, including the drag wrapper's `dragRef`.
 *
 * Skips when `navTick` is 0 (initial mount) — the player should sit at its
 * natural starting state (cover if defined, else step 0). The `navTick`
 * guard is also StrictMode-safe (unlike a ref-based `initial` flag, which
 * persists through the double-invoke and fires on the second mount).
 */
export function SlideSync() {
    const nav = useContext(NavCtx);
    const { controls } = useDemoPlayerContext();
    const slideRef = useRef<Slide | null>(nav?.slide ?? null);
    // `controls` from usePlayerController is memoized on [isPlaying, ...],
    // so it gets a new identity every time the player pauses/plays. Reading
    // it via a ref prevents that churn from re-running the navigation effect.
    const controlsRef = useRef(controls);
    useEffect(() => {
        slideRef.current = nav?.slide ?? null;
        controlsRef.current = controls;
    });
    useEffect(() => {
        if (!nav?.navTick) return;
        const cur = slideRef.current;
        if (!cur) return;
        const c = controlsRef.current;
        c.seekToStep(cur.stepId);
        c.pause();
    }, [nav?.navTick]);
    return null;
}

/**
 * Listens for Delete / Backspace globally. When an annotation is selected
 * and focus isn't in a form control, removes the annotation — same effect
 * as clicking the inspector's "Delete" button. When no annotation is
 * selected but the active step's zoom region is the live editable element,
 * removes the zoom instead — same effect as the zoom pill's trash button.
 *
 * Lives as a child component (rather than inline in DemoEditorView) so the
 * hooks always run in the same order — DemoEditorView's `if (parsed has
 * error) return ...` early branch would otherwise put us on the wrong side
 * of React's rules-of-hooks.
 */
export function DeleteKeyHandler({
    selectedAnnotationId,
    onDelete,
    zoomDeletable,
    onDeleteZoom,
}: {
    selectedAnnotationId: string | null;
    onDelete: (id: string) => void;
    zoomDeletable: boolean;
    onDeleteZoom: () => void;
}) {
    const ref = useRef({
        selectedAnnotationId,
        onDelete,
        zoomDeletable,
        onDeleteZoom,
    });
    useEffect(() => {
        ref.current = {
            selectedAnnotationId,
            onDelete,
            zoomDeletable,
            onDeleteZoom,
        };
    });
    useEffect(() => {
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== "Delete" && e.key !== "Backspace") return;
            const target = e.target;
            // Don't hijack the key while the user is editing a form field
            // (Backspace would otherwise delete the annotation instead of
            // a character).
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement
            ) {
                return;
            }
            if (
                target instanceof HTMLElement &&
                target.isContentEditable
            ) {
                return;
            }
            const cur = ref.current;
            if (cur.selectedAnnotationId) {
                e.preventDefault();
                cur.onDelete(cur.selectedAnnotationId);
                return;
            }
            if (cur.zoomDeletable) {
                e.preventDefault();
                cur.onDeleteZoom();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);
    return null;
}

/**
 * Watches the player's reducer state and reports the *derived* slide back
 * up to the editor via `NavCtx.onPlayerSlide`. Keeps the thumbnail strip
 * highlight aligned with the player when the user advances via the player's
 * own controls (Next/Prev, cover Continue, auto-advance ticks).
 */
export function PlayerStateObserver() {
    const nav = useContext(NavCtx);
    const { demo, state } = useDemoPlayerContext();
    const onPlayerSlideRef = useRef(nav?.onPlayerSlide);
    const lastReportedSlideRef = useRef<Slide | null>(null);
    useEffect(() => {
        onPlayerSlideRef.current = nav?.onPlayerSlide;
    });
    useEffect(() => {
        if (!demo) return;
        const stepId =
            demo.steps[state.currentStepIndex]?.id ?? state.currentStepId;
        const next = { stepId };
        const last = lastReportedSlideRef.current;
        if (last && slidesEqual(last, next)) return;
        lastReportedSlideRef.current = next;
        onPlayerSlideRef.current?.(next);
    }, [demo, state.currentStepId, state.currentStepIndex]);
    return null;
}

/**
 * Wraps a built-in annotation render so the visible element itself becomes
 * the drag target. `display: contents` keeps the wrapper out of the
 * annotation layer's flow (so the inner element's absolute positioning is
 * unaffected); `onPointerDownCapture` intercepts clicks in the capture phase
 * before the inner button can fire its advance handler.
 *
 * Critically, handlers are read via `ctxRef` (not destructured into the
 * effect's closure) so the document-level pointermove listener is attached
 * exactly once per annotation lifetime. Without this, every drag-induced
 * config write re-renders the parent → new handler identities → effect
 * cleanup runs → listeners detach mid-drag → drag visibly stops after a
 * few pixels.
 */
export function ResizeHandle({
    annotation,
    handle,
    onDragStart,
    onDragEnd,
}: {
    annotation: Annotation;
    handle: HandlePos;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}) {
    const ctx = useEditorCtx();
    const playerCtx = useDemoPlayerContext();
    const ctxRef = useRef(ctx);
    const playerCtxRef = useRef(playerCtx);
    const annotationRef = useRef(annotation);
    const onDragEndRef = useRef(onDragEnd);
    useEffect(() => {
        ctxRef.current = ctx;
        playerCtxRef.current = playerCtx;
        annotationRef.current = annotation;
        onDragEndRef.current = onDragEnd;
    });

    const dragRef = useRef<{
        stageRect: DOMRect;
        anchorX: number;
        anchorY: number;
        spec: HandleSpec;
    } | null>(null);

    const handlePointerDown = (
        e: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const stageEl = (e.target as HTMLElement).closest(
            ".demo-stage",
        ) as HTMLElement | null;
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        const { x, y, w, h } = getRect(annotationRef.current);
        const spec = HANDLE_SPECS[handle];
        // Anchor each axis at the edge that should stay fixed.
        const anchorX = spec.xMove === "left" ? x + w : x;
        const anchorY = spec.yMove === "top" ? y + h : y;
        dragRef.current = {
            stageRect: rect,
            anchorX,
            anchorY,
            spec,
        };
        onDragStart?.();
        playerCtxRef.current.controls.pause();
        ctxRef.current.onSelectAnnotation(annotation.id);
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        let rafId = 0;
        let pendingPatch: RectPatch | null = null;
        const flush = () => {
            rafId = 0;
            const patch = pendingPatch;
            pendingPatch = null;
            if (!patch) return;
            ctxRef.current.onUpdateAnnotation(annotation.id, patch);
        };
        const queuePatch = (patch: RectPatch) => {
            pendingPatch = patch;
            if (rafId === 0) {
                rafId = window.requestAnimationFrame(flush);
            }
        };
        const onMoveDoc = (ev: globalThis.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const px = clamp01(
                (ev.clientX - drag.stageRect.left) / drag.stageRect.width,
            );
            const py = clamp01(
                (ev.clientY - drag.stageRect.top) / drag.stageRect.height,
            );
            const patch: RectPatch = {};
            // Update the x-axis only if the handle owns that direction. Use
            // min(pointer, anchor) + abs(...) so the rect can flip past its
            // anchor without inverting w.
            if (drag.spec.xMove !== null) {
                patch.x = Math.min(px, drag.anchorX);
                patch.w = Math.max(Math.abs(drag.anchorX - px), 0.01);
            }
            if (drag.spec.yMove !== null) {
                patch.y = Math.min(py, drag.anchorY);
                patch.h = Math.max(Math.abs(drag.anchorY - py), 0.01);
            }
            queuePatch(patch);
            ev.preventDefault();
        };
        const onUp = () => {
            if (rafId !== 0) {
                window.cancelAnimationFrame(rafId);
                flush();
            }
            const drag = dragRef.current;
            if (drag) {
                dragRef.current = null;
                onDragEndRef.current?.();
            }
        };
        document.addEventListener("pointermove", onMoveDoc);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
        return () => {
            if (rafId !== 0) {
                window.cancelAnimationFrame(rafId);
            }
            document.removeEventListener("pointermove", onMoveDoc);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
        };
    }, [annotation.id]);

    const { x, y, w, h } = getRect(annotation);
    const spec = HANDLE_SPECS[handle];
    // Position the handle at the moving edge / corner. For locked axes the
    // handle sits in the middle of the rect on that axis.
    const left =
        spec.xMove === "left"
            ? x
            : spec.xMove === "right"
            ? x + w
            : x + w / 2;
    const top =
        spec.yMove === "top"
            ? y
            : spec.yMove === "bottom"
            ? y + h
            : y + h / 2;

    return (
        <div
            className="resize-handle"
            data-handle={handle}
            onPointerDown={handlePointerDown}
            style={{
                position: "absolute",
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                cursor: spec.cursor,
            }}
        />
    );
}

export function EditorAnnotationWrapper({
    annotation,
    children,
}: {
    annotation: Annotation;
    children: ReactNode;
}) {
    const ctx = useEditorCtx();
    const playerCtx = useDemoPlayerContext();
    const ctxRef = useRef(ctx);
    const playerCtxRef = useRef(playerCtx);
    useEffect(() => {
        ctxRef.current = ctx;
        playerCtxRef.current = playerCtx;
    });

    const isSelected = ctx.selectedAnnotationId === annotation.id;
    const showHandles = isSelected && isRectAnnotation(annotation);

    // Drag-aware flag. The blanket `transition: none` rule that used to
    // sit on `.editor-annotation` killed every editor transition,
    // including the smooth pan when the zoom toggles between editing and
    // preview. Scoping the no-transition rule to `[data-dragging]` only
    // disables it while a move/resize is actually in flight, so zoom and
    // step changes can animate again.
    const [isDragging, setIsDragging] = useState(false);
    const beginDrag = useCallback(() => setIsDragging(true), []);
    const endDrag = useCallback(() => setIsDragging(false), []);

    const dragRef = useRef<{
        stageRect: DOMRect;
        offsetX: number;
        offsetY: number;
        /** Element-edge offsets relative to the anchor, expressed as
         *  fractions of the stage's width/height. Captured once at drag
         *  start so we can keep the *whole* rendered annotation (label
         *  included) inside the stage instead of just the anchor point.
         *  `null` when the rendered element isn't available — falls back
         *  to clamping the anchor to [0, 1]. */
        bounds: {
            leftF: number;
            rightF: number;
            topF: number;
            bottomF: number;
        } | null;
    } | null>(null);

    const handlePointerDown = (
        e: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const target = e.target as HTMLElement;
        // Resize-handle clicks fire the wrapper's capture handler too — let
        // the handle's own logic take over by short-circuiting here.
        if (target.closest(".resize-handle")) {
            return;
        }
        // Prev/next nav buttons inside the callout footer wire directly to
        // `controls.prev` / `controls.next` (they bypass the editor's
        // no-op `onAdvance`). If we still selected the annotation here on
        // capture, the inspector would open for one frame and then close
        // as the slide advances and the annotation falls out of the
        // current step — a visible flicker. Let the click pass through.
        if (target.closest(".demo-callout-nav-button")) {
            return;
        }
        const stageEl = target.closest(".demo-stage") as HTMLElement | null;
        if (!stageEl) return;
        const rect = stageEl.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const ax = "x" in annotation ? annotation.x : 0;
        const ay = "y" in annotation ? annotation.y : 0;
        // The wrapper uses `display: contents`, so `currentTarget` has no
        // box of its own; reach into the first rendered child for the
        // annotation root and measure its (post-transform) bounding rect.
        const wrapper = e.currentTarget as HTMLElement;
        const annotationEl =
            wrapper.firstElementChild as HTMLElement | null;
        let bounds: {
            leftF: number;
            rightF: number;
            topF: number;
            bottomF: number;
        } | null = null;
        if (annotationEl) {
            const er = annotationEl.getBoundingClientRect();
            bounds = {
                leftF: (er.left - rect.left) / rect.width - ax,
                rightF: (er.right - rect.left) / rect.width - ax,
                topF: (er.top - rect.top) / rect.height - ay,
                bottomF: (er.bottom - rect.top) / rect.height - ay,
            };
        }
        dragRef.current = {
            stageRect: rect,
            offsetX: px - ax,
            offsetY: py - ay,
            bounds,
        };
        beginDrag();
        // Pause the player on drag-start so auto-advance can't slide the
        // current step out from underneath the drag mid-motion (which would
        // unmount this wrapper and lose `dragRef`).
        playerCtxRef.current.controls.pause();
        ctxRef.current.onSelectAnnotation(annotation.id);
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        let rafId = 0;
        let pendingPatch: RectPatch | null = null;
        const flush = () => {
            rafId = 0;
            const patch = pendingPatch;
            pendingPatch = null;
            if (!patch) return;
            ctxRef.current.onUpdateAnnotation(annotation.id, patch);
        };
        const queuePatch = (patch: RectPatch) => {
            pendingPatch = patch;
            if (rafId === 0) {
                rafId = window.requestAnimationFrame(flush);
            }
        };
        const onMoveDoc = (ev: globalThis.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const px =
                (ev.clientX - drag.stageRect.left) / drag.stageRect.width;
            const py =
                (ev.clientY - drag.stageRect.top) / drag.stageRect.height;
            let nx = px - drag.offsetX;
            let ny = py - drag.offsetY;
            const b = drag.bounds;
            if (b) {
                // Keep the rendered element fully inside the stage.
                // For x: anchor + leftF >= 0 and anchor + rightF <= 1.
                // If the element is wider/taller than the stage the
                // allowed range collapses — fall back to clamp01.
                const minX = -b.leftF;
                const maxX = 1 - b.rightF;
                nx = maxX >= minX
                    ? Math.max(minX, Math.min(maxX, nx))
                    : clamp01(nx);
                const minY = -b.topF;
                const maxY = 1 - b.bottomF;
                ny = maxY >= minY
                    ? Math.max(minY, Math.min(maxY, ny))
                    : clamp01(ny);
            } else {
                nx = clamp01(nx);
                ny = clamp01(ny);
            }
            queuePatch({
                x: clamp01(nx),
                y: clamp01(ny),
            });
            ev.preventDefault();
        };
        const onUp = () => {
            if (rafId !== 0) {
                window.cancelAnimationFrame(rafId);
                flush();
            }
            const drag = dragRef.current;
            if (drag) {
                dragRef.current = null;
                endDrag();
            }
        };
        document.addEventListener("pointermove", onMoveDoc);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
        return () => {
            if (rafId !== 0) {
                window.cancelAnimationFrame(rafId);
            }
            document.removeEventListener("pointermove", onMoveDoc);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
        };
    }, [annotation.id, endDrag]);

    return (
        <div
            style={{ display: "contents" }}
            onPointerDownCapture={handlePointerDown}
            data-editor-selected={isSelected ? "" : undefined}
            data-dragging={isDragging ? "" : undefined}
            className={cn(
                "editor-annotation",
                isSelected && "editor-annotation-selected",
            )}
        >
            {children}
            {showHandles
                ? ALL_HANDLES.map((h) => (
                      <ResizeHandle
                          key={h}
                          annotation={annotation}
                          handle={h}
                          onDragStart={beginDrag}
                          onDragEnd={endDrag}
                      />
                  ))
                : null}
        </div>
    );
}

// Module-level renderer constants. Stable identity is the whole point —
// passing fresh function references via the `components` prop would force
// `<Demo.Stage>` to remount every annotation on each parent re-render
// (since `Renderer` becomes a different component type), wiping drag state.
const BuiltinMessage = builtInAnnotations.message;
const BuiltinBlur = builtInAnnotations.blur;
const BuiltinText = builtInAnnotations.text;

const EditorMessageRenderer: AnnotationRenderer = (props) => (
    <EditorAnnotationWrapper annotation={props.annotation}>
        <BuiltinMessage {...props} onAdvance={() => undefined} />
    </EditorAnnotationWrapper>
);
const EditorBlurRenderer: AnnotationRenderer = (props) => (
    <EditorAnnotationWrapper annotation={props.annotation}>
        <BuiltinBlur {...props} onAdvance={() => undefined} />
    </EditorAnnotationWrapper>
);
const EditorTextRenderer: AnnotationRenderer = (props) => (
    <EditorAnnotationWrapper annotation={props.annotation}>
        <BuiltinText {...props} onAdvance={() => undefined} />
    </EditorAnnotationWrapper>
);

const editorRenderers: AnnotationRendererMap = {
    message: EditorMessageRenderer,
    blur: EditorBlurRenderer,
    text: EditorTextRenderer,
};

/**
 * Editor-only chrome painted over the cover widget grid: hover halo +
 * persistent selection outline keyed to `data-widget-id`. Lives as a
 * `<style>` tag (rather than per-element JSX) because the package owns
 * the `<Widgets>` markup — adding wrappers from the host would require
 * a renderer override per widget kind, which is overkill for a visual
 * affordance.
 */
export function WidgetEditorStyles({
    selectedWidgetId,
}: {
    selectedWidgetId: string | null;
}) {
    const selectedRule = selectedWidgetId
        ? `.demo-widget[data-widget-id="${CSS_escapeAttr(selectedWidgetId)}"] {
             outline: 2px solid var(--accent, #5b6cff);
             outline-offset: 6px;
             border-radius: 6px;
           }`
        : "";
    const css = `
        .demo-player[data-step-kind="cover"] .demo-widget {
            cursor: pointer;
            transition: outline-color 120ms ease;
        }
        .demo-player[data-step-kind="cover"] .demo-widget:hover {
            outline: 1px dashed color-mix(in oklab, var(--accent, #5b6cff) 60%, transparent);
            outline-offset: 6px;
            border-radius: 6px;
        }
        ${selectedRule}
    `;
    return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * Minimal CSS attribute escaper — widget ids are generated with
 * `[A-Za-z0-9_-]` so a hostile id is unlikely, but quote-escape just in
 * case an authored id ever sneaks in via the Code tab.
 */
export function CSS_escapeAttr(s: string): string {
    return s.replace(/["\\]/g, "\\$&");
}

/**
 * Draggable + resizable selection rect for the active step's zoom region.
 * Rendered as a sibling of `.demo-stage` inside `.demo-player-shell`,
 * which is `position: relative` with the stage at `inset: 0`, so percent
 * positioning maps directly to 0–1 stage coordinates.
 *
 * Dragging the body moves the focal point. Dragging a corner handle
 * resizes the rect (aspect-locked to the stage). The rect represents the
 * region that fills the viewport once "Zoom Preview" is toggled.
 *
 * Hidden when the active slide isn't a step, when no transform is set, or
 * when in preview mode (the stage is doing the zoom itself).
 */
export function ZoomSelectionOverlay() {
    const ctx = useEditorCtx();
    const playerCtx = useDemoPlayerContext();
    const ctxRef = useRef(ctx);
    const playerCtxRef = useRef(playerCtx);
    useEffect(() => {
        ctxRef.current = ctx;
        playerCtxRef.current = playerCtx;
    });

    type MoveDrag = {
        kind: "move";
        rect: DOMRect;
        stepId: string;
        size: number;
        startLeft: number;
        startTop: number;
        startPx: number;
        startPy: number;
    };
    type ResizeDrag = {
        kind: "resize";
        rect: DOMRect;
        stepId: string;
        anchorX: number;
        anchorY: number;
    };
    const dragRef = useRef<MoveDrag | ResizeDrag | null>(null);

    useEffect(() => {
        // rAF-throttle the config writes. Each pointermove updates the
        // pending transform in a ref; a single rAF callback per frame
        // actually calls onUpdateStep. Without this, fast drags fire one
        // setFiles per pointermove, and the cascade through the player's
        // effects (re-parse demo, dispatch AUDIO_TIME, etc.) can pile up
        // mid-event and trip React's "Maximum update depth" guard.
        let rafId = 0;
        let pending: {
            stepId: string;
            transform: ReturnType<typeof rectToTransform>;
        } | null = null;
        const flush = () => {
            rafId = 0;
            const p = pending;
            pending = null;
            if (!p) return;
            ctxRef.current.onUpdateStep(p.stepId, { transform: p.transform });
        };
        const onMove = (ev: globalThis.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const px = (ev.clientX - drag.rect.left) / drag.rect.width;
            const py = (ev.clientY - drag.rect.top) / drag.rect.height;
            let t: ReturnType<typeof rectToTransform>;
            if (drag.kind === "move") {
                const maxLeft = 1 - drag.size;
                const maxTop = 1 - drag.size;
                const left = Math.min(
                    Math.max(drag.startLeft + (px - drag.startPx), 0),
                    Math.max(maxLeft, 0),
                );
                const top = Math.min(
                    Math.max(drag.startTop + (py - drag.startPy), 0),
                    Math.max(maxTop, 0),
                );
                t = rectToTransform(left, top, drag.size);
            } else {
                // Resize from the opposite corner (anchorX, anchorY). New
                // size is the larger of the two axes so the rect "follows"
                // the pointer in whichever direction moved further. Aspect
                // is locked (square in normalized space).
                const dx = px - drag.anchorX;
                const dy = py - drag.anchorY;
                const absX = Math.abs(dx);
                const absY = Math.abs(dy);
                let size = Math.max(absX, absY);
                // Clamp so the rect stays within [0, 1] in both axes.
                const maxSizeX = dx >= 0 ? 1 - drag.anchorX : drag.anchorX;
                const maxSizeY = dy >= 0 ? 1 - drag.anchorY : drag.anchorY;
                size = Math.max(0.05, Math.min(size, maxSizeX, maxSizeY));
                const left = dx >= 0 ? drag.anchorX : drag.anchorX - size;
                const top = dy >= 0 ? drag.anchorY : drag.anchorY - size;
                t = rectToTransform(left, top, size);
            }
            pending = { stepId: drag.stepId, transform: t };
            if (!rafId) rafId = requestAnimationFrame(flush);
            ev.preventDefault();
        };
        const onUp = () => {
            dragRef.current = null;
            // Drop any queued frame — pointerup means we already have the
            // user's final position from the last pointermove, and that
            // write has either landed or is about to in the queued frame.
            // Letting it run is fine; cancelling would also be fine.
            if (pending && !rafId) {
                rafId = requestAnimationFrame(flush);
            }
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);

    const { demo, state } = playerCtx;
    const currentStep = demo?.steps[state.currentStepIndex];
    if (!demo || !currentStep) return null;
    if (currentStep.kind !== "content") return null;
    if (ctx.zoomMode !== "editing") return null;
    // Source the transform via the player's current step id (single
    // source of truth) instead of comparing the editor's activeStepId
    // against the player's current id. The two are eventually
    // consistent but diverge for one render during navigation, and
    // that gap flashed the dim backdrop off between adjacent zoomed
    // steps.
    const transform = ctx.getAuthoredTransform(currentStep.id);
    if (!transform) return null;
    const stepId = currentStep.id;

    const { left, top, size } = transformToRect(transform);

    const beginMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const shell = (e.currentTarget as HTMLElement).closest(
            ".demo-player-shell",
        ) as HTMLElement | null;
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        dragRef.current = {
            kind: "move",
            rect,
            stepId,
            size,
            startLeft: left,
            startTop: top,
            startPx: (e.clientX - rect.left) / rect.width,
            startPy: (e.clientY - rect.top) / rect.height,
        };
        playerCtxRef.current.controls.pause();
        e.preventDefault();
        e.stopPropagation();
    };

    const beginResize = (corner: Corner) =>
        (e: ReactPointerEvent<HTMLDivElement>) => {
            const shell = (e.currentTarget as HTMLElement).closest(
                ".demo-player-shell",
            ) as HTMLElement | null;
            if (!shell) return;
            const rect = shell.getBoundingClientRect();
            // Anchor is the opposite corner of the one being dragged.
            const anchorX =
                corner === "ne" || corner === "se" ? left : left + size;
            const anchorY =
                corner === "sw" || corner === "se" ? top : top + size;
            dragRef.current = {
                kind: "resize",
                rect,
                stepId,
                anchorX,
                anchorY,
            };
            playerCtxRef.current.controls.pause();
            e.preventDefault();
            e.stopPropagation();
        };

    return (
        <div
            className="zoom-selection"
            onPointerDown={beginMove}
            style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                width: `${size * 100}%`,
                height: `${size * 100}%`,
            }}
            title="Zoom region — drag to move, drag a corner to resize"
        >
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <div
                    key={corner}
                    className="zoom-selection__handle"
                    data-corner={corner}
                    onPointerDown={beginResize(corner)}
                />
            ))}
        </div>
    );
}

/**
 * Floating control pill anchored to the bottom-center of the player
 * shell. Houses the "Zoom Preview" / "Edit Zoom" toggle, the trash, and
 * a help icon. Visible whenever the active step has a zoom transform.
 * Lives next to the selection overlay so the controls stay close to
 * what they affect.
 */
export function ZoomControlsPill() {
    const ctx = useEditorCtx();
    const playerCtx = useDemoPlayerContext();
    const { demo, state } = playerCtx;
    const currentStep = demo?.steps[state.currentStepIndex];
    if (!demo || !currentStep) return null;
    if (currentStep.kind !== "content") return null;
    // Lookup by the player's current step id — see ZoomSelectionOverlay
    // for the rationale (avoids a one-frame mismatch with the editor's
    // activeStepId that flickered the pill off between zoomed steps).
    const transform = ctx.getAuthoredTransform(currentStep.id);
    if (!transform) return null;
    const stepId = currentStep.id;

    const previewing = ctx.zoomMode === "preview";

    return (
        <div
            className="zoom-pill"
            // Stop pointer events from reaching the stage (which would
            // toggle the package's userZoomedOut state on click).
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <button
                type="button"
                className="zoom-pill__primary cursor-pointer"
                onClick={() =>
                    ctx.setZoomMode(previewing ? "editing" : "preview")
                }
                title={
                    previewing
                        ? "Return to editing the zoom region"
                        : "Preview how the step will look zoomed"
                }
            >
                {previewing ? "Edit Zoom" : "Zoom Preview"}
            </button>
            <button
                type="button"
                className="zoom-pill__icon cursor-pointer"
                onClick={() => {
                    ctx.onUpdateStep(stepId, { transform: undefined });
                    ctx.setZoomMode("editing");
                }}
                title="Remove zoom from this step"
                aria-label="Remove zoom"
            >
                <Trash2Icon className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

type StageProps = {
    config: DemoConfig;
    slide: Slide;
    navTick: number;
    onPlayerSlide: (slide: Slide) => void;
    selectedAnnotationId: string | null;
    onSelectAnnotation: (id: string | null) => void;
    selectedWidgetId: string | null;
    onSelectWidget: (id: string | null) => void;
    onUpdateAnnotation: (id: string, patch: RectPatch) => void;
    onUpdateStep: (stepId: string, patch: Partial<Step>) => void;
    slideLabel: string;
    currentStepNumber: number;
    stepCount: number;
    stepNameDraft: string;
    onStepNameDraftChange: (value: string) => void;
    onStepNameCommit: (value: string) => void;
    zoomMode: ZoomMode;
    setZoomMode: (mode: ZoomMode) => void;
    /** Preset id used for `data-demo-theme` scoped CSS and preset tokens so
     * the Editor paints the same chrome the player does. */
    themeId?: string;
    resolveAssetUri?: (uri: string) => string;
};

/**
 * Drop-in replacement for the package's internal `PlayerShell` — needed
 * because the package doesn't export one, and we want a custom layout that
 * injects `<StepSync />` while otherwise rendering identically to the
 * default layout. Mirrors the package's class names, data attributes,
 * sizing CSS vars, and keyboard handlers so the chrome paints exactly the
 * same as the non-editor preview.
 */
export function PlayerShellMirror({
    size,
    controls: controlsVisibility,
    children,
}: {
    size: DemoSize;
    controls: DemoControlsVisibility;
    children: ReactNode;
}) {
    const { demo, controls, state } = useDemoPlayerContext();
    const shellRef = useRef<HTMLDivElement | null>(null);
    const keyboardActiveRef = useRef(false);
    const firstContentStep =
        demo?.steps.find(
            (s): s is Extract<Step, { kind: "content" }> =>
                s.kind === "content",
        ) ?? null;
    const sizing = demo?.aspectRatio
        ? { w: demo.aspectRatio.width, h: demo.aspectRatio.height }
        : firstContentStep
          ? {
                w: firstContentStep.background.naturalWidth,
                h: firstContentStep.background.naturalHeight,
            }
          : null;
    const shellStyle = sizing
        ? ({
              "--demo-stage-w": sizing.w,
              "--demo-stage-h": sizing.h,
          } as CSSProperties)
        : undefined;

    const handleKeyDown = useCallback(
        (event: globalThis.KeyboardEvent) => {
            if (isTextEditingTarget(event.target)) return;
            switch (event.key) {
                case "ArrowLeft":
                    event.preventDefault();
                    controls.prev();
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    controls.next();
                    break;
                case " ":
                    if (event.target instanceof HTMLButtonElement) return;
                    event.preventDefault();
                    controls.toggle();
                    break;
                case "m":
                case "M":
                    controls.toggleMute();
                    break;
            }
        },
        [controls],
    );

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell) return undefined;

        const activateIfInside = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && shell.contains(target)) {
                keyboardActiveRef.current = true;
            }
        };
        const deactivateIfOutside = (event: Event) => {
            const target = event.target;
            if (target instanceof Node && !shell.contains(target)) {
                keyboardActiveRef.current = false;
            }
        };
        const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
            if (!keyboardActiveRef.current) return;
            handleKeyDown(event);
        };

        document.addEventListener("pointerdown", activateIfInside, true);
        document.addEventListener("pointerdown", deactivateIfOutside, true);
        document.addEventListener("focusin", activateIfInside, true);
        document.addEventListener("focusin", deactivateIfOutside, true);
        document.addEventListener("keydown", onDocumentKeyDown, true);
        return () => {
            document.removeEventListener("pointerdown", activateIfInside, true);
            document.removeEventListener("pointerdown", deactivateIfOutside, true);
            document.removeEventListener("focusin", activateIfInside, true);
            document.removeEventListener("focusin", deactivateIfOutside, true);
            document.removeEventListener("keydown", onDocumentKeyDown, true);
        };
    }, [handleKeyDown]);

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell || !keyboardActiveRef.current) return;
        const activeElement = document.activeElement;
        if (
            activeElement === document.body ||
            activeElement === document.documentElement ||
            activeElement === null
        ) {
            shell.focus({ preventScroll: true });
        }
    }, [state.currentStepId]);

    return (
        <div
            ref={shellRef}
            className="demo-player-shell"
            data-size={size}
            data-controls={controlsVisibility}
            style={shellStyle}
            tabIndex={0}
            onFocus={() => {
                keyboardActiveRef.current = true;
            }}
        >
            {children}
        </div>
    );
}

function isTextEditingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    );
}

export function HeaderChromeGate() {
    const { demo } = useDemoPlayerContext();
    const hideHeader = demo?.chrome?.hideHeader ?? false;
    return hideHeader ? null : <Demo.Header />;
}

// Player-controls gate. Mirrors the package's DefaultLayout so the editor
// canvas honors the tri-state `controls` chrome flag:
//   - `hidden`  → no bar at all.
//   - `minimal` → compact bar.
//   - `full`    → full transport.
// The bar rides along on cover steps too (it used to hide there) so the
// viewer always has a transport/nav affordance — covers, including
// full-bleed embeds, otherwise leave no way to advance.
export function ControlsChromeGate() {
    const { demo } = useDemoPlayerContext();
    const controlsMode = resolveControlsMode(demo?.chrome);
    if (controlsMode === "hidden") return null;
    return <Demo.Controls variant={controlsMode} />;
}

export function MobileFooterChromeGate() {
    const { demo } = useDemoPlayerContext();
    const mobileFooterMessage = demo?.chrome?.mobileFooterMessage ?? true;
    return mobileFooterMessage ? <Demo.MobileFooter /> : null;
}

// Module-level layout. Stable identity is critical — passing a fresh
// function to `<Demo layout={...} />` each render would force the inner
// `<Layout />` element to be a *different* component type each frame, and
// React would unmount/remount everything underneath (including the drag
// wrapper, wiping `dragRef` mid-drag).
const editorLayout: DemoLayout = ({ size, controls, components }) => (
    <>
        <HeaderChromeGate />
        <PlayerShellMirror size={size} controls={controls}>
            <Demo.Stage components={components} />
            <Demo.Captions />
            <ControlsChromeGate />
            <ZoomSelectionOverlay />
            <ZoomControlsPill />
        </PlayerShellMirror>
        <MobileFooterChromeGate />
        <SlideSync />
        <PlayerStateObserver />
    </>
);

export function Stage({
    config,
    slide,
    navTick,
    onPlayerSlide,
    selectedAnnotationId,
    onSelectAnnotation,
    selectedWidgetId,
    onSelectWidget,
    onUpdateAnnotation,
    onUpdateStep,
    currentStepNumber,
    stepCount,
    zoomMode,
    setZoomMode,
    themeId,
    resolveAssetUri,
}: StageProps) {
    // The Editor renders `<Demo>` directly so it can pass drag/select
    // renderers. Use the shared theme resolver here too, matching the
    // preview and published runtime shells: inject resolved tokens into
    // the config and inject the preset's scoped CSS alongside the player.
    const resolvedTheme = useMemo(
        () =>
            resolveDemoTheme({
                demoTheme: config.theme,
                fallbackThemeId: themeId,
            }),
        [config.theme, themeId],
    );
    const renderedConfig = useMemo<DemoConfig>(() => {
        const cfg = injectResolvedThemeIntoConfig(config, resolvedTheme.tokens);
        if (zoomMode === "preview") return cfg;
        // Force every content step's zoom to 1 in editing mode — not just
        // the active one. The previous "active step only" carve-out meant
        // navigating to a new slide briefly rendered it at its baked zoom
        // (because activeStepId hadn't caught up to the player's
        // currentStepIndex yet) and then re-rendered at zoom 1, producing
        // a visible 600ms zoom-out animation on every slide change.
        // Forcing all steps keeps the editor a consistent un-zoomed surface
        // and confines the zoom→1 transition to the deliberate
        // "Zoom Preview" toggle. Keep x/y so the toggle-to-preview
        // transition still pivots around the right focal point.
        let changed = false;
        const steps = cfg.steps.map((s) => {
            if (
                s.kind === "content" &&
                s.transform &&
                s.transform.zoom > 1
            ) {
                changed = true;
                return {
                    ...s,
                    transform: { ...s.transform, zoom: 1 },
                } as Step;
            }
            return s;
        });
        return changed ? { ...cfg, steps } : cfg;
    }, [config, zoomMode, resolvedTheme.tokens]);

    // Memoized lookup by step id. The overlay + control pill key on
    // the *player's* current step id (not the editor's `activeStepId`)
    // so step-to-step navigation doesn't briefly drop the dim
    // backdrop. See EditorCtxValue.getAuthoredTransform jsdoc.
    const getAuthoredTransform = useCallback<
        EditorCtxValue["getAuthoredTransform"]
    >(
        (stepId) => {
            const step = config.steps.find((s) => s.id === stepId);
            if (!step || step.kind !== "content") return null;
            const t = step.transform;
            if (!t || t.zoom <= 1) return null;
            return t;
        },
        [config],
    );

    const editorCtxValue = useMemo<EditorCtxValue>(
        () => ({
            selectedAnnotationId,
            onSelectAnnotation,
            selectedWidgetId,
            onSelectWidget,
            onUpdateAnnotation,
            onUpdateStep,
            zoomMode,
            setZoomMode,
            getAuthoredTransform,
        }),
        [
            selectedAnnotationId,
            onSelectAnnotation,
            selectedWidgetId,
            onSelectWidget,
            onUpdateAnnotation,
            onUpdateStep,
            zoomMode,
            setZoomMode,
            getAuthoredTransform,
        ],
    );

    const navCtxValue = useMemo<NavCtxValue>(
        () => ({ slide, navTick, onPlayerSlide }),
        [slide, navTick, onPlayerSlide],
    );
    const canvasBackground = resolveDemoBackground(config);
    const canvasStyle = demoBackgroundToStyle(canvasBackground) as
        | CSSProperties
        | undefined;
    const hasBlurredCanvasBackground = demoBackgroundBlur(canvasBackground) > 0;

    return (
        <div
            className={cn(
                "flex h-full w-full flex-col items-stretch",
                hasBlurredCanvasBackground && "demo-canvas-background-blur",
                canvasBackground.type !== "none"
                    ? ""
                    : "canvas-dotted bg-[color:var(--canvas)]",
            )}
            style={canvasStyle}
            onClick={(e) => {
                // Click outside the player shell deselects.
                if (e.target === e.currentTarget) {
                    onSelectAnnotation(null);
                }
            }}
        >
            <div className="flex shrink-0 items-center justify-end gap-4 px-6 pt-4 pb-3">
                <span className="shrink-0 text-[11px] text-muted-foreground">
                    {currentStepNumber > 0
                        ? `Step ${currentStepNumber} of ${stepCount}`
                        : "Step"}
                </span>
            </div>
            {resolvedTheme.css ? (
                <style dangerouslySetInnerHTML={{ __html: resolvedTheme.css }} />
            ) : null}
            <WidgetEditorStyles selectedWidgetId={selectedWidgetId} />
            <div className="flex min-h-0 flex-1 items-center justify-center pb-14 [container-type:size]">
                {/* Let `.demo-player` own its own width clamp — its CSS
                    does `min(100%, 960px, calc(540px × ratio), calc(100cqh
                    × ratio))`, so any wrapper cap here would only fight
                    with it and drift the moment the package retunes the
                    formula. `container-type: size` lives on the outer
                    flex container (which has a definite height from
                    `flex-1`) so the player's `100cqh` term resolves
                    against the editor's available area. Putting it on
                    this auto-height inner wrapper would create a sizing
                    loop and collapse the player. */}
                <div
                    className="w-full"
                    onClickCapture={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (!target) return;
                        const cell = target.closest(
                            "[data-widget-id]",
                        ) as HTMLElement | null;
                        if (!cell) return;
                        const id = cell.getAttribute("data-widget-id");
                        if (!id) return;
                        // Cover-only — content steps have no widgets, so
                        // the closest() walk is a no-op there anyway.
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectWidget(id);
                        onSelectAnnotation(null);
                    }}
                >
                    <EditorCtx.Provider value={editorCtxValue}>
                        <NavCtx.Provider value={navCtxValue}>
                            <AnnotationEditModeContext.Provider value={true}>
                                <Demo
                                    config={renderedConfig}
                                    size="md"
                                    components={editorRenderers}
                                    layout={editorLayout}
                                    themeId={resolvedTheme.themeId}
                                    resolveAssetUri={resolveAssetUri}
                                />
                            </AnnotationEditModeContext.Provider>
                        </NavCtx.Provider>
                    </EditorCtx.Provider>
                </div>
            </div>
        </div>
    );
}
