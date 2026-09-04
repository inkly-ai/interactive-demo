/**
 * Stable, opaque per-demo identity.
 *
 * Every demo folder carries a permanent `id` in its `demo.config.json`.
 * The id is the demo's identity for public URLs,
 * so it must stay constant across folder moves / renames. Ids are minted
 * client-side (offline, no server round-trip) and are crypto-random with
 * ~72 bits of entropy — no timestamps, no sequence, no coordination.
 *
 * The alphabet is the URL-safe base64 set (`A-Z a-z 0-9 - _`) minus the
 * non-URL-safe `/` and `+`, so an id drops straight into a path segment
 * without encoding. Length is fixed at 12.
 */

/** Number of characters in a generated demo id. */
export const DEMO_ID_LENGTH = 12;

/**
 * URL-safe id alphabet: 64 symbols, so each character maps cleanly to 6
 * random bits with no modulo bias. Order is irrelevant (ids are opaque).
 */
const DEMO_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Canonical demo-id format: exactly {@link DEMO_ID_LENGTH} characters from
 * the URL-safe alphabet. Anchored so partial matches are rejected.
 */
export const DEMO_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

/**
 * Cross-environment CSPRNG access. `globalThis.crypto.getRandomValues`
 * exists in browsers, Node 19+, Deno, and the edge runtime, so we never
 * reach for `node:crypto` (which would break the browser / edge bundles).
 * Feature-detected so a misconfigured host fails loudly rather than
 * silently minting predictable ids.
 */
function fillRandomBytes(bytes: Uint8Array): void {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error(
      'generateDemoId requires globalThis.crypto.getRandomValues (Node 19+, browsers, or edge runtime).',
    );
  }
  cryptoApi.getRandomValues(bytes);
}

/**
 * Mint a fresh, opaque, URL-safe demo id.
 *
 * Draws {@link DEMO_ID_LENGTH} crypto-random bytes and maps the low 6 bits
 * of each into the 64-symbol alphabet — a uniform, bias-free draw (~72
 * bits of entropy). Stateless and offline: safe to call in the editor,
 * the CLI, or an agent with no server.
 *
 * @example
 * ```ts
 * const id = generateDemoId(); // e.g. "k3Bq-7Zr_a1X"
 * ```
 */
export function generateDemoId(): string {
  const bytes = new Uint8Array(DEMO_ID_LENGTH);
  fillRandomBytes(bytes);
  let out = '';
  for (const byte of bytes) {
    // 64 is a power of two, so masking the low 6 bits is unbiased.
    // `charAt` always yields a string (0x3f keeps the index in 0..63).
    out += DEMO_ID_ALPHABET.charAt(byte & 0x3f);
  }
  return out;
}

/**
 * Type guard: `true` when `value` is a string matching
 * {@link DEMO_ID_PATTERN}. Use before trusting an id read from disk or a
 * URL.
 */
export function isValidDemoId(value: unknown): value is string {
  return typeof value === 'string' && DEMO_ID_PATTERN.test(value);
}

/**
 * Deterministically derive a valid demo id from a stable key.
 *
 * Unlike {@link generateDemoId} (crypto-random, for minting a brand-new
 * permanent id), this maps a fixed input string to a fixed id: the same key
 * always yields the same id. It is the fallback identity for a committed
 * config that was authored WITHOUT a valid `id` — every server read path can
 * key on the demo's stable slug and agree on the same id, so id-keyed
 * navigation (editor and public viewer URLs)
 * resolves instead of 404ing on a per-render random id.
 *
 * Not cryptographic: it only needs to be deterministic, dependency-free,
 * synchronous (it runs in render paths), edge/browser-safe (no `node:crypto`),
 * and to satisfy {@link DEMO_ID_PATTERN}. Collisions across a project's handful of
 * slugs are astronomically unlikely and, by construction, two distinct keys
 * that DO collide simply share an id — never the bug we're fixing here, where
 * one key produced a DIFFERENT id on each read.
 *
 * @example
 * ```ts
 * stableDemoIdFromKey('getting-started'); // always the same 12-char id
 * ```
 */
export function stableDemoIdFromKey(key: string): string {
  // FNV-1a (32-bit) seed hash over the key's UTF-16 code units.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Expand the seed to DEMO_ID_LENGTH chars via an xorshift step per
  // position, taking the low 6 bits each time so every character draws from
  // the 64-symbol alphabet (matching `generateDemoId`'s mapping).
  let state = h >>> 0;
  let out = '';
  for (let i = 0; i < DEMO_ID_LENGTH; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    out += DEMO_ID_ALPHABET.charAt(state & 0x3f);
  }
  return out;
}
