import { existsSync } from 'node:fs';
import { demoThemePresetsById } from '@inkly-org/interactive-demo/themes';
import { brandLogoSourcePath, isAbsoluteBrandRef, loadProject, PROJECT_FILE, validateSlugForPath } from '../project.js';
import { collectMediaPaths, mapMediaRefs } from '../media.js';
import { resolve, sep } from 'node:path';

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

      // Every relative media path must be a file inside the demo folder.
      const root = resolve(demo.dir);
      for (const path of collectMediaPaths(demo.config)) {
        const abs = resolve(root, path);
        if (abs !== root && !abs.startsWith(root + sep)) {
          add(issues, 'error', `demos/${demo.slug}/demo.config.json`, `References ${path}, which escapes the demo folder.`);
        } else if (!existsSync(abs)) {
          add(
            issues,
            'error',
            `demos/${demo.slug}/demo.config.json`,
            `References ${path}, but demos/${demo.slug}/${path} does not exist.`,
          );
        }
      }
      // The pre-release pointer form is no longer resolved by anything.
      mapMediaRefs(demo.config, (value) => {
        if (value.startsWith('asset:')) {
          add(
            issues,
            'error',
            `demos/${demo.slug}/demo.config.json`,
            `References ${value}: asset pointers are not supported; use a path under assets/ or an absolute URL.`,
          );
        }
        return value;
      });
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
