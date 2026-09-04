import { describe, expect, it } from "vitest";
import { ASSET_NAME_PATTERN, MAX_ASSET_NAME_LENGTH, sanitizeAssetName } from "./name";

// The dev server's rule (packages/cli/src/dev/editor-api.ts). Kept as a
// literal here so a change on either side fails this test.
const SERVER_RULE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

describe("sanitizeAssetName", () => {
    it("matches the server's rule", () => {
        expect(ASSET_NAME_PATTERN.source).toBe(SERVER_RULE.source);
    });

    it("produces names the server accepts", () => {
        const inputs = [
            "hero.png",
            "_foo.png",
            ".hidden.png",
            "My Screenshot (1).PNG",
            "../../etc/passwd",
            "C:\\Users\\me\\shot.png",
            "über-café.jpg",
            "",
            "...",
            "a".repeat(400) + ".webm",
        ];
        for (const input of inputs) {
            const name = sanitizeAssetName(input);
            expect(name, input).toMatch(SERVER_RULE);
            expect(name.length).toBeLessThanOrEqual(MAX_ASSET_NAME_LENGTH);
        }
    });

    it("keeps safe names and extensions intact", () => {
        expect(sanitizeAssetName("hero.png")).toBe("hero.png");
        expect(sanitizeAssetName("_foo.png")).toBe("foo.png");
        expect(sanitizeAssetName(".hidden.png")).toBe("hidden.png");
        expect(sanitizeAssetName("My Screenshot (1).PNG")).toBe("My_Screenshot_1_.PNG");
        expect(sanitizeAssetName("")).toBe("asset");
        expect(sanitizeAssetName("a".repeat(400) + ".webm").endsWith(".webm")).toBe(true);
    });
});
