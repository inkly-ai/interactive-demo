import {
    findAssetReferenceEntry,
    type AssetReferenceEntry,
} from "@/lib/assets/resolve";

export function normalizeDemoResourcePath(value: string): string {
    return String(value || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/^\.\//, "");
}

export function isExternalDemoResource(value: string): boolean {
    return /^(https?:|data:|blob:|mailto:|tel:)/i.test(value);
}

function isSafeDemoResourcePath(value: string): boolean {
    const rel = normalizeDemoResourcePath(value);
    if (!rel || rel.length > 1000) return false;
    if (rel.includes("\0") || rel.includes("..")) return false;
    return rel.split("/").every((part) => Boolean(part) && part !== ".");
}

function encodeResourcePath(resourcePath: string): string {
    return normalizeDemoResourcePath(resourcePath)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
}

/**
 * URL of a file inside a demo as the dev server serves it:
 * `/<slug>/<rel>` (assets live at `/<slug>/assets/<file>`). Each path
 * segment is percent-encoded.
 */
export function demoFileUrl(demoSlug: string, resourcePath: string): string {
    const slug = demoSlug.split("/").map(encodeURIComponent).join("/");
    return `/${slug}/${encodeResourcePath(resourcePath)}`;
}

/**
 * Resolve an authored background/asset reference to a URL the browser can
 * fetch from the editor page. Resolution order, mirroring the manifest +
 * runtime rules:
 *   1. `asset:<id>` → manifest entry: `publicUrl` if present, else the
 *      dev-server file URL built from the entry's `path`.
 *   2. External / `data:` / `blob:` URLs pass through.
 *   3. An already-absolute `/…` URL passes through.
 *   4. A demo-relative path → dev-server file URL.
 */
export function resolveEditorAssetUrl(
    assets: ReadonlyArray<AssetReferenceEntry>,
    src: string | null | undefined,
    ctx: { demoSlug: string },
): string {
    if (!src) return "";

    const entry = findAssetReferenceEntry(assets, src);
    if (entry) {
        if (entry.publicUrl) return entry.publicUrl;
        if (entry.path && isSafeDemoResourcePath(entry.path)) {
            return demoFileUrl(ctx.demoSlug, entry.path);
        }
        return src;
    }

    if (isExternalDemoResource(src)) return src;
    if (src.startsWith("/")) return src;
    if (isSafeDemoResourcePath(src)) {
        return demoFileUrl(ctx.demoSlug, src);
    }
    return src;
}
