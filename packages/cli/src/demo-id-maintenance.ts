import { readFile, stat } from 'node:fs/promises';
import { relative } from 'node:path';
import { healDemoConfig, resolveDuplicateDemoIds } from '@inkly-org/interactive-demo/schema';
import { discoverDemoConfigPaths, findProjectRoot, PROJECT_FILE } from './project.js';
import { atomicWriteFile } from './fs-atomic.js';

/**
 * Demo-identity maintenance: backfill missing ids and de-duplicate ids that
 * two folders share (the usual cause is a hand-copied demo folder that
 * carried its source's `id`).
 *
 * Run by `dev` at startup so the working tree is fixed before serving. Every
 * demo folder must carry a permanent opaque `id` in its `demo.config.json`;
 * ids are minted client-side, offline.
 *
 * "Updated time" for de-duplication is the config file's filesystem mtime:
 * on a duplicate id the NEWER copy is re-minted, the oldest keeps the id.
 * The pass writes its fixes to disk and returns a structured summary for
 * the caller to log.
 */

export interface DemoIdFix {
  /** Demo slug (folder path under `demos/`, `/`-joined). */
  slug: string;
  /** Absolute path to the rewritten `demo.config.json`. */
  configPath: string;
  /**
   * `heal` — a missing/invalid id was minted in place.
   * `remint` — a duplicate id was re-minted because an older copy owns it.
   */
  reason: 'heal' | 'remint';
}

export interface DemoIdMaintenanceResult {
  /** Project root that was scanned. */
  projectRoot: string;
  /** Fixes that healed a missing or malformed id. */
  healed: DemoIdFix[];
  /** Fixes that re-minted a duplicate id on the newer copy. */
  reminted: DemoIdFix[];
  /**
   * Demos whose `demo.config.json` could not be read, parsed, or
   * strict-validated (heal only mints the id; any other schema violation
   * still throws). These are skipped rather than crashing the pass so a
   * single bad config never blocks `dev` from starting.
   */
  skipped: Array<{ slug: string; configPath: string; message: string }>;
}

interface ScannedDemo {
  slug: string;
  configPath: string;
  id: string;
  mtimeMs: number;
}

/**
 * Run the heal + de-duplicate pass over every demo in the working tree and
 * persist the fixes. Pure of any logging — callers format the returned
 * summary however they like.
 */
export async function runDemoIdMaintenance(
  cwd: string,
): Promise<DemoIdMaintenanceResult> {
  const projectRoot = await findProjectRoot(cwd);
  if (!projectRoot) {
    throw new Error(
      `No ${PROJECT_FILE} found in ${cwd} or any parent directory. Run \`interactive-demo init <name>\` first or cd into your project.`,
    );
  }

  const healed: DemoIdFix[] = [];
  const reminted: DemoIdFix[] = [];
  const skipped: DemoIdMaintenanceResult['skipped'] = [];
  const scanned: ScannedDemo[] = [];

  // Pass 1 — heal missing/invalid ids in place.
  for (const demo of await discoverDemoConfigPaths(projectRoot)) {
    let raw: string;
    try {
      raw = await readFile(demo.configPath, 'utf8');
    } catch (err) {
      skipped.push({
        slug: demo.slug,
        configPath: demo.configPath,
        message: `failed to read demo.config.json (${(err as Error).message})`,
      });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      skipped.push({
        slug: demo.slug,
        configPath: demo.configPath,
        message: `demo.config.json is not valid JSON (${(err as Error).message})`,
      });
      continue;
    }

    let result: { config: { id: string }; changed: boolean };
    try {
      result = healDemoConfig(parsed);
    } catch (err) {
      // heal mints only the id; any other schema violation still throws.
      skipped.push({
        slug: demo.slug,
        configPath: demo.configPath,
        message: `demo.config.json failed schema validation: ${(err as Error).message}`,
      });
      continue;
    }

    if (result.changed) {
      // Patch only the id into the file as the author wrote it (same as the
      // remint pass below): writing the parsed config would expand every
      // default and reorder keys, turning a one-line heal into a full rewrite.
      const patched = { ...(parsed as Record<string, unknown>), id: result.config.id };
      await writeConfig(demo.configPath, patched);
      healed.push({ slug: demo.slug, configPath: demo.configPath, reason: 'heal' });
    }

    // mtime is read after the heal write so a freshly-healed config still
    // carries a sensible "updated time" for the de-duplication pass.
    const mtimeMs = (await stat(demo.configPath)).mtimeMs;
    scanned.push({
      slug: demo.slug,
      configPath: demo.configPath,
      id: result.config.id,
      mtimeMs,
    });
  }

  // Pass 2 — de-duplicate ids. "Updated time" = config file mtime; the
  // oldest copy keeps the id, every newer duplicate is re-minted.
  const duplicates = resolveDuplicateDemoIds(
    scanned.map((d) => ({ ...d, updatedAt: d.mtimeMs })),
  );
  for (const { entry, newId } of duplicates) {
    const raw = await readFile(entry.configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    config.id = newId;
    await writeConfig(entry.configPath, config);
    reminted.push({
      slug: entry.slug,
      configPath: entry.configPath,
      reason: 'remint',
    });
  }

  return { projectRoot, healed, reminted, skipped };
}

/** Path relative to the project root, with forward slashes, for logging. */
export function relForLog(projectRoot: string, configPath: string): string {
  return relative(projectRoot, configPath).split(/[\\/]/).join('/');
}

/** Pretty-print + trailing newline — matches every other config write. */
async function writeConfig(configPath: string, config: unknown): Promise<void> {
  await atomicWriteFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Persist a minted id into a demo.config.json, touching nothing else in the
 * file. Used by `publish` when the loaded config had no valid id: the
 * published URL is keyed on the id, so it must be on disk before the first
 * publish or every later publish would mint a different one.
 */
export async function persistDemoId(configPath: string, id: string): Promise<void> {
  const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  await writeConfig(configPath, { ...raw, id });
}
