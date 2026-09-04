// Cheap LCS-based line diff for the unsaved-changes summary. Returns the
// added/removed line counts between two text blobs. Bails to a length-based
// approximation on very large files so the DP table never blows up.
export function lineDiff(
    oldText: string,
    newText: string,
): { added: number; removed: number } {
    const a = oldText === "" ? [] : oldText.split("\n");
    const b = newText === "" ? [] : newText.split("\n");
    const m = a.length;
    const n = b.length;
    if (m === 0) return { added: n, removed: 0 };
    if (n === 0) return { added: 0, removed: m };
    if (m * n > 1_000_000) {
        const common = Math.min(m, n);
        return { added: n - common, removed: m - common };
    }
    const W = n + 1;
    const dp = new Uint32Array((m + 1) * W);
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i * W + j] = dp[(i - 1) * W + (j - 1)] + 1;
            } else {
                const up = dp[(i - 1) * W + j];
                const left = dp[i * W + (j - 1)];
                dp[i * W + j] = up >= left ? up : left;
            }
        }
    }
    const lcs = dp[m * W + n];
    return { added: n - lcs, removed: m - lcs };
}
