import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { resolveArgPath } from './options.js';

/**
 * Root folder for everything capture keeps outside the project: live session
 * state, in-progress frames, and persistent Chrome profiles. Override with
 * `INTERACTIVE_DEMO_CAPTURE_HOME` (tests point it at a temp dir).
 */
export function captureHome(): string {
  return process.env.INTERACTIVE_DEMO_CAPTURE_HOME || join(homedir(), '.interactive-demo', 'capture');
}

export function profilesRootDir(): string {
  return join(captureHome(), 'profiles');
}

export function sanitizeProfileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'default'
  );
}

export function profileNameFromUrl(value: string): string {
  const parsed = new URL(value);
  const host = (parsed.host || parsed.hostname).replace(/^www\./i, '');
  return sanitizeProfileName(host);
}

/**
 * Resolve a `--profile` value to a PERSISTENT Chrome user-data-dir. A bare name
 * (e.g. `acme`) maps to a stable dir under the profiles root so the same
 * `--profile acme` reuses the same logged-in profile run-to-run; a value with
 * a path separator is treated as an explicit directory.
 */
export function resolveProfileDir(cwd: string, value: string): string {
  if (value.includes('/') || isAbsolute(value)) return resolveArgPath(cwd, value);
  return join(profilesRootDir(), sanitizeProfileName(value));
}
