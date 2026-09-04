import type { Annotation, DemoConfig, Step } from "@inkly-org/interactive-demo";

export function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

export function backgroundSrc(step: Step): string | null {
    if (step.kind === "content") {
        if (step.background?.type === "image") return step.background.src;
        if (step.background?.type === "video") return step.background.src;
    }
    if (step.kind === "cover") {
        // Cover steps no longer carry a top-level `preview` — a headline
        // or form widget's optional image stands in as the thumbnail.
        const widget = step.widgets[0];
        if (
            (widget?.type === "headline" || widget?.type === "form") &&
            widget.image
        ) {
            return widget.image.src;
        }
        return null;
    }
    return null;
}

/** First content step's still image: the image itself, or a video's poster. */
export function firstContentfulImageSrc(
    steps: readonly Step[],
): string | undefined {
    for (const s of steps) {
        if (s.kind !== "content") continue;
        const bg = s.background;
        if (bg?.type === "image" && bg.src) return bg.src;
        if (bg?.type === "video" && bg.posterSrc) return bg.posterSrc;
    }
    return undefined;
}

export function backgroundPosterSrc(step: Step): string | null {
    if (step.kind === "content" && step.background?.type === "video") {
        return step.background.posterSrc ?? null;
    }
    return null;
}

export function backgroundKind(step: Step): "image" | "video" | null {
    if (step.kind === "content") {
        if (step.background?.type === "video") return "video";
        if (step.background?.type === "image") return "image";
    }
    return null;
}

export function isRectAnnotation(a: Annotation): boolean {
    if (a.type === "blur") return true;
    if (a.type === "message" && a.variant === "area") return true;
    return false;
}

export function getRect(
    a: Annotation,
): { x: number; y: number; w: number; h: number } {
    const x = "x" in a ? a.x : 0;
    const y = "y" in a ? a.y : 0;
    const w = "w" in a && typeof a.w === "number" ? a.w : 0.2;
    const h = "h" in a && typeof a.h === "number" ? a.h : 0.2;
    return { x, y, w, h };
}

export type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

export const ALL_HANDLES: ReadonlyArray<HandlePos> = [
    "tl",
    "t",
    "tr",
    "r",
    "br",
    "b",
    "bl",
    "l",
];

export type XAxis = "left" | "right" | null;
export type YAxis = "top" | "bottom" | null;

export type HandleSpec = {
    xMove: XAxis;
    yMove: YAxis;
    cursor: string;
};

// For each handle, `xMove` / `yMove` say which edge moves on that axis
// (`null` = that axis is locked, e.g. the top edge handle leaves x/w alone).
// The drag math then anchors the *opposite* edge so the locked side stays
// put and the moving side tracks the pointer.
export const HANDLE_SPECS: Record<HandlePos, HandleSpec> = {
    tl: { xMove: "left", yMove: "top", cursor: "nwse-resize" },
    t: { xMove: null, yMove: "top", cursor: "ns-resize" },
    tr: { xMove: "right", yMove: "top", cursor: "nesw-resize" },
    r: { xMove: "right", yMove: null, cursor: "ew-resize" },
    br: { xMove: "right", yMove: "bottom", cursor: "nwse-resize" },
    b: { xMove: null, yMove: "bottom", cursor: "ns-resize" },
    bl: { xMove: "left", yMove: "bottom", cursor: "nesw-resize" },
    l: { xMove: "left", yMove: null, cursor: "ew-resize" },
};

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Map a step's `transform` { zoom, x, y } to a rect in normalized stage
 * coordinates. The relationship comes from the CSS `transform-origin`
 * model: scaling by Z around the focal point (fx, fy) keeps that focal
 * point fixed in viewport space, so the visible portion of the image
 * becomes a rect of size 1/Z whose left edge sits at fx*(1 - 1/Z).
 *
 * We constrain the rect to a square in normalized space — which equals the
 * stage's aspect ratio in pixel space, since each axis is normalized
 * independently. That keeps zoom uniform across axes.
 */
export function transformToRect(
    t: NonNullable<Extract<Step, { kind: "content" }>["transform"]>,
): {
    left: number;
    top: number;
    size: number;
} {
    const size = clamp01(1 / Math.max(t.zoom, 1));
    const left = clamp01(t.x * (1 - size));
    const top = clamp01(t.y * (1 - size));
    return { left, top, size };
}

export function rectToTransform(left: number, top: number, size: number): {
    zoom: number;
    x: number;
    y: number;
} {
    const s = Math.min(Math.max(size, 0.05), 1);
    const zoom = 1 / s;
    // When s === 1 the focal divisor is 0 — but that's the no-zoom case
    // and the caller drops the transform entirely, so we never hit it.
    const denom = 1 - s;
    const x = denom > 0 ? clamp01(left / denom) : 0.5;
    const y = denom > 0 ? clamp01(top / denom) : 0.5;
    return { zoom, x, y };
}

/**
 * Mirror of the player's own aspect-ratio resolution
 * (the runtime's PlayerFrame): explicit `config.aspectRatio` wins,
 * else fall back to the first content step's natural dims, else 16:9.
 */
export function resolveStageAspect(config: DemoConfig): number {
    if (config.aspectRatio) {
        return config.aspectRatio.width / config.aspectRatio.height;
    }
    const firstContent = config.steps.find((s) => s.kind === "content");
    if (firstContent && firstContent.kind === "content") {
        const w = firstContent.background.naturalWidth;
        const h = firstContent.background.naturalHeight;
        if (w > 0 && h > 0) return w / h;
    }
    return 16 / 9;
}
