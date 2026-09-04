import { z } from 'zod';

const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'must be a hex color like #5b3df5',
  });

export const CoverBackgroundTypeSchema = z.enum(['color', 'image', 'glassmorphism']);

/**
 * Per-cover backdrop. `color` supports either a flat `color` fill or a
 * two-stop gradient (`from` + `to`); `image` mirrors the legacy
 * `backgroundImage` field but can live alongside color choices in a
 * single editor control. `glassmorphism` derives its visual from the
 * demo's first contentful image at render time (no stored src required);
 * an optional `src`/`alt` may be present as a static-preview fallback.
 * `intensity` controls the glass source-image blur radius in pixels.
 * `blur` optionally softens authored image backgrounds in pixels.
 */
export const CoverBackgroundSchema = z
  .object({
    type: CoverBackgroundTypeSchema,
    color: HexColorSchema.optional(),
    from: HexColorSchema.optional(),
    to: HexColorSchema.optional(),
    src: z.string().min(1).optional(),
    alt: z.string().optional(),
    blur: z.number().min(0).max(48).optional(),
    intensity: z.number().min(-5).max(48).optional(),
  })
  .superRefine((background, ctx) => {
    if (background.type === 'color') {
      const hasSolid = !!background.color;
      const hasGradient = !!background.from && !!background.to;
      if (!hasSolid && !hasGradient) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['color'],
          message: 'color backgrounds require color or from/to',
        });
      }
      if ((!!background.from) !== (!!background.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: background.from ? ['to'] : ['from'],
          message: 'gradient backgrounds require both from and to',
        });
      }
    }
    if (background.type === 'image' && !background.src) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['src'],
        message: 'image backgrounds require src',
      });
    }
  });

/**
 * Cover-step backdrop image. The only cover-level chrome that's still a
 * step field (everything else moved onto widgets). Rendered as a layer
 * behind the widget grid; pair with `backgroundDim` for contrast over
 * photographic backdrops.
 */
export const CoverBackgroundImageSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
});

export type CoverBackground = z.infer<typeof CoverBackgroundSchema>;
export type CoverBackgroundImage = z.infer<typeof CoverBackgroundImageSchema>;
