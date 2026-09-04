import { useMemo } from 'react';
import type { Caption, Step } from '../schema';

/**
 * Resolve the active caption for the current step. Time base:
 *   - step has voiceover → cues track `audioCurrentTime` (tight sync
 *     with the audio element's `timeupdate` events).
 *   - step has no voiceover → cues track `stepElapsedMs` (the player's
 *     own playback clock).
 *
 * Captions only exist on `kind: 'content'` steps; cover screens
 * short-circuit to `null`.
 */
export function useCaption(
  currentStep: Step | null,
  audioCurrentTime: number,
  stepElapsedMs: number,
): Caption | null {
  const captions =
    currentStep && currentStep.kind === 'content'
      ? currentStep.captions ?? []
      : [];
  const hasVoiceover = !!currentStep?.voiceover;
  const t = hasVoiceover ? audioCurrentTime : stepElapsedMs;
  return useMemo(() => {
    if (captions.length === 0) return null;
    return (
      captions.find((c: Caption) => {
        const start = c.start ?? 0;
        const end = c.end ?? Number.POSITIVE_INFINITY;
        return t >= start && t < end;
      }) ?? null
    );
  }, [t, captions]);
}
