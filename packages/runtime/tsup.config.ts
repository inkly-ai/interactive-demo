import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Library build: consumers bring their own React.
    entry: {
      index: "src/index.ts",
      "schema/index": "src/schema/index.ts",
      "themes/index": "src/themes/index.ts",
    },
    format: ["esm", "cjs"],
    platform: "browser",
    dts: true,
    sourcemap: false,
    clean: true,
    external: ["react", "react-dom"],
    noExternal: ["react-markdown", "remark-gfm", "zod"],
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  {
    // Self-contained player for static output: React is bundled in.
    entry: { player: "src/player-entry.tsx" },
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    noExternal: [/.*/],
  },
]);
