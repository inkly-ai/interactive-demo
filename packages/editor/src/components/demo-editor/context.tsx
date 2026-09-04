import { createContext, useContext } from "react";
import type { Step } from "@inkly-org/interactive-demo";

/**
 * Editor's view of "what's selected in the strip". Both content and
 * cover are just step kinds inside `demo.steps`, so there's a single shape
 * — the selected step id. Kept as an object (instead of bare `string`)
 * so reverse-channel updates from the player are explicit and so we
 * can extend later without a breaking change.
 */
export type Slide = { stepId: string };

export function slidesEqual(a: Slide, b: Slide): boolean {
    return a.stepId === b.stepId;
}

export type RectPatch = {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
};

export type ZoomMode = "editing" | "preview";

export type EditorCtxValue = {
    selectedAnnotationId: string | null;
    onSelectAnnotation: (id: string | null) => void;
    /** Selected widget id on a cover step (sidebar shows WidgetInspector). */
    selectedWidgetId: string | null;
    onSelectWidget: (id: string | null) => void;
    /**
     * Apply a partial rect patch to the annotation. Used for both move
     * (just x/y) and resize (x/y/w/h depending on which corner was grabbed).
     */
    onUpdateAnnotation: (id: string, patch: RectPatch) => void;
    /**
     * Patch a step in-place. Used by the zoom selection overlay (drag /
     * resize updates `step.transform` each frame).
     */
    onUpdateStep: (stepId: string, patch: Partial<Step>) => void;
    /**
     * Whether the zoom-selection overlay is being edited or previewed.
     * In "editing" mode the rendered config forces `transform.zoom` to 1
     * on every content step (keeping each step's x/y so the
     * `transform-origin` stays at the focal). This way the editor stage
     * stays a consistent un-zoomed surface — navigating slides never
     * snaps through a partially-zoomed frame — and the scale transition
     * on the "Zoom Preview" toggle still pivots around the right focal.
     */
    zoomMode: ZoomMode;
    setZoomMode: (mode: ZoomMode) => void;
    /**
     * Lookup the *authored* transform for a step by id. The overlay +
     * control pill read this since the rendered config has `zoom`
     * forced to 1 in editing mode.
     *
     * Sourced as a lookup (not a precomputed "active step" object) so
     * callers can key on the player's `currentStep.id`. The editor's
     * `slide.stepId` and the player's `state.currentStepIndex` are
     * eventually consistent but diverge for one render during step
     * navigation; gating overlay visibility on the editor side caused
     * the dim backdrop to flash off for one frame between two zoomed
     * steps. Reading by the player's current id eliminates the gap.
     */
    getAuthoredTransform: (
        stepId: string,
    ) => NonNullable<Extract<Step, { kind: "content" }>["transform"]> | null;
};

export const EditorCtx = createContext<EditorCtxValue | null>(null);

export function useEditorCtx(): EditorCtxValue {
    const v = useContext(EditorCtx);
    if (!v) throw new Error("EditorCtx provider missing");
    return v;
}

export type NavCtxValue = {
    slide: Slide;
    navTick: number;
    /**
     * Reverse channel: the player reports its derived slide so the editor
     * (and the thumbnail strip) stays in sync when the user advances via
     * the player's own controls — Next/Prev, the cover Continue button,
     * auto-advance ticks, etc. Updating `slide` here intentionally does
     * NOT bump `navTick`, so `SlideSync` won't re-fire and dispatch the
     * player back to where it already is (avoiding a loop).
     */
    onPlayerSlide: (slide: Slide) => void;
};

export const NavCtx = createContext<NavCtxValue | null>(null);
