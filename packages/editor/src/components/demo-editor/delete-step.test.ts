import type { DemoConfig, Step } from "@inkly-org/interactive-demo";
import { DemoSchema } from "@inkly-org/interactive-demo/schema";
import { describe, expect, it } from "vitest";

import { deleteStepFromConfig } from "./delete-step";

function demoConfig(input: unknown): DemoConfig {
    return DemoSchema.parse(input) as DemoConfig;
}

function imageStep(id: string): Step {
    return {
        id,
        kind: "content",
        background: {
            type: "image",
            src: `/assets/${id}.png`,
            naturalWidth: 1600,
            naturalHeight: 900,
        },
        advance: { trigger: "auto" },
        annotations: [],
    };
}

describe("deleteStepFromConfig", () => {
    it("removes deleted step references and keeps the config valid", () => {
        const config = demoConfig({
            id: "abc123XYZ789",
            version: 1,
            title: "Delete step test",
            chapters: [
                { id: "mixed", title: "Mixed", stepIds: ["s1", "s2"] },
                { id: "doomed", title: "Doomed", stepIds: ["s2"] },
            ],
            steps: [
                {
                    id: "cover-headline",
                    kind: "cover",
                    widgets: [
                        {
                            id: "headline",
                            type: "headline",
                            title: "Start",
                            cta: {
                                label: "Go to deleted step",
                                action: { type: "step", stepId: "s2" },
                            },
                            secondaryCta: {
                                label: "Go to removed chapter",
                                action: {
                                    type: "chapter",
                                    chapterId: "doomed",
                                },
                            },
                        },
                    ],
                },
                imageStep("s1"),
                imageStep("s2"),
                imageStep("s3"),
                {
                    id: "cover-form",
                    kind: "cover",
                    widgets: [
                        {
                            id: "form",
                            type: "form",
                            title: "Contact",
                            fields: [
                                {
                                    id: "email",
                                    label: "Email",
                                    type: "text",
                                },
                            ],
                            submit: {
                                label: "Submit",
                                action: { type: "step", stepId: "s2" },
                            },
                        },
                    ],
                },
            ],
        });

        const result = deleteStepFromConfig(config, "s2");

        expect(result?.fallbackStepId).toBe("s3");
        expect(result?.config.steps.map((step) => step.id)).toEqual([
            "cover-headline",
            "s1",
            "s3",
            "cover-form",
        ]);
        expect(result?.config.chapters).toEqual([
            { id: "mixed", title: "Mixed", stepIds: ["s1"] },
        ]);

        const headline =
            result?.config.steps[0]?.kind === "cover"
                ? result.config.steps[0].widgets[0]
                : null;
        const form =
            result?.config.steps[3]?.kind === "cover"
                ? result.config.steps[3].widgets[0]
                : null;

        expect(headline?.type === "headline" ? headline.cta?.action : null).toEqual({
            type: "step",
            stepId: "s3",
        });
        expect(
            headline?.type === "headline" ? headline.secondaryCta?.action : null,
        ).toEqual({
            type: "step",
            stepId: "s3",
        });
        expect(form?.type === "form" ? form.submit.action : null).toEqual({
            type: "step",
            stepId: "s3",
        });
        expect(() => DemoSchema.parse(result?.config)).not.toThrow();
    });

    it("falls back to the previous step when deleting the final step", () => {
        const config = demoConfig({
            id: "abc123XYZ789",
            version: 1,
            chapters: [],
            steps: [imageStep("s1"), imageStep("s2")],
        });

        const result = deleteStepFromConfig(config, "s2");

        expect(result?.fallbackStepId).toBe("s1");
        expect(result?.config.steps.map((step) => step.id)).toEqual(["s1"]);
        expect(() => DemoSchema.parse(result?.config)).not.toThrow();
    });

    it("does not delete the only remaining step", () => {
        const config = demoConfig({
            id: "abc123XYZ789",
            version: 1,
            chapters: [],
            steps: [imageStep("s1")],
        });

        expect(deleteStepFromConfig(config, "s1")).toBeNull();
    });
});
