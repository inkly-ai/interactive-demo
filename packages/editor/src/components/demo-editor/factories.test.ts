import { describe, expect, it } from "vitest";

import type { Step } from "@inkly-org/interactive-demo";

import {
    borderRadiusKey,
    firstContentWidgetImage,
    makeAnnotation,
    makeMessage,
    makeOutroCtaWidget,
    makeWidget,
} from "./factories";

describe("demo editor border radius defaults", () => {
    it("treats a missing message radius as the medium fallback", () => {
        expect(borderRadiusKey(undefined)).toBe("medium");
    });

    it("does not write an explicit radius for newly created messages", () => {
        expect(makeMessage("callout").borderRadius).toBeUndefined();
        expect(makeMessage("pointer").borderRadius).toBeUndefined();
        expect(makeMessage("area").borderRadius).toBeUndefined();
        expect(makeMessage("cursor").borderRadius).toBeUndefined();
    });

    it("defaults new message annotations to cursor", () => {
        expect(makeAnnotation("message")).toMatchObject({
            type: "message",
            variant: "cursor",
        });
    });

    it("maps legacy explicit 8px values to the medium control", () => {
        expect(borderRadiusKey("8px")).toBe("medium");
    });
});

describe("cover widget media defaults", () => {
    const imageStep: Step = {
        id: "step-1",
        kind: "content",
        background: {
            type: "image",
            src: "assets/first-content.png",
            naturalWidth: 1440,
            naturalHeight: 900,
            alt: "First content",
        },
        annotations: [],
        advance: { trigger: "auto" },
    };

    it("uses the first content image as the default cover widget image", () => {
        expect(firstContentWidgetImage([imageStep])).toEqual({
            src: "assets/first-content.png",
            position: "right",
            layout: "hero",
            naturalWidth: 1440,
            naturalHeight: 900,
            alt: "First content",
        });
    });

    it("adds the default image to new headline and form widgets", () => {
        const image = firstContentWidgetImage([imageStep]);

        expect(makeWidget("headline", image)).toMatchObject({
            image,
            cta: { animation: "shimmer" },
        });
        expect(makeWidget("form", image)).toMatchObject({
            image,
            submit: { animation: "shimmer" },
        });
        expect(makeWidget("embed", image)).not.toHaveProperty("image");
    });

    it("builds the outro CTA preset without media", () => {
        const widget = makeOutroCtaWidget();

        expect(widget).toMatchObject({
            type: "headline",
            textAlign: "middle",
            cta: {
                action: { type: "restart" },
                animation: "shimmer",
            },
        });
        expect(widget).not.toHaveProperty("image");
    });
});
