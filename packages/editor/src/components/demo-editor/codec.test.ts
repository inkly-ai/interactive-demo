import { describe, expect, it } from "vitest";

import { changeMessageVariant } from "./factories";
import {
    parseDemoConfig,
    serializeDemoConfig,
    type ParsedConfig,
} from "./codec";

/**
 * A config written the way an author writes one: `$schema` first, a
 * hand-picked key order, and every optional field left to its default.
 */
const AUTHORED = `{
  "$schema": "https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo/dist/schema/demo.config.json",
  "id": "tourExample0",
  "version": 1,
  "title": "A tour",
  "steps": [
    {
      "kind": "content",
      "id": "step-1",
      "background": {
        "type": "image",
        "src": "assets/one.png",
        "naturalWidth": 1440,
        "naturalHeight": 900,
        "alt": "One"
      },
      "annotations": [
        {
          "type": "message",
          "id": "hotspot-1",
          "x": 0.2,
          "y": 0.1,
          "text": "Click Edit."
        }
      ]
    }
  ]
}
`;

/**
 * A hotspot on the `cursor` variant, with `showMessage` left out. The schema
 * DERIVES that field from `variant`, so the parsed config carries a `false`
 * the file never mentions.
 */
const AUTHORED_CURSOR = `{
  "id": "tourExample0",
  "version": 1,
  "steps": [
    {
      "kind": "content",
      "id": "step-1",
      "background": {
        "type": "image",
        "src": "assets/one.png",
        "naturalWidth": 1440,
        "naturalHeight": 900
      },
      "annotations": [
        { "type": "message", "id": "a", "variant": "cursor", "x": 0.2, "y": 0.1, "text": "Click Edit." }
      ]
    }
  ]
}
`;

function parsed(src = AUTHORED): ParsedConfig {
    const result = parseDemoConfig(src);
    if (!("config" in result)) throw new Error("fixture does not parse");
    return result;
}

/** The first annotation of the first step, narrowed to a message. */
function messageAt(config: ParsedConfig["config"]) {
    const step = config.steps[0]!;
    if (step.kind !== "content") throw new Error("expected a content step");
    const annotation = step.annotations[0]!;
    if (annotation.type !== "message") throw new Error("expected a message");
    return annotation;
}

function withAnnotation(
    config: ParsedConfig["config"],
    annotation: ReturnType<typeof messageAt>,
): ParsedConfig["config"] {
    const step = config.steps[0]!;
    if (step.kind !== "content") throw new Error("expected a content step");
    return { ...config, steps: [{ ...step, annotations: [annotation] }] };
}

describe("serializeDemoConfig", () => {
    it("writes an untouched config back byte-for-byte", () => {
        const p = parsed();
        expect(serializeDemoConfig(p.config, p)).toBe(AUTHORED);
    });

    it("keeps $schema first and the authored key order", () => {
        const p = parsed();
        const next = { ...p.config, title: "A retitled tour" };
        const out = JSON.parse(serializeDemoConfig(next, p));
        expect(Object.keys(out)).toEqual([
            "$schema",
            "id",
            "version",
            "title",
            "steps",
        ]);
    });

    it("writes the edit and nothing else", () => {
        const p = parsed();
        const step = p.config.steps[0]!;
        if (step.kind !== "content") throw new Error("expected a content step");
        const annotation = step.annotations[0]!;
        const next = {
            ...p.config,
            steps: [
                {
                    ...step,
                    annotations: [{ ...annotation, text: "Click Share." }],
                },
            ],
        };
        const out = serializeDemoConfig(next, p);
        expect(out).toBe(AUTHORED.replace("Click Edit.", "Click Share."));
    });

    it("does not expand the defaults the author left out", () => {
        const p = parsed();
        const next = { ...p.config, title: "A retitled tour" };
        const out = serializeDemoConfig(next, p);
        // `chrome` and an annotation's `advancesStep` both carry schema
        // defaults; neither is in the authored file, so neither is written.
        expect(out).not.toContain("chrome");
        expect(out).not.toContain("advancesStep");
    });

    it("writes a field the author left to its default once the edit changes it", () => {
        const p = parsed();
        const step = p.config.steps[0]!;
        if (step.kind !== "content") throw new Error("expected a content step");
        const annotation = step.annotations[0]!;
        const next = {
            ...p.config,
            steps: [
                {
                    ...step,
                    annotations: [{ ...annotation, advancesStep: false }],
                },
            ],
        };
        const out = JSON.parse(serializeDemoConfig(next, p));
        expect(out.steps[0].annotations[0].advancesStep).toBe(false);
    });

    it("persists an id minted for a config that had none", () => {
        const withoutId = JSON.parse(AUTHORED) as Record<string, unknown>;
        delete withoutId.id;
        const p = parsed(JSON.stringify(withoutId, null, 2) + "\n");
        const out = JSON.parse(serializeDemoConfig(p.config, p));
        expect(out.id).toBe(p.config.id);
        expect(out.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    });

    it("keeps a field the schema derives from a sibling it just changed", () => {
        // Dropping `showMessage` because it still matches the pre-edit
        // baseline would let the schema re-derive the opposite value on the
        // new variant, turning a hover-revealed card into a pinned one.
        const p = parsed(AUTHORED_CURSOR);
        const annotation = messageAt(p.config);
        expect(annotation.showMessage).toBe(false);
        const out = serializeDemoConfig(
            withAnnotation(p.config, changeMessageVariant(annotation, "pointer")),
            p,
        );
        const reread = messageAt(parsed(out).config);
        expect(reread.variant).toBe("pointer");
        expect(reread.showMessage).toBe(false);
    });

    it("writes a file that reads back as the config it was given", () => {
        // The trimmed file is only correct if it parses back to exactly the
        // config the editor handed over — that is the whole contract, and it
        // covers every derived field, not just the one above.
        const p = parsed(AUTHORED_CURSOR);
        const annotation = messageAt(p.config);
        const next = {
            ...withAnnotation(
                p.config,
                changeMessageVariant(annotation, "area"),
            ),
            title: "A retitled tour",
        };
        expect(parsed(serializeDemoConfig(next, p)).config).toStrictEqual(next);
    });

    it("keeps each annotation's own shape when one is reordered", () => {
        const src = `{
  "id": "tourExample0",
  "version": 1,
  "steps": [
    {
      "kind": "content",
      "id": "step-1",
      "background": {
        "type": "image",
        "src": "assets/one.png",
        "naturalWidth": 1440,
        "naturalHeight": 900,
        "alt": "One"
      },
      "annotations": [
        { "type": "message", "id": "a", "x": 0.2, "y": 0.1, "text": "First" },
        { "type": "message", "id": "b", "x": 0.4, "y": 0.3, "text": "Second", "advancesStep": false }
      ]
    }
  ]
}
`;
        const p = parsed(src);
        const step = p.config.steps[0]!;
        if (step.kind !== "content") throw new Error("expected a content step");
        const [a, b] = step.annotations;
        const next = {
            ...p.config,
            steps: [{ ...step, annotations: [b!, a!] }],
        };
        const out = JSON.parse(serializeDemoConfig(next, p));
        // Matched by id, not by position: "b" keeps the field it authored
        // and "a" still doesn't gain the default it never wrote.
        expect(out.steps[0].annotations[0].id).toBe("b");
        expect(out.steps[0].annotations[0].advancesStep).toBe(false);
        expect(out.steps[0].annotations[1].id).toBe("a");
        expect(out.steps[0].annotations[1]).not.toHaveProperty("advancesStep");
    });
});
