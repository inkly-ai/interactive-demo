import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write `data` to `path` atomically: write to a temp sibling, then rename over
 * the target. A rename on the same filesystem is atomic, so a reader (or a
 * crash) never observes a half-written file — the path either holds the old
 * contents or the new contents, never a truncated mix. Use this for every
 * demo-facing JSON write so a ^C mid-write can't corrupt config on disk.
 *
 * `mode`, when given, is applied to the temp file before the rename so the
 * final file lands with the intended permissions without a window where it
 * is world-readable.
 */
export async function atomicWriteFile(
  path: string,
  data: string | Buffer,
  options?: { mode?: number },
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, data, options?.mode != null ? { mode: options.mode } : undefined);
  await rename(tmp, path);
}
