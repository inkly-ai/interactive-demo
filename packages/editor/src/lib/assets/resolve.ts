/**
 * Single source of truth for matching and resolving asset reference strings:
 * only `asset:<id>` is a managed manifest reference. External URLs pass
 * through unchanged; demo-relative paths are left for the file resolver.
 *
 * Pure: no I/O, no globals. Caller passes the entries to match
 * against — anywhere we have an assets manifest already loaded.
 *
 * Every surface that resolves a reference routes through here; adding
 * another `if (src.startsWith(...))` branch in one place without the
 * others is how broken images creep in.
 */

export interface AssetReferenceEntry {
    id?: string;
    path?: string;
    uri?: string;
    publicUrl?: string | null;
}

function isExternalAssetReference(src: string): boolean {
    return /^(https?:|data:|blob:)/i.test(src);
}

export function findAssetReferenceEntry<T extends AssetReferenceEntry>(
    assets: ReadonlyArray<T>,
    src: string | null | undefined,
): T | null {
    if (!src) return null;

    if (src.startsWith("asset:")) {
        const id = src.slice("asset:".length);
        if (!id) return null;
        return assets.find((asset) => asset.id === id) ?? null;
    }

    return null;
}

export function resolveAssetReference(
    assets: ReadonlyArray<AssetReferenceEntry>,
    src: string,
): string | null {
    if (!src) return null;
    const entry = findAssetReferenceEntry(assets, src);
    if (entry?.publicUrl) return entry.publicUrl;
    if (isExternalAssetReference(src)) return src;
    if (src.startsWith("asset:")) return null;
    if (src.startsWith("/assets/")) return null;
    return src;
}
