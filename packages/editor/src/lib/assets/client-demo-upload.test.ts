import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadDemoAsset = vi.fn();
vi.mock("@/api", () => ({ uploadDemoAsset: (...args: unknown[]) => uploadDemoAsset(...args) }));

import { putDemoAssetBlob } from "./client-demo-upload";
import { MAX_ASSET_BYTES } from "./types";

describe("putDemoAssetBlob", () => {
    beforeEach(() => uploadDemoAsset.mockReset());

    it("refuses files over the size limit before contacting the server", async () => {
        const blob = { size: MAX_ASSET_BYTES + 1 } as Blob;
        await expect(
            putDemoAssetBlob({ slug: "tour", blob, path: "assets/big.mp4", contentType: "video/mp4" }),
        ).rejects.toThrow(/limit is 100 MB/);
        expect(uploadDemoAsset).not.toHaveBeenCalled();
    });

    it("sanitises the file name and returns the entry the server wrote", async () => {
        uploadDemoAsset.mockResolvedValue({
            id: "hero-2-abc",
            path: "assets/hero-2.png",
            publicUrl: "/tour/assets/hero-2.png",
            contentType: "image/png",
            size: 3,
        });
        const blob = { size: 3 } as Blob;
        const result = await putDemoAssetBlob({
            slug: "tour",
            blob,
            path: "assets/.hero (1).png",
            contentType: "image/png",
        });
        expect(uploadDemoAsset).toHaveBeenCalledWith(
            expect.objectContaining({ slug: "tour", name: "hero_1_.png" }),
        );
        expect(result.assetId).toBe("hero-2-abc");
        expect(result.path).toBe("assets/hero-2.png");
        expect(result.publicUrl).toBe("/tour/assets/hero-2.png");
    });
});
