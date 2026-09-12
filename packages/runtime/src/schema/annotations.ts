import { z } from 'zod';

const BaseAnnotation = z.object({
  id: z.string(),
});

export const HotspotAnchorSchema = z
  .enum(['top', 'right', 'bottom', 'left', 'auto'])
  .default('auto');

export const TextAlignSchema = z.enum(['left', 'middle', 'right']);

export const MessageTextAlignSchema = TextAlignSchema.default('left');

export const HotspotNavButtonSchema = z.object({
  label: z.string().optional(),
  hidden: z.boolean().default(false),
});

const hotspotAppearanceFields = {
  background: z.string().optional(),
  textColor: z.string().optional(),
  borderRadius: z.string().optional(),
  textAlign: MessageTextAlignSchema,
  anchor: HotspotAnchorSchema,
  showNavigation: z.boolean().default(true),
  prevButton: HotspotNavButtonSchema.optional(),
  nextButton: HotspotNavButtonSchema.optional(),
};

/**
 * Hotspot variants. A `Message` is a single annotation type that the
 * author can re-shape between several visual presentations:
 *
 * - `pointer` — pulsing dot at `(x, y)` with an inline message.
 * - `callout` — pinned card at `(x, y)`.
 * - `area`    — clickable rectangle `(x, y, w, h)` with a pinned card.
 * - `cursor`  — Screen-Studio style simulated mouse cursor at `(x, y)`.
 *   Behaves like `pointer` (shares text/anchor/advance) but renders an
 *   arrow that glides from the previous step's cursor position to this
 *   one with distance-scaled timing + motion blur, then enlarges and
 *   morphs into a pressing hand when the step advances.
 *
 * All variants share a single `text` field for content — inline markdown
 * (e.g. `**bold**`, `*italic*`) is supported, so authors can still draw a
 * visual hierarchy when they want one. Shared x/y, advance behavior, and
 * appearance let the editor convert between variants without losing data.
 */
export const MessageVariantSchema = z.enum([
  'pointer',
  'callout',
  'area',
  'cursor',
]);

export const MessageSchema = BaseAnnotation.extend({
  type: z.literal('message'),
  variant: MessageVariantSchema.default('callout'),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** Width of the hit region. Required when `variant === 'area'`. */
  w: z.number().min(0).max(1).optional(),
  /** Height of the hit region. Required when `variant === 'area'`. */
  h: z.number().min(0).max(1).optional(),
  /** Message body. Supports inline markdown (`**bold**`, `*italic*`). */
  text: z.string().optional(),
  /**
   * Pointer/cursor-only message visibility toggle.
   *
   * - `pointer`: defaults to `true`, matching the historical always-visible card.
   * - `cursor`: defaults to `false`, matching the historical hover-reveal card.
   * - `callout`/`area`: parsed but ignored by the renderer.
   */
  showMessage: z.boolean().optional(),
  advancesStep: z.boolean().default(true),
  ...hotspotAppearanceFields,
});

export const BlurAnnotationSchema = BaseAnnotation.extend({
  type: z.literal('blur'),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  intensity: z.number().min(0).max(20).default(8),
});

export const TextAnnotationSchema = BaseAnnotation.extend({
  type: z.literal('text'),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  text: z.string(),
  fontSize: z.number().positive().default(16),
  color: z.string().optional(),
});

/**
 * Annotation overlaid on a content step. `type` selects one of three
 * shapes: `message` (hotspot pointer / callout / area), `blur` (mask
 * a rectangle), or `text` (free-floating label).
 *
 * @example
 * ```json
 * {
 *   "type": "message",
 *   "id": "tip-1",
 *   "variant": "callout",
 *   "x": 0.5,
 *   "y": 0.5,
 *   "text": "Click here to continue"
 * }
 * ```
 */
export const KnownAnnotationSchema = z.discriminatedUnion('type', [
  MessageSchema,
  BlurAnnotationSchema,
  TextAnnotationSchema,
]);

export const KNOWN_ANNOTATION_TYPES = new Set(['message', 'blur', 'text']);

/**
 * Forward-compat catch-all for annotations whose `type` is not one of the
 * known variants. Without this, a single unknown annotation type (e.g. a
 * future `spotlight`) emitted by a newer authoring surface would fail the
 * whole demo's `safeParse` and blank the player. The catch-all is GUARDED to
 * only match genuinely-unknown types — a malformed KNOWN annotation (e.g. a
 * `message` missing required coords) still fails exactly as before instead of
 * silently degrading to the catch-all. Unknown fields are preserved via
 * `.passthrough()`. The runtime render layer already skips annotation types it
 * has no renderer for (`if (!Renderer) return null`), so a permissive parse +
 * render-skip is safe.
 */
const UnknownAnnotationSchema = z.object({ type: z.string() }).passthrough();

type KnownAnnotation = z.infer<typeof KnownAnnotationSchema>;

function annotationDiscriminant(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? (value as { type?: unknown }).type
    : undefined;
}

/**
 * Dispatches on the `type` discriminant so error reporting for KNOWN annotation
 * types is IDENTICAL to the bare discriminated union. An input whose `type` is
 * a known variant is validated ONLY against {@link KnownAnnotationSchema} and
 * its issues are copied through verbatim (preserving precise field paths like
 * `…annotations.0.textAlign`). Inputs with an unknown / missing `type` fall to
 * the permissive {@link UnknownAnnotationSchema} catch-all — the forward-compat
 * parse-and-skip path that stops one unknown annotation from failing the whole
 * demo. Unknown fields are preserved via `.passthrough()`. The runtime render
 * layer already skips annotation types it has no renderer for
 * (`if (!Renderer) return null`), so permissive parse + render-skip is safe.
 *
 * Implemented with `superRefine` + manual sub-parse (rather than `z.union`,
 * which would aggregate both branches' errors and surface a generic union /
 * catch-all error for a malformed KNOWN annotation). Exported with a static
 * output type of the known union; the cast is type-only (runtime still accepts
 * the catch-all), keeping `z.infer` and the inferred `Step` / `Demo` shapes as
 * the known discriminated union so consumers' `a.type === 'message'` narrowing
 * keeps working unchanged.
 */
export const AnnotationSchema: z.ZodType<KnownAnnotation, z.ZodTypeDef, unknown> =
  z
    .any()
    .superRefine((value, ctx) => {
      const isKnown = KNOWN_ANNOTATION_TYPES.has(
        annotationDiscriminant(value) as string,
      );
      const schema = isKnown ? KnownAnnotationSchema : UnknownAnnotationSchema;
      const result = schema.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue(issue);
        }
      }
    })
    .transform((value) => {
      const isKnown = KNOWN_ANNOTATION_TYPES.has(
        annotationDiscriminant(value) as string,
      );
      const schema = isKnown ? KnownAnnotationSchema : UnknownAnnotationSchema;
      // Safe: superRefine already rejected invalid input, so by the time the
      // transform runs the value parses cleanly. Returns the coerced output
      // (defaults applied) so downstream consumers see the normal shape.
      const parsed = schema.parse(value);
      if (
        isKnown &&
        parsed.type === 'message' &&
        parsed.showMessage === undefined &&
        (parsed.variant === 'pointer' || parsed.variant === 'cursor')
      ) {
        return {
          ...parsed,
          showMessage: parsed.variant === 'pointer',
        };
      }
      return parsed;
    }) as unknown as z.ZodType<KnownAnnotation, z.ZodTypeDef, unknown>;

export type HotspotAnchor = z.infer<typeof HotspotAnchorSchema>;
export type HotspotNavButton = z.infer<typeof HotspotNavButtonSchema>;
export type TextAlign = z.infer<typeof TextAlignSchema>;
export type MessageTextAlign = z.infer<typeof MessageTextAlignSchema>;
export type MessageVariant = z.infer<typeof MessageVariantSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type BlurAnnotation = z.infer<typeof BlurAnnotationSchema>;
export type TextAnnotation = z.infer<typeof TextAnnotationSchema>;
/**
 * `Annotation` is intentionally the KNOWN discriminated union, not
 * `z.infer<typeof AnnotationSchema>`. The runtime schema additionally accepts
 * an unknown-`type` catch-all (forward-compat parse-and-skip), but exporting
 * that widened shape would break discriminant narrowing for every consumer
 * (`a.type === 'message'` etc.). Keeping the static type as the known union
 * preserves the exact type contract while the parser stays permissive.
 */
export type Annotation = z.infer<typeof KnownAnnotationSchema>;
