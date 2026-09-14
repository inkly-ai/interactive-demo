/**
 * One file under a demo's `assets/` folder as the editor sees it. The dev
 * server lists the folder; the editor reads the list and uploads new bytes
 * through the local API. A step references the file by `path`.
 */

export interface AssetMeta {
    /** Demo-relative path, e.g. "assets/logo.png". Forward slashes. */
    path: string;
    /** File name under assets/. */
    file?: string;
    /** URL the editor can load the bytes from (served by the dev server). */
    publicUrl?: string;
    /** MIME type. */
    contentType: string;
    /** Size in bytes. */
    size: number;
    kind?: string;
}

export const MAX_ASSET_BYTES = 100 * 1024 * 1024; // 100 MB
