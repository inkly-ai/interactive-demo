import type { CoverStep } from "@inkly-org/interactive-demo";
import { describe, expect, it } from "vitest";

import {
    COVER_BACKGROUND_MODES,
    coverStepWithBackground,
} from "./inspectors";

const baseCover: CoverStep = {
    kind: "cover",
    id: "cover",
    advance: { trigger: "click" },
    background: { type: "color", color: "#a18cd1" },
    backgroundImage: {
        src: "https://example.invalid/legacy-cover.jpg",
        alt: "Legacy cover",
    },
    widgets: [
        {
            type: "headline",
            id: "headline",
            title: "Your demo in 60 seconds.",
        },
    ],
};

describe("cover background editor helpers", () => {
    it("writes a gradient color background and clears legacy backgroundImage", () => {
        expect(
            coverStepWithBackground(baseCover, {
                type: "color",
                from: "#5b5879",
                to: "#5f7158",
            }),
        ).toEqual(
            expect.objectContaining({
                background: {
                    type: "color",
                    from: "#5b5879",
                    to: "#5f7158",
                },
                backgroundImage: undefined,
            }),
        );
    });

    it("exposes Default but not None as an inner cover background mode", () => {
        expect(COVER_BACKGROUND_MODES).toEqual([
            "default",
            "color",
            "image",
            "glassmorphism",
        ]);
        expect(COVER_BACKGROUND_MODES).not.toContain("none");
    });
});
