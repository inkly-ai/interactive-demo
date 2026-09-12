import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  AssetsManifestSchema,
  BrandSchema,
  ThemeTokensSchema,
  healDemoConfig,
  RESERVED_DEMO_SLUGS,
  validateDemoSlug,
  type AssetsManifest,
  type Demo,
} from '@inkly-org/interactive-demo/schema';

/** File name of the project config at the project root. */
export const PROJECT_FILE = 'interactive-demo.json';

/**
 * Top-level `interactive-demo.json`. One per project; lives at the project
 * root alongside the `demos/` folder.
 *
 * - `demos` optionally orders the demos listed by `dev` and written by
 *   `build`. Demos are discovered by walking `demos/`; a slug listed here
 *   that has no folder is reported by `validate`.
 * - `theme` is the preset id every demo inherits unless it sets
 *   `theme.preset` itself.
 * - `tokens` overrides the preset's token defaults (primary, secondary,
 *   font, radius). Demos may override these further.
 *
 * @example
 * ```json
 * {
 *   "name": "Acme demos",
 *   "theme": "default",
 *   "tokens": { "primary": "#5b3df5" },
 *   "demos": ["onboarding", "billing"]
 * }
 * ```
 */
/**
 * Project-level brand shown in the page header above every demo: a logo
 * (absolute URL or a path relative to the project root), the brand name,
 * where the mark links to, and up to two call-to-action buttons. Same shape
 * as the runtime's brand schema minus the hosted-only fields.
 */
export const ProjectBrandSchema = BrandSchema.pick({
  logo: true,
  name: true,
  logoHref: true,
  cta: true,
  secondaryCta: true,
});

export type ProjectBrand = z.infer<typeof ProjectBrandSchema>;

export const ProjectSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  demos: z.array(z.string().min(1)).optional(),
  theme: z.string().min(1).optional(),
  tokens: ThemeTokensSchema.optional(),
  brand: ProjectBrandSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectSchema>;

/** True for `https://…`, `//…`, `data:…`, `#…` — anything that is not a project path. */
export function isAbsoluteBrandRef(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(value.trim());
}

/**
 * Absolute path of a project-relative brand logo, or null when the logo is
 * absent or an absolute URL. Paths that escape the project root are refused.
 */
export function brandLogoSourcePath(root: string, brand: ProjectBrand | null | undefined): string | null {
  const logo = brand?.logo?.trim();
  if (!logo || isAbsoluteBrandRef(logo)) return null;
  const abs = resolve(root, logo.replace(/^\.\/+/, ''));
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) return null;
  return abs;
}

export function parseProjectConfig(input: unknown): ProjectConfig {
  return ProjectSchema.parse(input);
}

export interface LoadedDemoConfig {
  slug: string;
  dir: string;
  configPath: string;
  config: Demo;
  /** True when the file had no valid `id` and `config.id` was minted in memory. */
  idHealed: boolean;
  assetsPath: string;
  assets: AssetsManifest | null;
}

export interface LoadedProject {
  root: string;
  projectPath: string;
  project: ProjectConfig;
  demos: LoadedDemoConfig[];
}

export async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Walk upward from `start` looking for the first directory containing the project file. */
export async function findProjectRoot(start: string): Promise<string | null> {
  let current = resolve(start);
  while (true) {
    if (await pathExists(join(current, PROJECT_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Walk `<root>/demos` recursively. Each `demo.config.json` found defines a
 * demo whose slug is the directory path under `demos/`, joined with `/`.
 * Most demos are flat single-segment slugs but the walk does not crash on
 * nested folders.
 */
export async function discoverDemoConfigPaths(
  projectRoot: string,
): Promise<Array<{ slug: string; dir: string; configPath: string }>> {
  const demosRoot = join(projectRoot, 'demos');
  if (!(await pathExists(demosRoot))) return [];
  const out: Array<{ slug: string; dir: string; configPath: string }> = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === 'demo.config.json')) {
      const slug = dir === demosRoot
        ? ''
        : dir.slice(demosRoot.length + 1).split(sep).join('/');
      out.push({ slug, dir, configPath: join(dir, 'demo.config.json') });
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
    }
  }

  await walk(demosRoot);
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export async function loadProject(cwd: string): Promise<LoadedProject> {
  const root = await findProjectRoot(cwd);
  if (!root) {
    throw new Error(`No ${PROJECT_FILE} found in ${cwd} or any parent directory.`);
  }

  const projectPath = join(root, PROJECT_FILE);
  const projectResult = ProjectSchema.safeParse(await readJsonFile(projectPath));
  if (!projectResult.success) {
    throw new Error(`${PROJECT_FILE} failed schema validation: ${projectResult.error.message}`);
  }

  const demos: LoadedDemoConfig[] = [];
  for (const d of await discoverDemoConfigPaths(root)) {
    // Heal-before-parse: an id-less (or slug-shaped-id) config is minted an
    // id in-memory instead of throwing. `loadProject` is a read-only path
    // (validate) so the mint is not persisted here — `dev` owns the
    // write-back pass.
    let config: Demo;
    let idHealed = false;
    try {
      const healed = healDemoConfig(await readJsonFile(d.configPath));
      config = healed.config;
      idHealed = healed.changed;
    } catch (err) {
      throw new Error(
        `demos/${d.slug}/demo.config.json failed schema validation: ${(err as Error).message}`,
      );
    }
    const assetsPath = join(d.dir, 'assets.json');
    let assets: AssetsManifest | null = null;
    if (await pathExists(assetsPath)) {
      const assetsResult = AssetsManifestSchema.safeParse(await readJsonFile(assetsPath));
      if (!assetsResult.success) {
        throw new Error(
          `demos/${d.slug}/assets.json failed schema validation: ${assetsResult.error.message}`,
        );
      }
      assets = assetsResult.data;
    }
    demos.push({
      slug: d.slug,
      dir: d.dir,
      configPath: d.configPath,
      config,
      idHealed,
      assetsPath,
      assets,
    });
  }

  return { root, projectPath, project: projectResult.data, demos };
}

/**
 * Order demos the way the project file lists them (listed demos first, in
 * that order; unlisted demos after, alphabetically).
 */
export function orderDemos<T extends { slug: string }>(
  demos: readonly T[],
  project: Pick<ProjectConfig, 'demos'>,
): T[] {
  const listed = project.demos ?? [];
  const rank = new Map(listed.map((slug, index) => [slug, index]));
  return [...demos].sort((a, b) => {
    const ra = rank.get(a.slug);
    const rb = rank.get(b.slug);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.slug.localeCompare(b.slug);
  });
}

export function validateSlugForPath(slug: string): string | null {
  const first = slug.split('/')[0] ?? slug;
  const checked = validateDemoSlug(first);
  if (!checked.ok) return checked.reason;
  if ((RESERVED_DEMO_SLUGS as readonly string[]).includes(slug)) {
    return `Demo folder "${slug}" uses a reserved slug.`;
  }
  return null;
}

export async function fileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}
