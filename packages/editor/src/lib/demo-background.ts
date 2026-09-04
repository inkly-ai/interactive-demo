import type { DemoBackground } from "@inkly-org/interactive-demo";

export const DEFAULT_DEMO_BACKGROUND_COLOR = "#f5f5f5";

type LegacyDemoBackground =
    | { type: "solid"; color: string }
    | { type: "gradient"; from: string; to: string }
    | { type: "wallpaper"; src: string; alt?: string };

export type DemoBackgroundConfig = {
    background?: DemoBackground | LegacyDemoBackground;
    backgroundColor?: string;
};

export type DemoBackgroundStyle = {
    [key: `--${string}`]: string | undefined;
    background?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundPosition?: string;
    backgroundRepeat?: string;
    backgroundSize?: string;
};

export const MAX_DEMO_BACKGROUND_BLUR = 48;

// Mirrors the `.canvas-dotted` backdrop used across the editor shell (see
// globals.css → `--dot: rgba(0,0,0,0.08)`). Keep these values in lockstep
// so the player canvas reads identically to the editor canvas.

export function resolveDemoBackground(
    config: DemoBackgroundConfig,
): DemoBackground {
    if (config.background) {
        if (config.background.type === "solid") {
            return { type: "color", color: config.background.color };
        }
        if (config.background.type === "gradient") {
            return {
                type: "color",
                from: config.background.from,
                to: config.background.to,
            };
        }
        if (config.background.type === "wallpaper") {
            return {
                type: "image",
                src: config.background.src,
                alt: config.background.alt,
            };
        }
        return config.background;
    }
    if (config.backgroundColor) {
        return { type: "color", color: config.backgroundColor };
    }
    return { type: "none" };
}

export function demoBackgroundToStyle(
    background: DemoBackground | null | undefined,
    resolveSrc?: (src: string) => string,
): DemoBackgroundStyle | null {
    if (!background) return null;
    switch (background.type) {
        case "none":
            return null;
        case "color":
            if (background.from && background.to) {
                return {
                    background: `linear-gradient(135deg, ${background.from}, ${background.to})`,
                };
            }
            return { background: background.color ?? DEFAULT_DEMO_BACKGROUND_COLOR };
        case "image": {
            const src = resolveSrc ? resolveSrc(background.src ?? "") : background.src;
            if (!src) return null;
            const blur = demoBackgroundBlur(background);
            return {
                ...(blur > 0
                    ? {
                          "--demo-canvas-background-color":
                              DEFAULT_DEMO_BACKGROUND_COLOR,
                          "--demo-canvas-background-image": `url("${escapeCssUrl(src)}")`,
                          "--demo-canvas-background-blur": `${blur}px`,
                          "--demo-canvas-background-scale": `${1 + Math.min(0.12, blur / 240)}`,
                      }
                    : null),
                backgroundColor: DEFAULT_DEMO_BACKGROUND_COLOR,
                backgroundImage: `url("${escapeCssUrl(src)}")`,
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
            };
        }
    }
}

export function demoBackgroundBlur(
    background: DemoBackground | null | undefined,
): number {
    if (background?.type !== "image") return 0;
    if (
        typeof background.blur !== "number" ||
        !Number.isFinite(background.blur)
    ) {
        return 0;
    }
    return Math.min(MAX_DEMO_BACKGROUND_BLUR, Math.max(0, background.blur));
}

function escapeCssUrl(value: string): string {
    return value.replace(/["\\\n\r\f]/g, (char) => `\\${char}`);
}
