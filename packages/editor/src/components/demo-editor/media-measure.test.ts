import { describe, expect, it } from "vitest";

import type { AssetMeta } from "@/lib/assets";
import {
    isAudioAsset,
    isImageAsset,
    isMediaAsset,
    isVideoAsset,
} from "./media-measure";

function asset(path: string, contentType: string): AssetMeta {
    return {
        path,
        contentType,
        size: 1,
    };
}

describe("demo editor media asset classification", () => {
    it("treats webm paths as video, not audio or image", () => {
        const webm = asset("public/capture.webm", "application/octet-stream");

        expect(isVideoAsset(webm)).toBe(true);
        expect(isAudioAsset(webm)).toBe(false);
        expect(isImageAsset(webm)).toBe(false);
        expect(isMediaAsset(webm)).toBe(true);
    });

    it("keeps explicit audio/webm assets audio", () => {
        const voiceover = asset("public/voiceover.webm", "audio/webm");

        expect(isAudioAsset(voiceover)).toBe(true);
        expect(isVideoAsset(voiceover)).toBe(false);
        expect(isImageAsset(voiceover)).toBe(false);
    });

    it("does not allow a video extension into image assets when MIME metadata is stale", () => {
        const stale = asset("public/capture.webm", "image/png");

        expect(isVideoAsset(stale)).toBe(true);
        expect(isImageAsset(stale)).toBe(false);
    });
});
