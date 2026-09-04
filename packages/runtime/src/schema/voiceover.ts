import { z } from 'zod';

/**
 * Voiceover audio attached to a step. Captions are authored at the step
 * level (`step.captions`), not here — when audio is present, those caption
 * cues automatically track the audio clock.
 */
export const VoiceoverSchema = z.object({
  src: z.string().min(1),
  duration: z.number().positive().optional(),
});

export type Voiceover = z.infer<typeof VoiceoverSchema>;
