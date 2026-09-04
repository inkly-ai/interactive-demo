import { z } from 'zod';

/**
 * Caption cue, scoped to a single step. Times are in milliseconds.
 *
 * Time base depends on whether the step has audio:
 *   - with voiceover → cues resolve against `audioCurrentTime`
 *   - without voiceover → cues resolve against `stepElapsedMs`
 *
 * Both `start` and `end` are optional; omitted bounds default to
 * `0` and `+Infinity` respectively, so `{ id, text }` keeps the
 * caption visible for the entire step.
 */
export const CaptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number().nonnegative().optional(),
  end: z.number().nonnegative().optional(),
});

export type Caption = z.infer<typeof CaptionSchema>;
