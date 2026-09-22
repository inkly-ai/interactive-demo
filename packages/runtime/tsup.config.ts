import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Library build: consumers bring their own React, and the output has to
    // survive being imported in Node. `platform: "browser"` would resolve the
    // `browser` export condition of transitive deps — which made
    // decode-named-character-reference (react-markdown -> micromark) inline its
    // DOM build, so `import "@inkly-org/interactive-demo"` threw
    // `document is not defined` at module scope under SSR. "neutral" keeps the
    // bundle isomorphic; the browser-only builds below still target browsers.
    entry: {
      index: "src/index.ts",
      "schema/index": "src/schema/index.ts",
      "themes/index": "src/themes/index.ts",
    },
    format: ["esm", "cjs"],
    platform: "neutral",
    // "neutral" clears the default resolution fields; restore the ones a
    // browser/bundler consumer expects, without adding `browser`.
    esbuildOptions(options) {
      options.mainFields = ["module", "main"];
      options.conditions = ["import", "module", "default"];
    },
    dts: true,
    sourcemap: false,
    clean: true,
    external: ["react", "react-dom", "zod"],
    noExternal: ["react-markdown", "remark-gfm"],
    outExtension({ format }) {
      return { js: format === "cjs" ? ".cjs" : ".js" };
    },
  },
  {
    // Pop-up embed loader for host pages: no React, no dependencies.
    entry: { embed: "src/embed/entry.ts" },
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    outExtension() {
      return { js: '.js' };
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
    outExtension() {
      return { js: '.js' };
    },
  },
]);
