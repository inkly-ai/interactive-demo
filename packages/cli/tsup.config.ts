import { defineConfig } from 'tsup';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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

// The prebuilt local editor (packages/editor) ships inside this package as
// dist/editor/ so `interactive-demo dev` can serve it. Skipped when the
// editor has not been built.
function copyEditorDist() {
  const src = join('..', 'editor', 'dist');
  if (!existsSync(join(src, 'index.html'))) return;
  cpSync(src, join('dist', 'editor'), { recursive: true });
}

export default defineConfig({
  // `cli` is the public binary; `capture-listener` is the internal detached
  // auto-capture worker that `capture start` spawns directly.
  entry: { cli: 'src/cli.ts', 'capture-listener': 'src/commands/capture-listener.ts' },
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
  external: ['vite', 'chokidar', 'sharp', 'ws', '@inkly-org/interactive-demo'],
  noExternal: ['mri', 'zod', 'fflate'],
  onSuccess: async () => {
    copyTemplateDir();
    copyEditorDist();
  },
});
