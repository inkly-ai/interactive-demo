import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The player page template ships next to the built module (dist/template/).
function copyTemplateDir() {
  const src = join('src', 'template');
  const dest = join('dist', 'template');
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const srcPath = join(src, name);
    if (statSync(srcPath).isFile()) {
      copyFileSync(srcPath, join(dest, name));
    }
  }
}

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: false,
  minify: false,
  clean: true,
  splitting: false,
  shims: false,
  banner: { js: '#!/usr/bin/env node' },
  // The runtime resolves from node_modules at run time (it is a dependency);
  // vite and chokidar stay external too.
  external: ['vite', 'chokidar', '@inkly-org/interactive-demo'],
  noExternal: ['mri', 'zod'],
  onSuccess: async () => {
    copyTemplateDir();
  },
});
