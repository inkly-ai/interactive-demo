import type { DemoConfig } from "@inkly-org/interactive-demo";

import type { AssetMeta } from "@/lib/assets";
import { resolveAssetReference } from "@/lib/assets/resolve";

/**
 * Demo configs persist stable managed asset refs (`asset:<id>`).
 * The editor renders those configs directly in the browser, so convert asset
 * refs to fetchable display URLs without changing the saved config.
 */
export function resolveDemoAssetReferencesForDisplay(
    config: DemoConfig,
    assets: ReadonlyArray<AssetMeta>,
): DemoConfig {
    if (assets.length === 0) return config;
    return rewriteAssetReferences(config, assets);
}

function rewriteAssetReferences<T>(
    value: T,
    assets: ReadonlyArray<AssetMeta>,
): T {
    if (typeof value === "string") {
        return (resolveAssetReference(assets, value) ?? value) as T;
    }
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const rewritten = rewriteAssetReferences(item, assets);
            if (rewritten !== item) changed = true;
            return rewritten;
        });
        return (changed ? next : value) as T;
    }
    if (value && typeof value === "object") {
        let changed = false;
        const entries = Object.entries(value).map(([key, item]) => {
            const next = rewriteAssetReferences(item, assets);
            if (next !== item) changed = true;
            return [key, next] as const;
        });
        return (changed ? Object.fromEntries(entries) : value) as T;
    }
    return value;
}
