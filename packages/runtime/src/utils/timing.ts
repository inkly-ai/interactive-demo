import type { Step } from '../schema';

export const DEFAULT_STEP_DURATION_MS = 5000;

export type AudioDurationMap = Record<string, number | undefined>;
export type VideoDurationMap = Record<string, number | undefined>;

// De-dupe set for the dev-only "no duration" warning, keyed by step id. Kept
// module-global but BOUNDED so a long-lived SPA host mounting many demos can't
// grow it without limit (and stale step ids from prior demos get evicted
// FIFO). The warning is purely a dev convenience, so eviction at worst lets a
// previously-warned step warn again — harmless.
const MAX_FALLBACK_WARNINGS = 256;
const fallbackWarnings = new Set<string>();

function shouldWarnForFallback(stepId: string): boolean {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;

  if (nodeEnv === 'production' || fallbackWarnings.has(stepId)) {
    return false;
  }

  if (fallbackWarnings.size >= MAX_FALLBACK_WARNINGS) {
    const oldest = fallbackWarnings.values().next().value;
    if (oldest !== undefined) {
      fallbackWarnings.delete(oldest);
    }
  }
  fallbackWarnings.add(stepId);
  return true;
}

/**
 * Step length = whichever of the audio / video tracks runs longest.
 * Authors can still pin a duration explicitly via `step.duration`;
 * otherwise we wait for whichever media element loads its metadata and
 * take the longer of the two. When neither track exists (a still
 * screenshot with no voiceover), fall back to `DEFAULT_STEP_DURATION_MS`.
 */
export function getEffectiveStepDuration(
  step: Step,
  audioDurations: AudioDurationMap = {},
  videoDurations: VideoDurationMap = {},
): number {
  if (step.duration !== undefined) {
    return step.duration;
  }

  const audio = step.voiceover?.duration ?? audioDurations[step.id];
  const video = videoDurations[step.id];

  if (audio !== undefined || video !== undefined) {
    return Math.max(audio ?? 0, video ?? 0);
  }

  if (shouldWarnForFallback(step.id)) {
    console.warn(
      `Demo step "${step.id}" has no explicit duration or loaded media duration. Falling back to ${DEFAULT_STEP_DURATION_MS}ms.`,
    );
  }

  return DEFAULT_STEP_DURATION_MS;
}
