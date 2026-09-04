import { uploadDemoAsset } from '@/api';
import type { AssetMeta } from './types';

/**
 * Upload one binary asset for a demo. The dev server writes the bytes to
 * `demos/<slug>/assets/<file>`, registers it in `assets.json`, and returns
 * the manifest entry with a URL the editor can display immediately.
 */
export async function putDemoAssetBlob(args: {
    slug: string;
    blob: Blob;
    path: string;
    contentType: string;
    kind?: string;
}): Promise<{
    assetId: string;
    path: string;
    publicUrl?: string;
    asset: AssetMeta;
}> {
    const name = args.path.split('/').pop() ?? args.path;
    const asset = await uploadDemoAsset({
        slug: args.slug,
        name,
        blob: args.blob,
        contentType: args.contentType,
        kind: args.kind,
    });
    if (!asset.id) {
        throw new Error('The server did not return an asset id.');
    }
    return {
        assetId: asset.id,
        path: asset.path,
        publicUrl: asset.publicUrl,
        asset,
    };
}
