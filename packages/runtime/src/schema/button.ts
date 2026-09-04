import { z } from 'zod';

/**
 * Configurable destination for an authored button. Used by the headline
 * widget's `cta` today, and exposed for any custom widget that wants the
 * same "where does this go" knob. Six destinations:
 *
 * - `next`    → advance one step (default).
 * - `prev`    → go back one step.
 * - `step`    → seek to a specific step by id.
 * - `chapter` → seek to the first step of a chapter by id.
 * - `url`     → open an external URL. Defaults to `target="_blank"` with
 *               `rel="noopener noreferrer"` for safety; opt into
 *               `_self` to navigate the host page instead.
 * - `restart` → reset the demo to the first step.
 *
 * `step` and `chapter` ids are validated at parse time by
 * `DemoSchema.superRefine`, so a typo fails fast at `parseDemo()`
 * rather than no-op-ing silently at click time.
 */

export const ButtonActionNextSchema = z.object({
  type: z.literal('next'),
});

export const ButtonActionPrevSchema = z.object({
  type: z.literal('prev'),
});

export const ButtonActionStepSchema = z.object({
  type: z.literal('step'),
  stepId: z.string().min(1),
});

export const ButtonActionChapterSchema = z.object({
  type: z.literal('chapter'),
  chapterId: z.string().min(1),
});

export const ButtonActionUrlSchema = z.object({
  type: z.literal('url'),
  href: z.string().min(1),
  /** Browser target. Default `_blank`. */
  target: z.enum(['_self', '_blank']).default('_blank'),
});

export const ButtonActionRestartSchema = z.object({
  type: z.literal('restart'),
});

export const ButtonActionSchema = z.discriminatedUnion('type', [
  ButtonActionNextSchema,
  ButtonActionPrevSchema,
  ButtonActionStepSchema,
  ButtonActionChapterSchema,
  ButtonActionUrlSchema,
  ButtonActionRestartSchema,
]);

export const ButtonAnimationSchema = z.enum(['none', 'shimmer']);

/**
 * Shared shape used by widget `cta` fields. `action` defaults to
 * `{ type: 'next' }` so the common case (advance on click) needs no
 * configuration. `animation` defaults to shimmer; set `none` to render
 * a static button.
 */
export const CtaSchema = z.object({
  label: z.string().min(1),
  action: ButtonActionSchema.default({ type: 'next' }),
  animation: ButtonAnimationSchema.default('shimmer'),
  /** Optional CSS color override for the rendered button background. */
  background: z.string().optional(),
  /** Optional CSS color override for the rendered button text. */
  textColor: z.string().optional(),
});

export type ButtonAction = z.infer<typeof ButtonActionSchema>;
export type ButtonAnimation = z.infer<typeof ButtonAnimationSchema>;
export type Cta = z.infer<typeof CtaSchema>;
