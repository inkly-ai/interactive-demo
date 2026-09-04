import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { atomicWriteFile } from '../fs-atomic.js';

export interface PublishCliConfig {
  apiBase?: string;
  token?: string;
}

/** Production hosting origin. Used unless `interactive-demo login --local` is passed. */
export const DEFAULT_API_BASE = 'https://interactive-demo.inklyai.dev';
/** Local dev-build origin, selected by `interactive-demo login --local`. */
export const LOCAL_API_BASE = 'http://localhost:3000';
/**
 * Credentials file. Owned by this CLI alone — never shared with any other
 * tool's config, so a login here can't leak a token elsewhere.
 */
export const CONFIG_PATH = join(homedir(), '.interactive-demo', 'credentials.json');

export async function readConfig(): Promise<PublishCliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PublishCliConfig;
    return {
      apiBase: typeof parsed.apiBase === 'string' ? parsed.apiBase : undefined,
      token: typeof parsed.token === 'string' ? parsed.token : undefined,
    };
  } catch {
    return {};
  }
}

export async function writeConfig(config: PublishCliConfig): Promise<void> {
  // 0600: the config holds the auth token, so keep it owner-only. The atomic
  // temp file is created with this mode before the rename, so it never briefly
  // exists world-readable.
  await atomicWriteFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export async function clearConfig(): Promise<void> {
  await rm(CONFIG_PATH, { force: true });
}

export function normalizeApiBase(value: string | undefined): string {
  // `INTERACTIVE_DEMO_API_BASE` overrides the configured/default origin — handy
  // for pointing the CLI at a local dev build of the hosting app.
  const override = process.env.INTERACTIVE_DEMO_API_BASE?.trim();
  return (override || value || DEFAULT_API_BASE).replace(/\/+$/, '');
}
