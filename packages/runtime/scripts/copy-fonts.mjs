// Copies the self-hosted files the optional `fonts.css` refers to: the font
// files from the fontsource packages (OFL 1.1) into dist/fonts/, the cover
// backdrop into dist/backgrounds/, and the stylesheet itself to dist/fonts.css,
// so its relative `url()` references resolve from the package.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'fonts');
mkdirSync(outDir, { recursive: true });

export const FONT_FILES = [
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
];

for (const specifier of FONT_FILES) {
  const src = require.resolve(specifier);
  copyFileSync(src, join(outDir, specifier.slice(specifier.lastIndexOf('/') + 1)));
}
copyFileSync(join(root, 'src', 'theme', 'fonts.css'), join(root, 'dist', 'fonts.css'));

// The default theme's cover backdrop, referenced from fonts.css as
// `./backgrounds/…` the same way the fonts are.
export const BACKGROUND_FILES = ['watercolor-background.jpg'];
const bgOut = join(root, 'dist', 'backgrounds');
mkdirSync(bgOut, { recursive: true });
for (const file of BACKGROUND_FILES) {
  copyFileSync(join(root, 'src', 'theme', 'backgrounds', file), join(bgOut, file));
}
