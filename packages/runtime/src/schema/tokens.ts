import { z } from 'zod';

/**
 * Hex color string — `#rgb`, `#rrggbb`, or `#rrggbbaa`. Case-insensitive
 * on the hex digits; the leading `#` is required.
 */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const HexColor = z
  .string()
  .regex(HEX_COLOR_RE, 'must be a hex color like #5b3df5');

/**
 * Theme tokens shared by host + demo. Exactly four optional knobs —
 * everything else is preset-controlled CSS. The cascade is:
 *
 *   effective.tokens = { ...preset.defaults, ...host.tokens, ...demo.tokens }
 *
 * @example
 * ```json
 * {
 *   "primary": "#5b3df5",
 *   "secondary": "#f4f4f5",
 *   "font": "Inter, system-ui, sans-serif",
 *   "radius": "12px"
 * }
 * ```
 */
export const ThemeTokensSchema = z
  .object({
    primary: HexColor.optional(),
    secondary: HexColor.optional(),
    font: z.string().min(1).optional(),
    radius: z.string().min(1).optional(),
  })
  .partial();

export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;
