import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface DemoLike {
  title?: unknown;
}

/**
 * Display name for a bare demo folder served without a project file: the
 * demo's title when it has one, else the fallback (its folder slug).
 */
export async function standaloneDemoName(demoDir: string, fallbackName: string): Promise<string> {
  let config: DemoLike = {};
  try {
    config = JSON.parse(await readFile(join(demoDir, 'demo.config.json'), 'utf8')) as DemoLike;
  } catch {
    // Keep the bare-demo fallback usable even when later schema validation
    // will be the thing that reports a malformed config.
  }
  return typeof config.title === 'string' && config.title.trim()
    ? config.title.trim()
    : fallbackName;
}
