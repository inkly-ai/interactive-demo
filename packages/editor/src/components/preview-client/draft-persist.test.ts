import { describe, expect, it } from "vitest";

import { selectDraftFilesForPaths } from "./draft-persist";

describe("selectDraftFilesForPaths", () => {
    it("returns only dirty files in the requested path set", () => {
        expect(
            selectDraftFilesForPaths(
                {
                    "demo.config.json": "{\"visibility\":\"private\"}",
                    "assets.json": "{\"assets\":[]}",
                    "snapshots/one/index.html": "<html />",
                },
                new Set(["demo.config.json", "snapshots/one/index.html"]),
            ),
        ).toEqual({
            "demo.config.json": "{\"visibility\":\"private\"}",
            "snapshots/one/index.html": "<html />",
        });
    });

    it("does not stage unchanged files or missing dirty paths", () => {
        expect(
            selectDraftFilesForPaths(
                {
                    "demo.config.json": "{\"visibility\":\"public\"}",
                    "assets.json": "{\"assets\":[]}",
                },
                ["missing.md", "demo.config.json"],
            ),
        ).toEqual({
            "demo.config.json": "{\"visibility\":\"public\"}",
        });
    });
});
