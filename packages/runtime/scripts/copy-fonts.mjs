// Copies the self-hosted font files the optional `fonts.css` refers to from the
// fontsource packages (OFL 1.1) into dist/fonts/, and the stylesheet itself to
// dist/fonts.css, so the `url(./fonts/…)` references resolve from the package.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'fonts');
mkdirSync(outDir, { recursive: true });

export const FONT_FILES = [
  '@fontsource/newsreader/files/newsreader-latin-600-normal.woff2',
  '@fontsource/fraunces/files/fraunces-latin-600-normal.woff2',
  '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
];

for (const specifier of FONT_FILES) {
  const src = require.resolve(specifier);
  copyFileSync(src, join(outDir, specifier.slice(specifier.lastIndexOf('/') + 1)));
}
copyFileSync(join(root, 'src', 'theme', 'fonts.css'), join(root, 'dist', 'fonts.css'));
