import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { AssetEntry } from '@inkly-org/interactive-demo/schema';
import { hasRemoteAsset, localAssetPath } from '../assets.js';
import { fileSize, pathExists, type LoadedDemoConfig } from '../project.js';

/**
 * Content-addressed asset upload client. `publish` plans which of a demo's
 * assets still need bytes on the hosting service's storage, uploads each
 * unique content hash once through presigned PUTs, and confirms the uploads so
 * the frozen manifest can carry absolute `publicUrl`s.
 */

export interface SyncAssetPlan {
  demo: string;
  id: string;
  sha256: string;
  /** Folder-relative file name under the demo's assets dir. */
  file: string;
  /** Absolute path to the local bytes to upload. Omit when `bytes` is set. */
  localPath?: string;
  /**
   * In-memory bytes to upload, used for generated content that has no on-disk
   * file in its final form. Takes precedence over `localPath`.
   */
  bytes?: Uint8Array;
  contentType: string;
  size: number;
  alreadyRemote: boolean;
}

export interface SyncUnresolvedAsset {
  demo: string;
  id: string;
  sha256: string;
}

export interface SyncPlan {
  assets: SyncAssetPlan[];
  unresolved: SyncUnresolvedAsset[];
}

export interface SyncInitUpload {
  sha256: string;
  ext: string;
  cdnPath: string;
  publicUrl: string;
  uploadUrl: string | null;
  uploadHeaders?: Record<string, string>;
}

export interface SyncFinalizedUpload {
  sha256: string;
  ext: string;
  cdnPath: string;
  publicUrl: string;
}

/**
 * Decide which of a demo's assets need uploading. An asset that is neither on
 * disk nor already served from an absolute URL is recorded as unresolved
 * instead of aborting — the caller decides whether that blocks publishing.
 */
export async function planDemoAssets(demo: LoadedDemoConfig): Promise<SyncPlan> {
  const assets: SyncAssetPlan[] = [];
  const unresolved: SyncUnresolvedAsset[] = [];
  for (const asset of demo.assets?.assets ?? []) {
    // Local bytes live next to the demo at `demos/<slug>/assets/<file>`, the
    // same file the dev server delivers (resolved via the shared
    // `localAssetPath`).
    const localPath = localAssetPath(demo.dir, asset);
    const hasLocal = localPath ? await pathExists(localPath) : false;
    const alreadyRemote = hasRemoteAsset(asset);
    if (!hasLocal && !alreadyRemote) {
      unresolved.push({ demo: demo.slug, id: asset.id, sha256: asset.sha256 });
      continue;
    }
    if (!hasLocal || alreadyRemote || !asset.file || !localPath) continue;
    const size = await fileSize(localPath);
    assets.push({
      demo: demo.slug,
      id: asset.id,
      sha256: asset.sha256,
      file: asset.file,
      localPath,
      contentType: asset.contentType ?? contentTypeForFile(asset.file, asset.kind),
      size: asset.size ?? size ?? 0,
      alreadyRemote,
    });
  }

  // Upload each unique content hash once — identical bytes referenced by
  // several entries upload a single time; every entry still gets the
  // resulting URL (keyed by sha).
  const uploadPlan = Array.from(new Map(assets.map((a) => [a.sha256, a])).values());
  return { assets: uploadPlan, unresolved };
}

export async function uploadSyncAssets(args: {
  apiBase: string;
  token: string;
  assets: SyncAssetPlan[];
}): Promise<{ uploads: SyncFinalizedUpload[]; uploaded: number }> {
  const init = await requestSyncUploads(args.apiBase, args.token, args.assets);
  const uploadsBySha = new Map(init.uploads.map((upload) => [upload.sha256, upload]));
  let uploaded = 0;
  for (const asset of args.assets) {
    const upload = uploadsBySha.get(asset.sha256);
    if (!upload) throw new Error(`Server did not return upload metadata for ${asset.sha256}.`);
    if (upload.uploadUrl) {
      const bytes = asset.bytes ?? (await readFile(asset.localPath!));
      const res = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.uploadHeaders ?? { 'content-type': asset.contentType },
        // Both a Buffer and a Uint8Array are valid request bodies at runtime;
        // the cast sidesteps @types/node's ArrayBufferLike variance friction.
        body: bytes as unknown as BodyInit,
      });
      if (!res.ok) throw new Error(`Asset upload failed for ${asset.id}: HTTP ${res.status}`);
      uploaded += 1;
    }
  }
  const completed = await completeSyncUploads(args.apiBase, args.token, args.assets, init.uploads);
  return { uploads: completed.uploads, uploaded };
}

async function completeSyncUploads(
  apiBase: string,
  token: string,
  assets: SyncAssetPlan[],
  uploads: SyncInitUpload[],
): Promise<{ uploads: SyncFinalizedUpload[] }> {
  const uploadBySha = new Map(uploads.map((upload) => [upload.sha256, upload]));
  const res = await fetch(`${apiBase}/api/cli/sync-assets/complete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      assets: assets.map((asset) => {
        const upload = uploadBySha.get(asset.sha256);
        if (!upload) {
          throw new Error(`Server did not return upload metadata for ${asset.sha256}.`);
        }
        return {
          sha256: asset.sha256,
          ext: upload.ext,
          contentType: asset.contentType,
          size: asset.size,
          cdnPath: upload.cdnPath,
        };
      }),
    }),
  });
  const json = await res.json().catch(() => null) as { uploads?: SyncFinalizedUpload[]; error?: string } | null;
  if (!res.ok || !json || !Array.isArray(json.uploads)) {
    throw new Error(json?.error ?? `Sync completion failed: HTTP ${res.status}`);
  }
  return { uploads: json.uploads };
}

async function requestSyncUploads(
  apiBase: string,
  token: string,
  assets: SyncAssetPlan[],
): Promise<{ uploads: SyncInitUpload[] }> {
  const res = await fetch(`${apiBase}/api/cli/sync-assets`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      assets: assets.map((asset) => ({
        sha256: asset.sha256,
        ext: extname(asset.file) || extForContentType(asset.contentType),
        contentType: asset.contentType,
        size: asset.size,
      })),
    }),
  });
  const json = await res.json().catch(() => null) as { uploads?: SyncInitUpload[]; error?: string } | null;
  if (!res.ok || !json || !Array.isArray(json.uploads)) {
    throw new Error(json?.error ?? `Sync endpoint failed: HTTP ${res.status}`);
  }
  return { uploads: json.uploads };
}

export function contentTypeForFile(file: string, kind: AssetEntry['kind'] | undefined): string {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (kind === 'font') return 'font/woff2';
  return 'application/octet-stream';
}

export function extForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/svg+xml') return '.svg';
  if (normalized === 'video/webm') return '.webm';
  if (normalized === 'video/mp4') return '.mp4';
  if (normalized === 'audio/mpeg') return '.mp3';
  if (normalized === 'audio/wav') return '.wav';
  if (normalized === 'font/woff2') return '.woff2';
  return '.bin';
}
