import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { atomicWriteFile } from './fs-atomic.js';

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

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/**
 * Like {@link resolveInsideDemo}, but also follows the filesystem: the
 * nearest existing ancestor of the target must resolve (through any
 * symlinked folders) to a location inside the real demo folder, and the
 * target itself may not be a symlink. Without this a link planted inside
 * the demo folder would let an editor write land anywhere on disk.
 */
export async function resolveInsideDemoOnDisk(demoDir: string, path: string): Promise<string> {
  const target = resolveInsideDemo(demoDir, path);
  const root = await realpath(resolve(demoDir));
  let ancestor = dirname(target);
  let real: string | null = null;
  while (real == null) {
    try {
      real = await realpath(ancestor);
    } catch {
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error(`Path escapes the demo folder: ${path}`);
      ancestor = parent;
    }
  }
  const realTarget = join(real, relative(ancestor, target));
  if (!isInside(root, realTarget)) {
    throw new Error(`Path escapes the demo folder: ${path}`);
  }
  try {
    if ((await lstat(target)).isSymbolicLink()) {
      throw new Error(`Path is a symbolic link: ${path}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
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
      return await readFile(await resolveInsideDemoOnDisk(demoDir, path), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async writeFile(demoDir: string, path: string, content: string | Buffer): Promise<void> {
    await atomicWriteFile(await resolveInsideDemoOnDisk(demoDir, path), content);
  }

  async deleteFile(demoDir: string, path: string): Promise<void> {
    await rm(await resolveInsideDemoOnDisk(demoDir, path), { force: true });
  }
}
