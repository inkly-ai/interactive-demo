/**
 * Assemble the recorded screens of a session into a demo folder:
 * `demo.config.json`, `assets.json` and the `assets/` bytes.
 */
import type { CaptureClick } from './build.js';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AssetsManifestSchema,
  generateDemoId,
  parseDemo,
  type AssetEntry,
  type Demo,
} from '@inkly-org/interactive-demo/schema';
import { ASSETS_DIR } from '../assets.js';
import { atomicWriteFile } from '../fs-atomic.js';
import { buildImageStep, screenIdFromIndex } from './build.js';
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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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
  manifest: ReturnType<typeof AssetsManifestSchema.parse>;
  /** File name under `assets/` → bytes. */
  files: Record<string, Uint8Array>;
  stepCount: number;
  /** Human-readable label per step (the clicked element's accessible name). */
  labels: string[];
}

/**
 * Pure-ish assembly: reads the recorded screen files, builds steps and the
 * asset manifest. Writes nothing.
 */
function omitOuterHtml(click: CaptureClick): Omit<CaptureClick, 'outerHTML'> {
  const { outerHTML: _outerHtml, ...rest } = click;
  return rest;
}

export async function assembleCapturedDemo(opts: {
  name: string;
  screens: CapturedScreen[];
  autoApplyZoom?: boolean;
  compressImages?: boolean;
}): Promise<AssembledDemo> {
  const { name, screens, autoApplyZoom = true, compressImages = false } = opts;
  if (screens.length === 0) throw new Error('No screens captured.');

  const assets: AssetEntry[] = [];
  const auditScreens: unknown[] = [];
  const files: Record<string, Uint8Array> = {};
  const steps: Demo['steps'] = [];
  const labels: string[] = [];
  let assetCounter = 0;

  async function pushAsset(
    bytes: Uint8Array,
    contentType: string,
    kind: 'image' | 'video',
    filename: string,
    viewport?: { width: number; height: number },
  ): Promise<string> {
    files[filename] = bytes;
    assetCounter += 1;
    const id = `cap-${String(assetCounter).padStart(3, '0')}`;
    assets.push({
      id,
      sha256: sha256Hex(bytes),
      kind,
      contentType,
      size: bytes.byteLength,
      viewport: viewport ? { w: viewport.width, h: viewport.height } : undefined,
      // The local file under assets/. The page resolver derives `./assets/<file>`
      // from it, so moving or renaming the demo folder can never break a step.
      file: filename,
    });
    return id;
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
    let assetId: string | null = null;
    if (screen.kind === 'video' && screen.videoPath) {
      const videoBytes = new Uint8Array(await readFile(screen.videoPath));
      assetId = await pushAsset(videoBytes, 'video/webm', 'video', `screen-${stepNo}.webm`, screen.viewport);
      let posterAssetId: string | undefined;
      if (screen.posterPngPath) {
        const poster = await encodeImage(new Uint8Array(await readFile(screen.posterPngPath)));
        posterAssetId = await pushAsset(
          poster.bytes,
          poster.contentType,
          'image',
          `screen-${stepNo}-poster.${poster.ext}`,
          screen.viewport,
        );
      }
      steps.push(
        buildImageStep({
          stepId,
          kind: 'video',
          assetId,
          posterAssetId,
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
      assetId = await pushAsset(
        image.bytes,
        image.contentType,
        'image',
        `screen-${stepNo}.${image.ext}`,
        screen.viewport,
      );
      steps.push(
        buildImageStep({
          stepId,
          kind: 'image',
          assetId,
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
    auditScreens.push({
      index: i,
      id: screenIdFromIndex(i),
      assetId,
      sourceUrl: screen.sourceUrl,
      capturedAt: screen.capturedAt,
      naturalWidth: screen.naturalSize.width,
      naturalHeight: screen.naturalSize.height,
      // The element's markup is only an authoring aid; keep it out of the
      // exported manifest.
      precedingClick: screen.click ? omitOuterHtml(screen.click) : screen.click,
    });
  }
  if (steps.length === 0) throw new Error('No usable screens captured.');

  const demo = parseDemo({
    id: generateDemoId(),
    version: 1,
    title: name,
    steps,
  });
  const manifest = AssetsManifestSchema.parse({
    version: 1,
    assets,
    screens: auditScreens,
  });

  return { demo, manifest, files, stepCount: steps.length, labels };
}

/** Write an assembled demo as a self-contained demo folder at `demoDir`. */
export async function writeDemoFolder(demoDir: string, built: AssembledDemo): Promise<void> {
  await mkdir(join(demoDir, ASSETS_DIR), { recursive: true });
  for (const [filename, bytes] of Object.entries(built.files)) {
    await writeFile(join(demoDir, ASSETS_DIR, filename), bytes);
  }
  await atomicWriteFile(join(demoDir, 'demo.config.json'), `${JSON.stringify(built.demo, null, 2)}\n`);
  await atomicWriteFile(join(demoDir, 'assets.json'), `${JSON.stringify(built.manifest, null, 2)}\n`);
}
