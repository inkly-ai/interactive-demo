import { z } from 'zod';
import { AnnotationSchema } from './annotations';
import { CaptionSchema } from './caption';
import { VoiceoverSchema } from './voiceover';
import { CoverBackgroundImageSchema, CoverBackgroundSchema } from './cover';
import { WidgetSchema } from './widget';

/**
 * How the media fits inside the stage box. Matches the standard CSS
 * `object-fit` values we care about for editorial framing.
 */
export const ObjectFitSchema = z.enum(['contain', 'cover', 'fill']);

/**
 * Anchoring inside the stage box. Matches `object-position`, but locked
 * to the nine-point alignment grid the editor exposes. Stored as the
 * literal CSS keyword so it can flow straight into a style attr.
 */
export const ObjectPositionSchema = z.enum([
  'left top',
  'center top',
  'right top',
  'left center',
  'center center',
  'right center',
  'left bottom',
  'center bottom',
  'right bottom',
]);

export const ImageBackgroundSchema = z.object({
  type: z.literal('image'),
  src: z.string().min(1),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
  alt: z.string().optional(),
  sourceUrl: z.string().optional(),
  title: z.string().optional(),
  objectFit: ObjectFitSchema.optional(),
  objectPosition: ObjectPositionSchema.optional(),
});

export const VideoBackgroundSchema = z.object({
  type: z.literal('video'),
  src: z.string().min(1),
  posterSrc: z.string().min(1).optional(),
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
  alt: z.string().optional(),
  sourceUrl: z.string().optional(),
  title: z.string().optional(),
  autoplay: z.boolean().default(true),
  muted: z.boolean().default(true),
  objectFit: ObjectFitSchema.optional(),
  objectPosition: ObjectPositionSchema.optional(),
});

export const BackgroundSchema = z.discriminatedUnion('type', [
  ImageBackgroundSchema,
  VideoBackgroundSchema,
]);

export const TransformSchema = z.object({
  zoom: z.number().min(1).default(1),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
});

export const StepAdvanceSchema = z
  .object({ trigger: z.enum(['auto', 'click']).default('auto') })
  .default({ trigger: 'auto' });

export const ContentStepSchema = z.object({
  kind: z.literal('content').default('content'),
  id: z.string(),
  label: z.string().optional(),
  duration: z.number().positive().optional(),
  background: BackgroundSchema,
  /**
   * Narration script for this step — the text authors write (and the
   * editor synthesizes from) for the voiceover. Persists independently of
   * the generated `voiceover` audio so the script survives edits and
   * re-generation.
   */
  script: z.string().optional(),
  voiceover: VoiceoverSchema.optional(),
  transform: TransformSchema.optional(),
  advance: StepAdvanceSchema,
  annotations: z.array(AnnotationSchema).default([]),
  captions: z.array(CaptionSchema).optional(),
}).passthrough();

/**
 * Cover step — the single-widget splash screen used to introduce,
 * punctuate, or close out a demo.
 *
 * A cover holds exactly one widget (`widgets` has length 1) that fills
 * the splash screen. A `headline` or `form` widget can carry an optional
 * positioned image; an `embed` widget renders full-bleed, covering the
 * whole player edge to edge.
 *
 * There is no separate `outro` step kind — the closing screen of a demo
 * is just a final cover step, typically with a headline whose CTA has
 * `action: { type: 'restart' }` (replay) or `{ type: 'url', href }`
 * (learn more). Group it under a chapter named "Wrap up" if the demo
 * uses chapter nav.
 *
 * Step-level fields that survive are chrome only: backdrop image, dim,
 * voiceover, advance behavior. Cover steps default to
 * `advance.trigger = 'click'` because they wait for a viewer action.
 */
export const CoverStepSchema = z.object({
  kind: z.literal('cover'),
  id: z.string(),
  label: z.string().optional(),
  widgets: z.array(WidgetSchema).length(1),
  background: CoverBackgroundSchema.optional(),
  backgroundImage: CoverBackgroundImageSchema.optional(),
  backgroundDim: z.number().min(0).max(1).optional(),
  /** Narration script for this step — see {@link ContentStepSchema.script}. */
  script: z.string().optional(),
  voiceover: VoiceoverSchema.optional(),
  duration: z.number().positive().optional(),
  advance: z
    .object({ trigger: z.enum(['auto', 'click']).default('click') })
    .default({ trigger: 'click' }),
}).passthrough();

/**
 * A step is either a `content` step (screen recording / image background
 * with annotations) or a `cover` step (widget-grid splash / closing
 * screen). The `kind` discriminator picks the shape.
 *
 * @example
 * ```json
 * {
 *   "kind": "content",
 *   "id": "step-dashboard",
 *   "background": {
 *     "type": "image",
 *     "src": "/screens/dashboard.png",
 *     "naturalWidth": 1440,
 *     "naturalHeight": 900
 *   },
 *   "annotations": []
 * }
 * ```
 */
export const StepSchema = z.discriminatedUnion('kind', [
  ContentStepSchema,
  CoverStepSchema,
]);

export type ImageBackground = z.infer<typeof ImageBackgroundSchema>;
export type VideoBackground = z.infer<typeof VideoBackgroundSchema>;
export type Background = z.infer<typeof BackgroundSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type ContentStep = z.infer<typeof ContentStepSchema>;
export type CoverStep = z.infer<typeof CoverStepSchema>;
export type Step = z.infer<typeof StepSchema>;
