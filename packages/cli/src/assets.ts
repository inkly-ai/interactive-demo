import { join } from 'node:path';
import type { AssetEntry } from '@inkly-org/interactive-demo/schema';
import { pathExists } from './project.js';

/**
 * Single source of truth for how the CLI locates and serves an asset's bytes.
 * A demo's assets live at `demos/<slug>/assets/<file>` and are registered in
 * `demos/<slug>/assets.json` under `file`. The dev server, `validate` and
 * `build` all resolve through these helpers, so they can never disagree about
 * where an asset lives, whether it exists, or what URL it is served at.
 */

/** Folder (inside a demo folder) that holds the demo's asset bytes. */
export const ASSETS_DIR = 'assets';

/** Absolute path to an asset's local bytes, or `null` when it has no `file`. */
export function localAssetPath(
  demoDir: string,
  asset: Pick<AssetEntry, 'file'>,
): string | null {
  return asset.file ? join(demoDir, ASSETS_DIR, asset.file) : null;
}

/** Whether the asset's local bytes exist on disk under the demo's assets folder. */
export async function hasLocalAssetBytes(
  demoDir: string,
  asset: Pick<AssetEntry, 'file'>,
): Promise<boolean> {
  const path = localAssetPath(demoDir, asset);
  return path ? pathExists(path) : false;
}

/** Whether the asset points at an absolute URL somewhere else. */
export function hasRemoteAsset(
  asset: Pick<AssetEntry, 'publicUrl'> | null | undefined,
): boolean {
  return typeof asset?.publicUrl === 'string' && /^(https?:)?\/\//i.test(asset.publicUrl);
}

/**
 * The URL the player page resolves an asset at. An absolute `publicUrl` is
 * used as-is; otherwise the URL is derived from the local `file`, relative to
 * the page (`./assets/<file>`) so the same page works from the dev server and
 * from a static folder deployed under any path.
 */
export function assetDeliveryUrl(asset: AssetEntry): string | null {
  if (hasRemoteAsset(asset)) return asset.publicUrl ?? null;
  if (asset.file) return `./${ASSETS_DIR}/${asset.file}`;
  return asset.publicUrl ?? null;
}

/**
 * The manifest entries as embedded into the player page: every entry with a
 * resolvable location carries a `publicUrl` the player can fetch.
 */
export function assetsForPage(assets: readonly AssetEntry[]): AssetEntry[] {
  return assets.map((asset) => {
    const delivery = assetDeliveryUrl(asset);
    return delivery ? { ...asset, publicUrl: delivery } : asset;
  });
}
