/**
 * Single source of truth for matching and resolving media reference strings:
 * a demo-relative path (`assets/shot.png`) matches the folder entry with that
 * path. External URLs pass through unchanged.
 *
 * Pure: no I/O, no globals. Caller passes the entries to match
 * against — anywhere we have the folder listing already loaded.
 *
 * Every surface that resolves a reference routes through here; adding
 * another `if (src.startsWith(...))` branch in one place without the
 * others is how broken images creep in.
 */

export interface AssetReferenceEntry {
    path?: string;
    publicUrl?: string | null;
}

function isExternalAssetReference(src: string): boolean {
    return /^(https?:|data:|blob:)/i.test(src);
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function findAssetReferenceEntry<T extends AssetReferenceEntry>(
    assets: ReadonlyArray<T>,
    src: string | null | undefined,
): T | null {
    if (!src || isExternalAssetReference(src) || src.startsWith("/")) return null;
    const wanted = normalizePath(src);
    return assets.find((asset) => asset.path && normalizePath(asset.path) === wanted) ?? null;
}

export function resolveAssetReference(
    assets: ReadonlyArray<AssetReferenceEntry>,
    src: string,
): string | null {
    if (!src) return null;
    const entry = findAssetReferenceEntry(assets, src);
    if (entry?.publicUrl) return entry.publicUrl;
    if (isExternalAssetReference(src)) return src;
    if (src.startsWith("/assets/")) return null;
    return src;
}
