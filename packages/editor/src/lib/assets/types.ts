/**
 * Shape of one entry in a demo's `assets.json` as the editor sees it. The
 * dev server owns the manifest; the editor reads it and uploads new bytes
 * through the local API.
 */

export interface AssetMeta {
    /** Stable id referenced from demo config as `asset:<id>`. */
    id?: string;
    /** Demo-relative path, e.g. "assets/logo.png". Forward slashes. */
    path: string;
    /** Stable manifest reference, e.g. "asset:<id>". */
    uri?: string;
    /** URL the editor can load the bytes from (served by the dev server). */
    publicUrl?: string;
    /** Content hash recorded by the dev server at upload time. */
    sha256?: string;
    /** MIME type recorded at upload time. */
    contentType: string;
    /** Size in bytes. */
    size: number;
}

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
