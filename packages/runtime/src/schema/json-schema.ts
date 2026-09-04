/**
 * Canonical `$schema` URL for `demo.config.json`.
 *
 * The JSON-Schema document served at this URL is generated from the Zod
 * schema in this package (`DemoSchema`) and published with the npm
 * package, so the published schema can never drift from what the player
 * validates. This module deliberately holds only the URL string so it
 * stays a zero-dependency import for the tools that bake it into configs.
 */

/** Base URL for published schema documents. */
const SCHEMA_BASE =
  'https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo/schema';

/**
 * Stable, canonical `$schema` value for `demo.config.json`. Tracks the
 * latest published version; immutable per-version copies live at
 * `https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo@<version>/schema/demo.config.json`.
 */
export const DEMO_CONFIG_SCHEMA_URL = `${SCHEMA_BASE}/demo.config.json`;
