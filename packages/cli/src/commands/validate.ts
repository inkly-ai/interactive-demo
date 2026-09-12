import { existsSync } from 'node:fs';
import { demoThemePresetsById } from '@inkly-org/interactive-demo/themes';
import { brandLogoSourcePath, isAbsoluteBrandRef, loadProject, PROJECT_FILE, validateSlugForPath } from '../project.js';
import { hasLocalAssetBytes, hasRemoteAsset } from '../assets.js';

export interface ValidateOptions {
  cwd: string;
  json?: boolean;
  strict?: boolean;
  silent?: boolean;
}

export interface ValidateIssue {
  level: 'error' | 'warning';
  file: string;
  message: string;
}

export interface ValidateResult {
  ok: boolean;
  projectRoot: string | null;
  errors: number;
  warnings: number;
  issues: ValidateIssue[];
}

function add(
  issues: ValidateIssue[],
  level: ValidateIssue['level'],
  file: string,
  message: string,
): void {
  issues.push({ level, file, message });
}

function collectAssetRefs(value: unknown, refs: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('asset:')) refs.add(value.slice('asset:'.length));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs);
    return;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectAssetRefs(nested, refs);
  }
}

export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  const issues: ValidateIssue[] = [];
  let projectRoot: string | null = null;

  try {
    const loaded = await loadProject(options.cwd);
    projectRoot = loaded.root;

    if (loaded.project.theme && !demoThemePresetsById[loaded.project.theme]) {
      add(
        issues,
        'error',
        PROJECT_FILE,
        `Unknown theme "${loaded.project.theme}". Known themes: ${Object.keys(demoThemePresetsById).join(', ')}.`,
      );
    }

    const brandLogo = loaded.project.brand?.logo?.trim();
    if (brandLogo && !isAbsoluteBrandRef(brandLogo)) {
      const logoPath = brandLogoSourcePath(loaded.root, loaded.project.brand);
      if (!logoPath) {
        add(issues, 'error', PROJECT_FILE, `brand.logo "${brandLogo}" escapes the project root.`);
      } else if (!existsSync(logoPath)) {
        add(issues, 'error', PROJECT_FILE, `brand.logo "${brandLogo}" was not found in the project.`);
      }
    }

    const demoSlugs = new Set(loaded.demos.map((d) => d.slug));
    const idToSlugs = new Map<string, string[]>();
    for (const demo of loaded.demos) {
      const slugError = validateSlugForPath(demo.slug);
      if (slugError) add(issues, 'error', `demos/${demo.slug}`, slugError);
      if (demo.idHealed) {
        add(
          issues,
          'warning',
          `demos/${demo.slug}/demo.config.json`,
          'id is missing or not a 12-character URL-safe id; dev and publish write one, and the published URL is keyed on it.',
        );
      }
      // A demo's `id` is a permanent opaque identity, deliberately
      // independent of its folder slug — so an id ≠ slug is expected, not
      // a warning. What IS a problem is two folders sharing one id
      // (usually a hand-copied folder); `dev` re-mints the newer copy,
      // and we surface the collision here too.
      const slugsForId = idToSlugs.get(demo.config.id);
      if (slugsForId) slugsForId.push(demo.slug);
      else idToSlugs.set(demo.config.id, [demo.slug]);
      if (demo.config.theme?.preset && !demoThemePresetsById[demo.config.theme.preset]) {
        add(
          issues,
          'error',
          `demos/${demo.slug}/demo.config.json`,
          `Unknown demo theme preset "${demo.config.theme.preset}".`,
        );
      }

      const refs = new Set<string>();
      collectAssetRefs(demo.config, refs);
      const assets = new Set((demo.assets?.assets ?? []).map((asset) => asset.id));
      for (const ref of refs) {
        if (!assets.has(ref)) {
          add(
            issues,
            'error',
            `demos/${demo.slug}/demo.config.json`,
            `References asset:${ref}, but demos/${demo.slug}/assets.json has no matching asset id.`,
          );
        }
      }
      for (const asset of demo.assets?.assets ?? []) {
        if (await hasLocalAssetBytes(demo.dir, asset)) continue;
        if (!hasRemoteAsset(asset)) {
          add(
            issues,
            'warning',
            `demos/${demo.slug}/assets.json`,
            `Asset "${asset.id}" has no local file and no absolute URL.`,
          );
        }
      }
    }

    for (const [id, slugs] of idToSlugs) {
      if (slugs.length < 2) continue;
      for (const slug of slugs) {
        add(
          issues,
          'warning',
          `demos/${slug}/demo.config.json`,
          `Duplicate demo id "${id}" shared with ${slugs
            .filter((s) => s !== slug)
            .map((s) => `demos/${s}`)
            .join(', ')}. Run \`interactive-demo dev\` to re-mint.`,
        );
      }
    }

    for (const slug of loaded.project.demos ?? []) {
      // Reserved-slug enforcement: every slug listed in the project file
      // must satisfy the same rules as a demo folder name. This catches the
      // case where hand-edits introduce a reserved slug that no folder backs.
      const slugError = validateSlugForPath(slug);
      if (slugError) {
        add(
          issues,
          'error',
          PROJECT_FILE,
          `demos list references invalid slug "${slug}": ${slugError}`,
        );
        continue;
      }
      if (!demoSlugs.has(slug)) {
        add(issues, 'warning', PROJECT_FILE, `demos list references missing demo "${slug}".`);
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    // A missing/unloadable project is the most common first-run stumble —
    // point at the fix instead of a bare "not found".
    const hint = new RegExp(`${PROJECT_FILE.replace('.', '\\.')}|not (a|inside|in) (an? )?project`, 'i').test(message)
      ? ` — run from a project root (the folder with ${PROJECT_FILE}), or \`interactive-demo dev <folder>\` to preview a lone demo folder.`
      : '';
    add(issues, 'error', 'project', message + hint);
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const result: ValidateResult = {
    ok: errors === 0 && (!options.strict || warnings === 0),
    projectRoot,
    errors,
    warnings,
    issues,
  };

  if (!options.silent) {
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      // Always print the issue text — including warnings on an otherwise
      // passing run, so a second `--json` run is never needed to read them.
      for (const issue of issues) {
        process.stdout.write(`${issue.level.toUpperCase()} ${issue.file}: ${issue.message}\n`);
      }
      const verb = result.ok ? 'passed' : 'failed';
      process.stdout.write(`interactive-demo validate ${verb} (${errors} errors, ${warnings} warnings)\n`);
    }
  }

  return result;
}
