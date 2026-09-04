import { z } from 'zod';

/**
 * `asset:<id>` URI scheme is the canonical way `demo.config` references
 * a managed asset. The player resolves the URI by id against a
 * per-demo manifest supplied at render time (see `useAssetUrl`).
 *
 * The manifest is purely a **registry of managed files**. Files dropped
 * into a project's `public/` folder are NOT tracked here — they're served
 * directly at relative URLs, no manifest entry. `demo.config` may contain
 * project-relative paths for those files, but managed assets use
 * `asset:<id>` and resolve by `id` only.
 *
 * Writers (the capture flow, editor uploads) append to the per-demo
 * `assets.json` file alongside `demo.config.json`. The player never
 * writes — it only reads.
 */

export const AssetKindSchema = z.enum([
  'screenshot',
  'image',
  'video',
  'audio',
  'font',
  'other',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetEntrySchema = z.object({
  /** Stable id referenced from `demo.config` as `asset:<id>`. */
  id: z.string().min(1),
  /** Optional source/delivery metadata; not used to resolve `asset:<id>`. */
  path: z.string().min(1).optional(),
  /** Optional legacy metadata; not accepted as demo config identity. */
  uri: z.string().min(1).optional(),
  /** Content hash — canonical identity of the bytes. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: AssetKindSchema,
  /** MIME type recorded at upload time; lets resolvers derive a file ext. */
  contentType: z.string().min(1).optional(),
  /** Absolute public URL, when the asset is served from elsewhere. */
  publicUrl: z.string().min(1).optional(),
  /**
   * Folder-relative file within the demo's `public/` dir (e.g. `<sha>.png`),
   * set for LOCAL/offline assets. The dev + offline resolvers derive a
   * slug-relative delivery URL from it at serve time — it never bakes the
   * demo slug, so renaming/moving a demo can't break it.
   */
  file: z.string().min(1).optional(),
  /** Byte length, omitted when unknown at write time. */
  size: z.number().int().nonnegative().optional(),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  /** Capture-time viewport, set for screenshots and screen-recordings. */
  viewport: z
    .object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
    })
    .optional(),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

/**
 * Per-demo `assets.json`.
 *
 * The optional `screens[]` array carries capture-flow provenance
 * (sourceUrl, click target, capturedAt). It's written by the capture
 * pipeline only; editor-upload and other future writers leave it
 * absent. The player ignores it — it's audit/editor-UX data, not
 * render data.
 */
export const AssetsManifestSchema = z.object({
  version: z.literal(1),
  assets: z.array(AssetEntrySchema),
  /** Capture-flow audit log — optional, written only by the capture pipeline. */
  screens: z.array(z.unknown()).optional(),
});
export type AssetsManifest = z.infer<typeof AssetsManifestSchema>;
