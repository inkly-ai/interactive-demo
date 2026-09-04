import { z } from 'zod';

/**
 * Optional CTA a host page may show next to the player — typically a
 * "Try X" button that links viewers back to the product. Player headers
 * intentionally do not render brand CTAs.
 *
 * @example
 * ```json
 * { "label": "Try Acme", "href": "https://www.example.com" }
 * ```
 */
export const BrandingCtaSchema = z.object({
  label: z.string().min(1),
  href: z
    .string()
    .refine(
      (v) => /^(https?:|mailto:)/i.test(v),
      'href must be an http(s) or mailto URL',
    ),
});

/**
 * Host-level brand. `favicon` and the CTAs are for the host page (demo
 * brand drops them). `logo` accepts an absolute URL, a managed asset
 * reference (`asset:<id>`), or a project-relative file reference such as
 * `public/logo.svg`.
 *
 * Demos may override brand identity (`logo`, `name`, `logoHref`) per-field.
 * CTAs stay on the host page; the player header never renders them.
 *
 * @example
 * ```json
 * {
 *   "logo": "public/logo.svg",
 *   "name": "Acme",
 *   "logoHref": "https://www.example.com",
 *   "favicon": "/favicon.ico",
 *   "cta": { "label": "Try Acme", "href": "https://www.example.com" }
 * }
 * ```
 */
export const BrandSchema = z.object({
  logo: z.string().min(1).optional(),
  /**
   * Wordmark text shown next to the logo in the demo header. Optional —
   * leave empty when the `logo` image already includes the brand name.
   * Distinct from the per-demo `title`.
   */
  name: z.string().min(1).optional(),
  /**
   * Click target for the header logo / wordmark. When set, the header
   * brand becomes a link opening this URL. Same protocol allowlist as a
   * CTA href (http(s) or mailto).
   */
  logoHref: z
    .string()
    .refine(
      (v) => /^(https?:|mailto:)/i.test(v),
      'logoHref must be an http(s) or mailto URL',
    )
    .optional(),
  favicon: z.string().min(1).optional(),
  /** Primary CTA — for the host page only. */
  cta: BrandingCtaSchema.optional(),
  /**
   * Secondary CTA — for the host page only. Optional; omitted means the
   * host shows just the primary button (or nothing if `cta` is also
   * absent).
   */
  secondaryCta: BrandingCtaSchema.optional(),
});

/** Per-demo brand identity. Host-only fields such as favicon and CTAs do not apply. */
export const DemoBrandSchema = BrandSchema.pick({
  logo: true,
  name: true,
  logoHref: true,
});

export type BrandingCta = z.infer<typeof BrandingCtaSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type DemoBrand = z.infer<typeof DemoBrandSchema>;
