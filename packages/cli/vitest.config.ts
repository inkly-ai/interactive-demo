import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against the runtime's source so they never depend on a built
// runtime dist. The built CLI resolves the same subpaths from node_modules.
const runtimeSrc = (rel: string) =>
  fileURLToPath(new URL(`../runtime/src/${rel}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@inkly-org/interactive-demo/schema': runtimeSrc('schema/index.ts'),
      '@inkly-org/interactive-demo/themes': runtimeSrc('themes/index.ts'),
    },
  },
  // This is a pure Node CLI with no CSS. An inline (empty) PostCSS config
  // stops Vite from searching upward for a PostCSS config.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
