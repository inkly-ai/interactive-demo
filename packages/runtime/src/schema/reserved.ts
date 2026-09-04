/**
 * Slugs that the CLI and viewer refuse to use as demo folder names —
 * either because they collide with built-in URL prefixes or with future
 * reservations.
 */
export const RESERVED_DEMO_SLUGS = [
  '__demo', // CLI internal endpoints (/__demo/config, etc.)
  'assets', // project-level static asset path
  'api', // common future surface; reserve now
  'c', // reserved for possible collection URLs later
] as const;

export type ReservedDemoSlug = (typeof RESERVED_DEMO_SLUGS)[number];

export type SlugValidation =
  | { ok: true }
  | { ok: false; reason: string };

const RESERVED_REASONS: Record<ReservedDemoSlug, string> = {
  __demo: "'__demo' is reserved for CLI internal endpoints",
  assets: "'assets' is reserved for project static files",
  api: "'api' is reserved for future use",
  c: "'c' is reserved for future use",
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Validate a demo folder slug. Returns either {ok: true} or
 * {ok: false, reason: string}. Used by the CLI's init + demo commands
 * and by the dev server's route resolver.
 *
 * Rules:
 *   - Lowercase letters, digits, and hyphens only (kebab-case).
 *   - Must start AND end with a letter or digit.
 *   - May not begin with `_` or `.` (reserved for internal/hidden).
 *   - May not be in RESERVED_DEMO_SLUGS.
 *   - May not be empty or contain whitespace, slashes, or dots.
 */
export function validateDemoSlug(slug: unknown): SlugValidation {
  if (typeof slug !== 'string') {
    return { ok: false, reason: 'Name is required.' };
  }
  if (slug.length === 0) {
    return { ok: false, reason: 'Name cannot be empty.' };
  }
  if (/\s/.test(slug)) {
    return { ok: false, reason: 'Name cannot contain spaces.' };
  }
  if (slug.includes('/') || slug.includes('\\')) {
    return { ok: false, reason: 'Name cannot contain slashes.' };
  }
  if (slug.includes('.')) {
    return { ok: false, reason: 'Name cannot contain dots.' };
  }
  // Reserved-list check runs before the leading-underscore rule so
  // entries like `__demo` surface the more informative reason.
  if ((RESERVED_DEMO_SLUGS as readonly string[]).includes(slug)) {
    return {
      ok: false,
      reason: RESERVED_REASONS[slug as ReservedDemoSlug],
    };
  }
  if (slug.startsWith('_')) {
    return {
      ok: false,
      reason: "Name cannot start with '_' (reserved for internal use).",
    };
  }
  if (slug !== slug.toLowerCase()) {
    return {
      ok: false,
      reason: 'Name must be lowercase (e.g. "getting-started").',
    };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason:
        'Name must be kebab-case: lowercase letters, digits, and hyphens, starting and ending with a letter or digit.',
    };
  }
  return { ok: true };
}
