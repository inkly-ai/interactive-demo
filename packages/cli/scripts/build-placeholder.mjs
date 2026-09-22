/**
 * Rasterise the starter placeholder into `src/template/placeholder.png`.
 *
 * The design lives in `placeholderSvg()` in src/starter.ts; the PNG is what
 * ships and what `init` copies into a new demo. SVG is deliberately not the
 * scaffolded asset — the hosted service refuses it, so a scaffold that shipped
 * one could never be published.
 *
 * Run after changing the SVG:
 *   npm run build:placeholder -w @inkly-org/interactive-demo-cli
 *
 * Not wired into `build`: this needs sharp's native binary, the output is
 * committed, and the design changes about once a year.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const out = join(pkgRoot, 'src', 'template', 'placeholder.png');

// Read the SVG out of the source rather than importing it: this script runs
// against TypeScript that has not been built, and the template literal has no
// dependencies beyond the two size constants.
const src = readFileSync(join(pkgRoot, 'src', 'starter.ts'), 'utf8');
const match = src.match(/return `(<svg[\s\S]*?<\/svg>)`;/);
if (!match) {
  throw new Error('Could not find the placeholder SVG literal in src/starter.ts');
}

const width = Number(src.match(/const PLACEHOLDER_WIDTH = (\d+);/)?.[1]);
const height = Number(src.match(/const PLACEHOLDER_HEIGHT = (\d+);/)?.[1]);
if (!width || !height) {
  throw new Error('Could not read PLACEHOLDER_WIDTH / PLACEHOLDER_HEIGHT from src/starter.ts');
}

const svg = match[1]
  .replaceAll('${w - 120}', String(width - 120))
  .replaceAll('${h - 120}', String(height - 120))
  .replaceAll('${w}', String(width))
  .replaceAll('${h}', String(height));

if (svg.includes('${')) {
  throw new Error('Unsubstituted placeholder in the SVG literal — teach this script the new one');
}

const { default: sharp } = await import('sharp');
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(out, png);

const meta = await sharp(png).metadata();
if (meta.width !== width || meta.height !== height) {
  throw new Error(`Rasterised ${meta.width}x${meta.height}, expected ${width}x${height}`);
}
console.log(`wrote ${out} (${meta.width}x${meta.height}, ${png.length} bytes)`);
