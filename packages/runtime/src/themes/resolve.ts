import type { Brand, DemoBrand, ThemeTokens } from '../schema';

import { demoThemePresetsById } from "./catalog";
import { DEFAULT_DEMO_THEME_ID } from "./token-defaults";
import type { DemoThemePreset } from "./types";

export { DEFAULT_DEMO_THEME_ID } from "./token-defaults";

export type DemoThemeConfig = {
    preset?: string;
    tokens?: Partial<ThemeTokens>;
} | null | undefined;

export type HostThemeConfig = {
    theme?: string;
    tokens?: Partial<ThemeTokens>;
    /**
     * Host-level brand. `resolveDemoBrand` keeps only player-safe identity
     * fields (logo / wordmark / logoHref), so host CTAs never enter player
     * chrome.
     */
    brand?: Brand | null;
} | null | undefined;

export type ResolvedDemoTheme = {
    themeId: string;
    preset?: DemoThemePreset;
    tokens: ThemeTokens;
    css: string;
};

export function resolveDemoTheme({
    demoTheme,
    host,
    fallbackThemeId = DEFAULT_DEMO_THEME_ID,
}: {
    demoTheme?: DemoThemeConfig;
    host?: HostThemeConfig;
    fallbackThemeId?: string;
} = {}): ResolvedDemoTheme {
    const requestedThemeId =
        demoTheme?.preset ?? host?.theme ?? fallbackThemeId;
    const themeId = demoThemePresetsById[requestedThemeId]
        ? requestedThemeId
        : fallbackThemeId;
    const preset =
        demoThemePresetsById[themeId] ??
        demoThemePresetsById[DEFAULT_DEMO_THEME_ID];

    return {
        themeId: preset?.id ?? themeId,
        preset,
        tokens: {
            ...(preset?.theme ?? {}),
            ...(host?.tokens ?? {}),
            ...(demoTheme?.tokens ?? {}),
        },
        css: preset?.css ?? "",
    };
}

export function extractDemoTheme(config: unknown): DemoThemeConfig {
    if (config === null || typeof config !== "object") return null;
    const theme = (config as { theme?: unknown }).theme;
    if (!theme || typeof theme !== "object") return null;

    const obj = theme as { preset?: unknown; tokens?: unknown };
    return {
        preset: typeof obj.preset === "string" ? obj.preset : undefined,
        tokens:
            obj.tokens && typeof obj.tokens === "object"
                ? (obj.tokens as Partial<ThemeTokens>)
                : undefined,
    };
}

export function extractDemoBrand(config: unknown): DemoBrand | undefined {
    if (config === null || typeof config !== "object") return undefined;
    const theme = (config as { theme?: unknown }).theme;
    if (!theme || typeof theme !== "object") return undefined;
    const brand = (theme as { brand?: unknown }).brand;
    if (!brand || typeof brand !== "object") return undefined;
    return brand as DemoBrand;
}

/**
 * Merge host-level brand identity under a per-demo brand override (per-field,
 * demo wins). Only identity fields are eligible for player chrome.
 * Returns `undefined` when neither side contributes a field so callers can
 * omit `theme.brand` entirely.
 */
export function resolveDemoBrand({
    demoBrand,
    hostBrand,
}: {
    demoBrand?: DemoBrand | null;
    hostBrand?: Brand | null;
}): DemoBrand | undefined {
    const merged: Record<string, unknown> = {};
    const identityKeys = new Set(['logo', 'name', 'logoHref']);
    for (const src of [hostBrand, demoBrand]) {
        if (!src || typeof src !== "object") continue;
        for (const [key, value] of Object.entries(src)) {
            if (!identityKeys.has(key)) continue;
            if (value !== undefined) merged[key] = value;
        }
    }
    return Object.keys(merged).length > 0
        ? (merged as DemoBrand)
        : undefined;
}

export function injectResolvedThemeIntoConfig<T>(
    config: T,
    tokens: ThemeTokens,
    brand?: DemoBrand,
): T {
    if (config === null || typeof config !== "object") return config;
    const obj = config as Record<string, unknown>;
    const existingTheme =
        obj.theme && typeof obj.theme === "object"
            ? (obj.theme as Record<string, unknown>)
            : {};

    return {
        ...obj,
        theme: {
            ...existingTheme,
            tokens,
            ...(brand ? { brand } : {}),
        },
    } as T;
}
