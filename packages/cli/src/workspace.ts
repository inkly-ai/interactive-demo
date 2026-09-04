import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

export type DemoFiles = Record<string, string>;

/**
 * The file surface the editor works against. Paths are forward-slash and
 * relative to the demo folder (`demo.config.json`, `assets.json`,
 * `assets/<file>`). The dev server backs this with the local filesystem.
 */
export interface WorkspaceProvider {
  /** All file paths under the demo folder. */
  listFiles(demoDir: string): Promise<string[]>;
  /** Text content, or `null` when the file does not exist. */
  readFile(demoDir: string, path: string): Promise<string | null>;
  /** Create or replace a file. Parent folders are created as needed. */
  writeFile(demoDir: string, path: string, content: string | Buffer): Promise<void>;
  /** Remove a file. Missing files are not an error. */
  deleteFile(demoDir: string, path: string): Promise<void>;
}

/** Resolve `path` inside `demoDir`, refusing anything that escapes it. */
export function resolveInsideDemo(demoDir: string, path: string): string {
  const root = resolve(demoDir);
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Path escapes the demo folder: ${path}`);
  }
  return target;
}

export class LocalFsWorkspace implements WorkspaceProvider {
  async listFiles(demoDir: string): Promise<string[]> {
    const root = resolve(demoDir);
    const out: string[] = [];
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          await walk(abs);
        } else if (entry.isFile()) {
          out.push(relative(root, abs).split(sep).join('/'));
        }
      }
    }
    await walk(root);
    return out.sort();
  }

  async readFile(demoDir: string, path: string): Promise<string | null> {
    try {
      return await readFile(resolveInsideDemo(demoDir, path), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async writeFile(demoDir: string, path: string, content: string | Buffer): Promise<void> {
    const target = resolveInsideDemo(demoDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  async deleteFile(demoDir: string, path: string): Promise<void> {
    await rm(resolveInsideDemo(demoDir, path), { force: true });
  }
}
