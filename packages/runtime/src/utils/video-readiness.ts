// Module-level readiness cache for the warm-pool video preloader. Keyed by
// resolved video `src`. Kept module-global (rather than per-player context)
// to avoid rippling through Stage.tsx's many call sites; instead we BOUND it
// so a long-lived SPA host can't grow it without limit. The cap is large
// enough that all sources for any realistic single demo stay resident (so the
// warm-pool readiness behavior is unchanged), while old entries from
// previously-mounted demos are evicted FIFO to stop unbounded growth and
// cross-demo bleed.
const MAX_READY_SOURCES = 256;
const readyVideoSources = new Set<string>();

export function isVideoSourceReady(src: string | null | undefined): boolean {
  return Boolean(src && readyVideoSources.has(src));
}

export function markVideoSourceReady(src: string | null | undefined): void {
  if (!src) return;
  // Re-mark moves the entry to the most-recent position so actively-used
  // sources aren't evicted by churn from other demos.
  if (readyVideoSources.has(src)) {
    readyVideoSources.delete(src);
  } else if (readyVideoSources.size >= MAX_READY_SOURCES) {
    const oldest = readyVideoSources.values().next().value;
    if (oldest !== undefined) {
      readyVideoSources.delete(oldest);
    }
  }
  readyVideoSources.add(src);
}
