import type { AssetMeta } from "@/lib/assets";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|aac|flac)$/i;

function normalizedContentType(asset: AssetMeta): string {
    return asset.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
}

export function measureImageFile(
    file: File,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
            const dims = {
                width: img.naturalWidth || img.width || 1,
                height: img.naturalHeight || img.height || 1,
            };
            URL.revokeObjectURL(url);
            resolve(dims);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read image dimensions"));
        };
        img.src = url;
    });
}

export function measureImageUrl(
    url: string,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
            resolve({
                width: img.naturalWidth || img.width || 1,
                height: img.naturalHeight || img.height || 1,
            });
        };
        img.onerror = () => resolve({ width: 1440, height: 900 });
        img.src = url;
    });
}

export function isImageAsset(asset: AssetMeta): boolean {
    const contentType = normalizedContentType(asset);
    if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
        return false;
    }
    if (VIDEO_EXT_RE.test(asset.path)) return false;
    if (contentType.startsWith("image/")) return true;
    return IMAGE_EXT_RE.test(asset.path);
}

export function isVideoAsset(asset: AssetMeta): boolean {
    const contentType = normalizedContentType(asset);
    if (contentType.startsWith("audio/")) return false;
    if (contentType.startsWith("video/")) return true;
    return VIDEO_EXT_RE.test(asset.path);
}

export function isMediaAsset(asset: AssetMeta): boolean {
    return isImageAsset(asset) || isVideoAsset(asset);
}

export function isAudioAsset(asset: AssetMeta): boolean {
    const contentType = normalizedContentType(asset);
    if (contentType.startsWith("audio/")) return true;
    if (contentType.startsWith("video/")) return false;
    if (VIDEO_EXT_RE.test(asset.path)) return false;
    return AUDIO_EXT_RE.test(asset.path);
}

export function measureVideoFile(
    file: File,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => {
            const dims = {
                width: video.videoWidth || 1280,
                height: video.videoHeight || 720,
            };
            URL.revokeObjectURL(url);
            resolve(dims);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read video dimensions"));
        };
        video.src = url;
    });
}

export function measureVideoUrl(
    url: string,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => {
            resolve({
                width: video.videoWidth || 1280,
                height: video.videoHeight || 720,
            });
        };
        video.onerror = () => resolve({ width: 1280, height: 720 });
        video.src = url;
    });
}
