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

export function playerAspectRatioFromConfigJson(
    raw: string | undefined | null,
): PlayerAspectRatio {
    if (!raw) return { ...DEFAULT_ASPECT_RATIO };
    try {
        return playerAspectRatioForConfig(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_ASPECT_RATIO };
    }
}

export function playerHeaderHeight(themeId: string | null | undefined): number {
    if (themeId === "mono") return 48;
    return 51;
}

export function playerVerticalChromeHeightForConfig(config: unknown): number {
    const cfg = asRecord(config);
    const chrome = asRecord(cfg?.chrome);
    if (chrome?.hideHeader === true) return 0;
    const theme = asRecord(cfg?.theme);
    const preset = typeof theme?.preset === "string" ? theme.preset : "mono";
    return playerHeaderHeight(preset);
}

export function playerVerticalChromeHeightFromConfigJson(
    raw: string | undefined | null,
): number {
    if (!raw) return playerHeaderHeight("mono");
    try {
        return playerVerticalChromeHeightForConfig(JSON.parse(raw));
    } catch {
        return playerHeaderHeight("mono");
    }
}
