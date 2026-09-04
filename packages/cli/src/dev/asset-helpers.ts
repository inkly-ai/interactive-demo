/**
 * Asset helpers shared by the editor API. Ported from the pre-pivot web
 * app's `lib/assets/{types,id}.ts` and `lib/platform-hub/assets-upload.ts`;
 * the bodies are unchanged so ids and limits match what the editor and the
 * old capture pipeline produced.
 */

export const MAX_ASSET_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Validate a demo-relative asset path. Throws on traversal or absolute
 * paths. Mirrors the same defensive checks the build pipeline does on
 * text files.
 */
export function assertSafeAssetPath(path: string): void {
    if (!path || path.length === 0) {
        throw new Error("Asset path cannot be empty.");
    }
    if (path.includes("\0")) {
        throw new Error("Asset path contains a null byte.");
    }
    if (path.startsWith("/")) {
        throw new Error("Asset path must be relative (no leading '/').");
    }
    if (path.includes("\\")) {
        throw new Error("Asset path must use forward slashes.");
    }
    if (path.split("/").some((seg) => seg === "..")) {
        throw new Error("Asset path must not contain '..' segments.");
    }
}

function assetIdStem(assetPath: string): string {
    const fileName = assetPath.split("/").pop() ?? "";
    const stem = fileName.replace(/\.[^.]+$/, "");
    const cleaned = stem
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return cleaned || "asset";
}

function stablePathHash(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

/** Stable, readable asset id: `<name>-<hash16>-<pathhash>`. */
export function generatedAssetId(assetPath: string, sha256: string): string {
    return `${assetIdStem(assetPath)}-${sha256.slice(0, 16)}-${stablePathHash(assetPath)}`;
}

/**
 * The generated id for a new asset, suffixed `-2`, `-3`, … when an existing
 * entry already uses it.
 */
export function nextGeneratedAssetId(
    assets: ReadonlyArray<{ id: string }>,
    assetPath: string,
    sha256: string,
): string {
    const ids = new Set(assets.map((asset) => asset.id));
    const baseId = generatedAssetId(assetPath, sha256);
    if (!ids.has(baseId)) return baseId;
    for (let i = 2; ; i += 1) {
        const candidate = `${baseId}-${i}`;
        if (!ids.has(candidate)) return candidate;
    }
}
