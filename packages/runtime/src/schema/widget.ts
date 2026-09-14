import { z } from 'zod';
import { CtaSchema } from './button';
import { TextAlignSchema } from './annotations';

/**
 * Cover-step widget. A cover step holds exactly one widget that fills the
 * splash screen. The widget owns its own internal layout.
 *
 * Four widget types ship in the package: a copy/CTA `headline`, a `form`
 * (lead capture), an `embed` (full-bleed sandboxed iframe), and `custom`
 * for arbitrary author-provided components. The `headline` and `form`
 * widgets can carry an optional positioned image (see `WidgetImageSchema`)
 * — there is no standalone media widget.
 */

/**
 * Form widget fields are intentionally limited to the two shapes the
 * cover-screen form is designed for: a free-text input or a dropdown
 * with author-supplied options. Anything richer (multi-step forms,
 * file uploads, conditional logic) lives outside this package.
 */
export const FormFieldTypeSchema = z.enum(['text', 'dropdown']);

export const FormFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const FormFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: FormFieldTypeSchema.default('text'),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  /**
   * Dropdown choices. Required when `type === 'dropdown'`; ignored
   * for `text`. Validated in `superRefine` below — keeping it
   * optional at the field level lets `text` fields parse without a
   * dummy `options: []`.
   */
  options: z.array(FormFieldOptionSchema).optional(),
}).superRefine((field, ctx) => {
  if (field.type === 'dropdown') {
    if (!field.options || field.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Dropdown field requires at least one option.',
        path: ['options'],
      });
    }
  }
});

/**
 * Optional brand logo rendered above the headline title. `src` is an
 * asset reference resolved exactly like media widgets — `asset:<id>`
 * (resolved through the host's asset manifest), a project-relative path
 * (`assets/logo.png`), or a raw `https:`/`data:` URL. `height` is the
 * rendered logo height in px (width auto-scales to preserve aspect);
 * the runtime falls back to a sensible default when omitted.
 */
export const HeadlineLogoSchema = z.object({
  src: z.string().min(1),
  alt: z.string().optional(),
  height: z.number().int().positive().optional(),
});

export type HeadlineLogo = z.infer<typeof HeadlineLogoSchema>;

/**
 * Where the optional widget image sits relative to the widget's copy.
 * `left` / `right` place the image beside the copy (side-by-side on
 * desktop, stacking under it on narrow viewports); `top` is the stacked
 * layout — the headline/form copy sits on top and the image below it.
 */
export const WidgetImagePositionSchema = z.enum(['left', 'right', 'top']);

/**
 * Visual treatment for the widget image. `hero` (the default) renders
 * the image full-bleed — it fills its half of the cover and bleeds off
 * the player edge like a screenshot. `standard` keeps a contained,
 * rounded card sitting beside the copy.
 */
export const WidgetImageLayoutSchema = z.enum(['standard', 'hero']);

/**
 * Optional image embedded inside a `headline` or `form` widget (replaces
 * the old standalone `media` widget). `src` is an asset reference
 * resolved exactly like the headline logo — `asset:<id>` (resolved through
 * the host's asset manifest), a project-relative path, or a raw
 * `https:`/`data:` URL. Natural dimensions, when present, drive the
 * rendered aspect ratio. `position` places the image beside (left /
 * right) or above (top) the copy; `layout` picks the full-bleed `hero`
 * or contained `standard` treatment.
 */
export const WidgetImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().optional(),
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
  position: WidgetImagePositionSchema.default('right'),
  layout: WidgetImageLayoutSchema.default('hero'),
});

export type WidgetImagePosition = z.infer<typeof WidgetImagePositionSchema>;
export type WidgetImageLayout = z.infer<typeof WidgetImageLayoutSchema>;
export type WidgetImage = z.infer<typeof WidgetImageSchema>;

/**
 * Copy + CTA block. The "text widget" — a branded title/description with
 * an optional advance button and an optional positioned image. The
 * default choice for an intro or closing cover screen.
 */
export const HeadlineWidgetSchema = z.object({
  type: z.literal('headline'),
  id: z.string(),
  /**
   * Optional brand logo shown above the title. Resolved through the same
   * asset pipeline as media.
   */
  logo: HeadlineLogoSchema.optional(),
  /**
   * Optional image shown beside (or above) the headline copy. Position
   * is controlled by `image.position`. Resolved through the same asset
   * pipeline as the logo.
   */
  image: WidgetImageSchema.optional(),
  /**
   * Inline markdown (the `Markdown` util parses GFM — `*foo*` for
   * accent italic, `**foo**` for bold, etc.). The legacy
   * `titleAccent` substring field was removed because it duplicates
   * what inline markdown already expresses.
   */
  title: z.string(),
  /** Optional CSS color for the rendered title (e.g. `#0f172a`). */
  titleColor: z.string().optional(),
  /** Inline markdown, same convention as `title`. */
  description: z.string().optional(),
  /** Optional CSS color for the rendered description. */
  descriptionColor: z.string().optional(),
  /**
   * Optional authored alignment for the headline copy and CTA. When omitted,
   * the runtime keeps the layout-driven defaults (centered single-column
   * splashes, left-aligned horizontal splits).
   */
  textAlign: TextAlignSchema.optional(),
  /**
   * Optional call-to-action button. `action` controls the destination
   * (next / prev / step / url / restart). Omit `action` to default to
   * advancing to the next step.
   */
  cta: CtaSchema.optional(),
  /**
   * Optional second call-to-action rendered directly after `cta`.
   * Same destination, animation, and color override model as the
   * primary button.
   */
  secondaryCta: CtaSchema.optional(),
});

export const FormWidgetSchema = z.object({
  type: z.literal('form'),
  id: z.string(),
  /**
   * Optional brand logo shown above the form copy. Same shape and asset
   * pipeline as the headline widget's logo.
   */
  logo: HeadlineLogoSchema.optional(),
  /**
   * Optional image shown beside (or above) the form. Position is
   * controlled by `image.position`. Same asset pipeline as the logo.
   */
  image: WidgetImageSchema.optional(),
  /** Optional copy rendered above the form fields. */
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema).min(1),
  /**
   * Submit affordance. Reuses the same `Cta` shape as the headline
   * widget so authors get the full destination set (next / prev /
   * step / chapter / url / restart) on the submit button, not just a
   * static label + auto-advance.
   */
  submit: CtaSchema.default({
    label: 'Submit',
    action: { type: 'next' },
    animation: 'shimmer',
  }),
  /**
   * Where a submission is sent: the player POSTs the fields as JSON to
   * this URL (your own endpoint, a Zapier or Make webhook, Formspree…),
   * then follows the submit button's action. The endpoint must accept a
   * cross-origin POST. Omit it and the values only reach the host through
   * the `form_submit` runtime event.
   */
  submitTo: z
    .string()
    .refine((v) => /^https?:\/\//i.test(v), 'submitTo must be an http(s) URL')
    .optional(),
});

export const DEFAULT_EMBED_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';

export const DEFAULT_EMBED_ALLOW =
  'camera; microphone; fullscreen; payment; clipboard-write';

/**
 * Embedded URL (iframe). Renders full-bleed — the iframe covers the entire
 * player, edge to edge, with no title/subtitle chrome. Defaults to the broad
 * permissions most third-party scheduling/forms embeds need. The editor only
 * exposes `src`; custom JSON authors can still override `sandbox` and `allow`.
 * Viewers advance past an embed cover with the normal player controls.
 */
export const EmbedWidgetSchema = z.object({
  type: z.literal('embed'),
  id: z.string(),
  /**
   * Embed URL. May be empty while authoring — an empty `src` renders an
   * empty-state placeholder instead of a blank iframe, so a freshly added
   * embed widget reads as "add a URL" rather than a broken frame.
   */
  src: z.string(),
  /** Iframe `title` attribute for accessibility. */
  iframeTitle: z.string().optional(),
  /** Space-separated `sandbox` flags. */
  sandbox: z.string().default(DEFAULT_EMBED_SANDBOX),
  /** Iframe `allow` attribute (feature policy). */
  allow: z.string().default(DEFAULT_EMBED_ALLOW),
});

/**
 * Escape hatch for arbitrary host-supplied components. `name` selects
 * the renderer registered via `components={{ 'widget.custom.<name>': … }}`
 * on `<Demo />` / `<Demo.Widgets />`; `data` is an opaque prop bag
 * passed straight through.
 */
export const CustomWidgetSchema = z.object({
  type: z.literal('custom'),
  id: z.string(),
  name: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

/**
 * Cover-step widget. The `type` discriminator selects one of four
 * shapes: `headline` (copy + CTA, optional image), `form` (lead
 * capture, optional image), `embed` (full-bleed iframe), or `custom`
 * (host-supplied component).
 *
 * @example
 * ```json
 * {
 *   "type": "headline",
 *   "id": "welcome",
 *   "title": "Welcome to Acme",
 *   "description": "Take the tour in 2 minutes.",
 *   "cta": { "label": "Start", "action": { "type": "next" } }
 * }
 * ```
 */
export const KnownWidgetSchema = z.discriminatedUnion('type', [
  HeadlineWidgetSchema,
  FormWidgetSchema,
  EmbedWidgetSchema,
  CustomWidgetSchema,
]);

export const KNOWN_WIDGET_TYPES = new Set([
  'headline',
  'form',
  'embed',
  'custom',
]);

/**
 * Forward-compat catch-all for widgets whose `type` is unknown. Without it, a
 * single unknown widget type from a newer authoring surface would fail the
 * whole demo's `safeParse` and blank the player. GUARDED so a malformed KNOWN
 * widget still fails exactly as before; only genuinely-unknown types degrade
 * to a parse-and-skip. The runtime cover renderer's `switch (widget.type)`
 * falls through to rendering nothing for unrecognized types, so a permissive
 * parse + render-skip is safe.
 */
const UnknownWidgetSchema = z.object({ type: z.string() }).passthrough();

type KnownWidget = z.infer<typeof KnownWidgetSchema>;

function widgetDiscriminant(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? (value as { type?: unknown }).type
    : undefined;
}

/**
 * Dispatches on the `type` discriminant so error reporting for KNOWN widget
 * types is IDENTICAL to the bare discriminated union: a malformed known widget
 * surfaces its precise field error rather than a generic union / catch-all
 * error. Inputs with an unknown / missing `type` fall to the permissive
 * {@link UnknownWidgetSchema} catch-all — the forward-compat parse-and-skip
 * path that stops one unknown widget from failing the whole demo. Unknown
 * fields survive via `.passthrough()`. The runtime cover renderer's
 * `switch (widget.type)` falls through to rendering nothing for unrecognized
 * types, so permissive parse + render-skip is safe.
 *
 * Implemented with `superRefine` + manual sub-parse (not `z.union`, which would
 * aggregate both branches' errors). Exported with a static output type of the
 * known union; the cast is type-only (runtime still accepts the catch-all),
 * keeping `z.infer` and the inferred `Step` / `Demo` shapes as the known
 * discriminated union so consumers' `w.type === 'headline'` narrowing keeps
 * working unchanged.
 */
export const WidgetSchema: z.ZodType<KnownWidget, z.ZodTypeDef, unknown> = z
  .any()
  .superRefine((value, ctx) => {
    const isKnown = KNOWN_WIDGET_TYPES.has(widgetDiscriminant(value) as string);
    const schema = isKnown ? KnownWidgetSchema : UnknownWidgetSchema;
    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue(issue);
      }
    }
  })
  .transform((value) => {
    const isKnown = KNOWN_WIDGET_TYPES.has(widgetDiscriminant(value) as string);
    const schema = isKnown ? KnownWidgetSchema : UnknownWidgetSchema;
    return schema.parse(value);
  }) as unknown as z.ZodType<KnownWidget, z.ZodTypeDef, unknown>;

export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;
export type FormFieldOption = z.infer<typeof FormFieldOptionSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type HeadlineWidget = z.infer<typeof HeadlineWidgetSchema>;
export type FormWidget = z.infer<typeof FormWidgetSchema>;
export type EmbedWidget = z.infer<typeof EmbedWidgetSchema>;
export type CustomWidget = z.infer<typeof CustomWidgetSchema>;
/**
 * `Widget` is intentionally the KNOWN discriminated union, not
 * `z.infer<typeof WidgetSchema>`. The runtime schema additionally accepts an
 * unknown-`type` catch-all (forward-compat parse-and-skip), but exporting that
 * widened shape would break discriminant narrowing for every consumer
 * (`w.type === 'headline'` etc.). Keeping the static type as the known union
 * preserves the exact type contract while the parser stays permissive.
 */
export type Widget = z.infer<typeof KnownWidgetSchema>;
