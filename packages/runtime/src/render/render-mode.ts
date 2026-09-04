import type { Demo } from '../schema/demo';
import type { Step } from '../schema/step';

/**
 * Render-mode config transform.
 *
 * A demo only plays start-to-finish on its own when `chrome.autoplay` is
 * true AND every step's `advance.trigger` is `auto`. Authored demos rarely
 * satisfy both (covers default to click-advance; many demos leave autoplay
 * off), so a server-side exporter that just presses play would stall at the
 * first click-gated step and never fire the runtime's `complete` event.
 *
 * `applyRenderModeOverrides` returns a NEW demo (the input is not mutated)
 * that is guaranteed to auto-advance through every step and terminate:
 *
 *   - `chrome.autoplay` is forced on.
 *   - Every step's `advance.trigger` becomes `auto`.
 *   - Steps whose duration cannot be derived from media or voiceover get an
 *     explicit dwell so they don't fall back to an arbitrary default and so
 *     image/cover steps hold for a sensible, predictable beat.
 *   - The interactive controls bar (play / scrub) is hidden — it's
 *     meaningless in a rendered video. The HEADER is NOT touched: it follows
 *     the demo's own `chrome.hideHeader`, so authors decide whether their
 *     player header appears in exports. Pass `hideChrome: false` to also keep
 *     the controls (e.g. for an interactive screenshot).
 *
 * This is the single source of truth for "render mode".
 */
export interface RenderModeOptions {
    /** Dwell for image content steps with no voiceover (ms). */
    contentDurationMs?: number;
    /** Dwell for cover steps with no voiceover (ms). */
    coverDurationMs?: number;
    /** Hide the interactive controls bar in exported frames. Default true.
     *  The header is independent — it follows the demo's `chrome.hideHeader`. */
    hideChrome?: boolean;
}

const DEFAULT_CONTENT_DURATION_MS = 5_000;
const DEFAULT_COVER_DURATION_MS = 4_000;

function hasDerivableDuration(step: Step): boolean {
    // An explicit duration or a voiceover gives the runtime a concrete
    // dwell. Video backgrounds derive their dwell from the loaded media, so
    // we must NOT stamp a fixed duration over them.
    if (typeof step.duration === 'number') return true;
    if (step.voiceover) return true;
    if (step.kind === 'content' && step.background?.type === 'video') return true;
    return false;
}

export function applyRenderModeOverrides(
    demo: Demo,
    options: RenderModeOptions = {},
): Demo {
    const contentDurationMs =
        options.contentDurationMs ?? DEFAULT_CONTENT_DURATION_MS;
    const coverDurationMs =
        options.coverDurationMs ?? DEFAULT_COVER_DURATION_MS;
    const hideChrome = options.hideChrome ?? true;

    const next: Demo = structuredClone(demo);

    next.chrome = {
        ...next.chrome,
        autoplay: true,
        // Hide the controls bar only; leave `hideHeader` to the demo's config.
        ...(hideChrome
            ? { controls: 'hidden' as const, hideControls: true }
            : {}),
    };

    next.steps = next.steps.map((step): Step => {
        const advance = { ...step.advance, trigger: 'auto' as const };

        if (step.kind === 'content') {
            const duration = hasDerivableDuration(step)
                ? step.duration
                : contentDurationMs;
            return { ...step, advance, duration };
        }

        // cover
        const duration = hasDerivableDuration(step)
            ? step.duration
            : coverDurationMs;
        return { ...step, advance, duration };
    });

    return next;
}
