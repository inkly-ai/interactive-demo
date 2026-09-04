import { uploadDemoAsset } from '@/api';
import { sanitizeAssetName } from './name';
import { MAX_ASSET_BYTES, type AssetMeta } from './types';

/**
 * Upload one binary asset for a demo. The dev server writes the bytes to
 * `demos/<slug>/assets/<file>`, registers it in `assets.json`, and returns
 * the manifest entry with a URL the editor can display immediately. The
 * server may store the file under a de-duplicated name when `<file>` already
 * exists with different bytes; always use the returned entry, never the
 * requested path. Files over `MAX_ASSET_BYTES` are refused client-side.
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
    if (args.blob.size > MAX_ASSET_BYTES) {
        const mb = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
        throw new Error(
            `This file is ${mb(args.blob.size)}; the limit is ${mb(MAX_ASSET_BYTES)}. ` +
                'Compress or trim it and try again.',
        );
    }
    const name = sanitizeAssetName(args.path.split('/').pop() ?? args.path);
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
