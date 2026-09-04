import type { DemoConfig } from "@inkly-org/interactive-demo";
import { describe, expect, it } from "vitest";

import type { AssetMeta } from "@/lib/assets";
import { resolveDemoAssetReferencesForDisplay } from "./asset-display";

const assets: AssetMeta[] = [
    {
        id: "hero-asset-id",
        path: "assets/uploads/hero.png",
        uri: "asset:hero-asset-id",
        publicUrl: "/api/demo-file/demo-slug/assets/uploads/hero.png",
        contentType: "image/png",
        size: 123,
    },
];

describe("resolveDemoAssetReferencesForDisplay", () => {
    it("rewrites uploaded asset ids to display URLs", () => {
        const config = {
            id: "demo",
            title: "Demo",
            chapters: [{ id: "c1", title: "One", stepIds: ["s1", "cover"] }],
            steps: [
                {
                    id: "s1",
                    kind: "content",
                    background: {
                        type: "image",
                        src: "asset:hero-asset-id",
                        naturalWidth: 1600,
                        naturalHeight: 900,
                    },
                    annotations: [],
                },
                {
                    id: "cover",
                    kind: "cover",
                    widgets: [
                        {
                            id: "headline",
                            type: "headline",
                            title: "Hero",
                            image: {
                                src: "/assets/assets/uploads/hero.png",
                                position: "right",
                            },
                        },
                    ],
                },
            ],
        } as DemoConfig;

        const resolved = resolveDemoAssetReferencesForDisplay(config, assets);
        const first = resolved.steps[0];
        const second = resolved.steps[1];
        const headline = second.kind === "cover"
            ? second.widgets.find((widget) => widget.type === "headline")
            : null;

        expect(first.kind === "content" && first.background.type === "image"
            ? first.background.src
            : null).toBe("/api/demo-file/demo-slug/assets/uploads/hero.png");
        expect(headline?.type === "headline" ? headline.image?.src : null).toBe(
            "/assets/assets/uploads/hero.png",
        );
    });

    it("preserves the original config object when there are no assets", () => {
        const config = {
            id: "demo",
            chapters: [],
            steps: [],
        } as unknown as DemoConfig;

        expect(resolveDemoAssetReferencesForDisplay(config, [])).toBe(config);
    });
});
