import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// The editor is served by `interactive-demo dev` under this prefix; the
// built assets must reference each other relative to it.
export const EDITOR_BASE = '/__demo/editor/';

export default defineConfig({
  base: EDITOR_BASE,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': here('./src'),
      // Build against the runtime's source so the editor and the player can
      // never disagree about the schema; the published CLI ships the result.
      '@inkly-org/interactive-demo/schema': here('../runtime/src/schema/index.ts'),
      '@inkly-org/interactive-demo/themes': here('../runtime/src/themes/index.ts'),
      '@inkly-org/interactive-demo/styles.css': here('../runtime/src/theme/styles.css'),
      '@inkly-org/interactive-demo': here('../runtime/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // One local tool bundle; splitting buys nothing here.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5175,
    // Local development: run `interactive-demo dev` in a project on :3000
    // and proxy the JSON API + demo assets to it.
    proxy: {
      '/__demo/editor/demos': 'http://127.0.0.1:3000',
      '/__demo/demos': 'http://127.0.0.1:3000',
      '/__demo/player.js': 'http://127.0.0.1:3000',
      '/__demo/player.css': 'http://127.0.0.1:3000',
    },
  },
});
