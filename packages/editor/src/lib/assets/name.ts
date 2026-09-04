/**
 * Asset file-name rules. These mirror the dev server's rule in
 * packages/cli/src/dev/editor-api.ts (`ASSET_NAME_PATTERN`): a leading letter
 * or digit, then letters, digits, ".", "_" and "-". The server is the source
 * of truth; this module only makes sure the editor never sends a name the
 * server would reject.
 */
export const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Longest file name the editor will produce (extension included). */
export const MAX_ASSET_NAME_LENGTH = 120;

/** Turn any user-supplied file name into one that satisfies the rule. */
export function sanitizeAssetName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? "";
    let name = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[^A-Za-z0-9]+/, "");
    if (!name) name = "asset";
    if (name.length > MAX_ASSET_NAME_LENGTH) {
        const dot = name.lastIndexOf(".");
        const ext = dot > 0 ? name.slice(dot).slice(0, 16) : "";
        name = name.slice(0, MAX_ASSET_NAME_LENGTH - ext.length) + ext;
    }
    return name;
}
