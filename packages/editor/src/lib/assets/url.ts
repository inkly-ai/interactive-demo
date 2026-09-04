/**
 * Display URL for an asset. Returns `publicUrl` when present.
 *
 * The `demoId` argument is retained for API stability across many callers
 * but is no longer used — the dev server records `publicUrl` directly on
 * `AssetMeta`.
 */

import type { AssetMeta } from "./types";

export function assetDisplayUrl(
    _demoId: string,
    asset: Pick<AssetMeta, "publicUrl">,
): string {
    return asset.publicUrl ?? "";
}
