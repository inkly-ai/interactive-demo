export function selectDraftFilesForPaths(
    files: Record<string, string>,
    paths: Iterable<string>,
): Record<string, string> {
    const selected: Record<string, string> = {};
    for (const path of paths) {
        if (Object.prototype.hasOwnProperty.call(files, path)) {
            selected[path] = files[path] ?? "";
        }
    }
    return selected;
}
