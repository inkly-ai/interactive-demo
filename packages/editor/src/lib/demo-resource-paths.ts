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

export function isSafeDemoResourcePath(value: string): boolean {
    const rel = normalizeDemoResourcePath(value);
    if (!rel || rel.length > 1000) return false;
    if (rel.includes("\0") || rel.includes("..")) return false;
    return rel.split("/").every((part) => Boolean(part) && part !== ".");
}

export function contentTypeForDemoResource(path: string): string {
    const rel = normalizeDemoResourcePath(path).toLowerCase();
    if (rel.endsWith(".html") || rel.endsWith(".htm")) return "text/html; charset=utf-8";
    if (rel.endsWith(".css")) return "text/css; charset=utf-8";
    if (rel.endsWith(".js") || rel.endsWith(".mjs")) return "text/javascript; charset=utf-8";
    if (rel.endsWith(".json")) return "application/json; charset=utf-8";
    if (rel.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
    if (rel.endsWith(".png")) return "image/png";
    if (rel.endsWith(".jpg") || rel.endsWith(".jpeg")) return "image/jpeg";
    if (rel.endsWith(".gif")) return "image/gif";
    if (rel.endsWith(".webp")) return "image/webp";
    if (rel.endsWith(".avif")) return "image/avif";
    if (rel.endsWith(".ico")) return "image/x-icon";
    if (rel.endsWith(".mp4")) return "video/mp4";
    if (rel.endsWith(".webm")) return "video/webm";
    if (rel.endsWith(".mov")) return "video/quicktime";
    if (rel.endsWith(".mp3")) return "audio/mpeg";
    if (rel.endsWith(".wav")) return "audio/wav";
    if (rel.endsWith(".ogg")) return "audio/ogg";
    if (rel.endsWith(".woff")) return "font/woff";
    if (rel.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
}

export function isTextLikeDemoResource(path: string): boolean {
    return /^(text\/|application\/(json|javascript)|image\/svg\+xml)/i.test(
        contentTypeForDemoResource(path),
    );
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
