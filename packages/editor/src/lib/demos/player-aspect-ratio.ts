/**
 * Player aspect ratio derivation, shared by server viewer data and client-side
 * embed snippet generation.
 *
 * A demo's player ratio is, in priority order:
 *   1. the explicit `aspectRatio` on the demo config, when present and valid;
 *   2. the natural pixel size of the first content step's background;
 *   3. a 16 / 9 fallback when neither is available.
 */

export interface PlayerAspectRatio {
    width: number;
    height: number;
}

const DEFAULT_ASPECT_RATIO: PlayerAspectRatio = { width: 16, height: 9 };

function positivePair(width: unknown, height: unknown): PlayerAspectRatio | null {
    const w = Number(width);
    const h = Number(height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return { width: w, height: h };
    }
    return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
}

export function playerAspectRatioForConfig(config: unknown): PlayerAspectRatio {
    const cfg = asRecord(config);

    const aspectRatio = asRecord(cfg?.aspectRatio);
    const explicit = aspectRatio
        ? positivePair(aspectRatio.width, aspectRatio.height)
        : null;
    if (explicit) return explicit;

    const steps = Array.isArray(cfg?.steps) ? cfg.steps : [];
    const firstContent = steps
        .map(asRecord)
        .find((step) => step?.kind === "content");
    const background = asRecord(firstContent?.background);
    const fromBackground = background
        ? positivePair(background.naturalWidth, background.naturalHeight)
        : null;
    if (fromBackground) return fromBackground;

    return { ...DEFAULT_ASPECT_RATIO };
}
