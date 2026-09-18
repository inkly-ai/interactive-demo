/**
 * Assemble the recorded screens of a session into a demo folder:
 * `demo.config.json` and the `assets/` bytes it references.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildImageStep,
  generateDemoId,
  parseDemo,
  type Demo,
} from '@inkly-org/interactive-demo/schema';
import { ASSETS_DIR } from '../assets.js';
import { atomicWriteFile } from '../fs-atomic.js';

import type { CapturedScreen } from './session.js';

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'captured-demo';
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** `<slug>`, `<slug>-2`, `<slug>-3`, … — the first that has no folder under `demosRoot`. */
export async function uniqueDemoSlug(demosRoot: string, name: string): Promise<string> {
  const base = slugifyName(name);
  if (!(await exists(join(demosRoot, base)))) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await exists(join(demosRoot, candidate)))) return candidate;
  }
  throw new Error(`Could not find a free demo slug for "${name}" under ${demosRoot}.`);
}

export interface AssembledDemo {
  demo: Demo;
  /** File name under `assets/` → bytes. */
  files: Record<string, Uint8Array>;
  stepCount: number;
  /** Human-readable label per step (the clicked element's accessible name). */
  labels: string[];
}

/**
 * Pure-ish assembly: reads the recorded screen files and builds the steps,
 * each referencing its media by path under `assets/`. Writes nothing.
 */
export async function assembleCapturedDemo(opts: {
  name: string;
  screens: CapturedScreen[];
  autoApplyZoom?: boolean;
  compressImages?: boolean;
}): Promise<AssembledDemo> {
  const { name, screens, autoApplyZoom = true, compressImages = false } = opts;
  if (screens.length === 0) throw new Error('No screens captured.');

  const files: Record<string, Uint8Array> = {};
  const steps: Demo['steps'] = [];
  const labels: string[] = [];

  /** Register the bytes under `assets/` and return the path a step references. */
  function pushAsset(bytes: Uint8Array, filename: string): string {
    files[filename] = bytes;
    return `${ASSETS_DIR}/${filename}`;
  }

  async function encodeImage(
    bytes: Uint8Array,
  ): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
    if (compressImages) {
      try {
        const { default: sharp } = await import('sharp');
        const webp = await sharp(Buffer.from(bytes)).webp({ quality: 80 }).toBuffer();
        if (webp.length < bytes.byteLength) {
          return { bytes: new Uint8Array(webp), contentType: 'image/webp', ext: 'webp' };
        }
      } catch {
        // Keep the original PNG on any encode failure (or when sharp is absent).
      }
    }
    return { bytes, contentType: 'image/png', ext: 'png' };
  }

  for (const [i, screen] of screens.entries()) {
    const stepId = `s${i + 1}`;
    const stepNo = String(i + 1).padStart(3, '0');
    if (screen.kind === 'video' && screen.videoPath) {
      const videoBytes = new Uint8Array(await readFile(screen.videoPath));
      const src = pushAsset(videoBytes, `screen-${stepNo}.webm`);
      let posterSrc: string | undefined;
      if (screen.posterPngPath) {
        const poster = await encodeImage(new Uint8Array(await readFile(screen.posterPngPath)));
        posterSrc = pushAsset(poster.bytes, `screen-${stepNo}-poster.${poster.ext}`);
      }
      steps.push(
        buildImageStep({
          stepId,
          kind: 'video',
          src,
          posterSrc,
          naturalWidth: screen.naturalSize.width,
          naturalHeight: screen.naturalSize.height,
          sourceUrl: screen.sourceUrl || undefined,
          title: screen.title || undefined,
          click: screen.click,
          autoApplyZoom,
          isLast: i === screens.length - 1,
        }),
      );
    } else {
      if (!screen.pngPath) continue;
      const image = await encodeImage(new Uint8Array(await readFile(screen.pngPath)));
      const src = pushAsset(image.bytes, `screen-${stepNo}.${image.ext}`);
      steps.push(
        buildImageStep({
          stepId,
          kind: 'image',
          src,
          naturalWidth: screen.naturalSize.width,
          naturalHeight: screen.naturalSize.height,
          sourceUrl: screen.sourceUrl || undefined,
          title: screen.title || undefined,
          click: screen.click,
          autoApplyZoom,
          isLast: i === screens.length - 1,
        }),
      );
    }
    labels.push(screen.click?.label || screen.title || `Step ${i + 1}`);
  }
  if (steps.length === 0) throw new Error('No usable screens captured.');

  const demo = parseDemo({
    id: generateDemoId(),
    version: 1,
    title: name,
    steps,
  });
  return { demo, files, stepCount: steps.length, labels };
}

/** Write an assembled demo as a self-contained demo folder at `demoDir`. */
export async function writeDemoFolder(demoDir: string, built: AssembledDemo): Promise<void> {
  await mkdir(join(demoDir, ASSETS_DIR), { recursive: true });
  for (const [filename, bytes] of Object.entries(built.files)) {
    await writeFile(join(demoDir, ASSETS_DIR, filename), bytes);
  }
  await atomicWriteFile(join(demoDir, 'demo.config.json'), `${JSON.stringify(built.demo, null, 2)}\n`);
}
