import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': here('./src'),
      '@inkly-org/interactive-demo/schema': here('../runtime/src/schema/index.ts'),
      '@inkly-org/interactive-demo/themes': here('../runtime/src/themes/index.ts'),
      '@inkly-org/interactive-demo': here('../runtime/src/index.ts'),
    },
  },
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
