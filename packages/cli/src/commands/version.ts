import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VersionResult {
  version: string;
  packagePath: string | null;
  /**
   * True when the CLI is running from a source checkout (the package still has
   * its `src/` next to `dist/`) rather than an installed npm tarball, which
   * ships only `dist`/`README`.
   */
  isLocalBuild: boolean;
}

export async function readCliVersion(): Promise<VersionResult> {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, 'package.json');
    try {
      const parsed = JSON.parse(await readFile(candidate, 'utf8')) as { version?: unknown };
      if (typeof parsed.version === 'string') {
        const isLocalBuild = existsSync(join(dirname(candidate), 'src'));
        return { version: parsed.version, packagePath: candidate, isLocalBuild };
      }
    } catch {
      // keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { version: '0.0.0-unknown', packagePath: null, isLocalBuild: false };
}

export async function runVersion(options: { silent?: boolean } = {}): Promise<VersionResult> {
  const result = await readCliVersion();
  if (!options.silent) {
    const suffix = result.isLocalBuild ? ' (local build)' : '';
    process.stdout.write(`${result.version}${suffix}\n`);
  }
  return result;
}
