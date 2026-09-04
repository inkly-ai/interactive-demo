import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  DemoSchema,
  generateDemoId,
  isValidDemoId,
  validateDemoSlug,
} from '@inkly-org/interactive-demo/schema';
import { demoThemePresetsById } from '@inkly-org/interactive-demo/themes';
import { atomicWriteFile } from '../fs-atomic.js';
import {
  findProjectRoot,
  PROJECT_FILE,
  ProjectSchema,
  type ProjectConfig,
} from '../project.js';
import { getProjectSkeleton, starterDemoFiles, titleFromSlug } from '../starter.js';

export interface InitOptions {
  name: string;
  cwd: string;
  /** Optional theme preset id written to the project file. */
  theme?: string;
  /** Suppress the "next steps" stdout block. Used by tests. */
  silent?: boolean;
  /** Scaffold an EMPTY project: no `getting-started` starter demo. */
  noStarterDemo?: boolean;
}

export interface InitResult {
  dir: string;
  files: string[];
}

/**
 * Convert a forward-slash skeleton path to the host OS separator so
 * `writeFile` lands in the right place on Windows.
 */
function toLocalPath(p: string): string {
  return sep === '/' ? p : p.split('/').join(sep);
}

function checkTheme(theme: string | undefined): void {
  if (theme === undefined) return;
  if (theme.length === 0) {
    throw new Error('Invalid theme. Expected a theme preset id.');
  }
  if (!demoThemePresetsById[theme]) {
    const known = Object.keys(demoThemePresetsById).join(', ');
    throw new Error(`Invalid theme "${theme}". Expected one of: ${known}.`);
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const { name, cwd, theme, silent } = options;

  const slugCheck = validateDemoSlug(name);
  if (!slugCheck.ok) {
    throw new Error(slugCheck.reason);
  }
  checkTheme(theme);

  const dir = resolve(cwd, name);

  const exists = await access(dir).then(
    () => true,
    () => false,
  );
  if (exists) {
    throw new Error(
      `Directory already exists: ${dir}. Refusing to overwrite — choose a different name or remove it first.`,
    );
  }

  const files = getProjectSkeleton({ name, theme, noStarterDemo: options.noStarterDemo });

  await mkdir(dir, { recursive: true });
  await Promise.all(
    files.map(async (file) => {
      const localPath = toLocalPath(file.path);
      const full = join(dir, localPath);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, file.contents, 'utf8');
    }),
  );

  if (!silent) {
    const next = options.noStarterDemo
      ? `Next steps:\n  cd ${name}\n  interactive-demo init --demo <slug>\n  interactive-demo dev`
      : `Next steps:\n  cd ${name}\n  interactive-demo dev\n  open http://localhost:3000`;
    process.stdout.write(
      `Scaffolded ${options.noStarterDemo ? 'empty project' : 'project'} ${name} at ${dir}\n\n${next}\n`,
    );
  }

  return { dir, files: files.map((f) => toLocalPath(f.path)) };
}

export interface AddDemoOptions {
  slug: string;
  cwd: string;
  /**
   * Import an existing demo folder (one with a `demo.config.json`, e.g. a
   * capture export) into the project at `demos/<slug>/`, instead of
   * scaffolding a fresh starter demo. The folder is copied wholesale (config,
   * assets.json, assets/ bytes); its opaque id is kept when valid.
   */
  from?: string;
  /** Suppress stdout. Used by tests. */
  silent?: boolean;
}

export interface AddDemoResult {
  projectRoot: string;
  demoDir: string;
  /** True when the slug was appended to the project file's `demos` list. */
  registered: boolean;
  /** The opaque demo id in the new demo.config.json. */
  id: string;
}

/** `init --demo <slug>`: scaffold or import a demo into the current project. */
export async function runAddDemo(options: AddDemoOptions): Promise<AddDemoResult> {
  const { slug, cwd, from, silent } = options;

  const projectRoot = await findProjectRoot(cwd);
  if (!projectRoot) {
    throw new Error(`Not inside a project. Run \`interactive-demo init <name>\` first.`);
  }

  // Validate slug FIRST so reserved-slug messages surface verbatim even
  // when the existing project config happens to be malformed.
  const slugCheck = validateDemoSlug(slug);
  if (!slugCheck.ok) {
    throw new Error(slugCheck.reason);
  }

  const projectPath = join(projectRoot, PROJECT_FILE);
  const raw = await readFile(projectPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${PROJECT_FILE}: ${(err as Error).message}`);
  }
  const projectResult = ProjectSchema.safeParse(parsed);
  if (!projectResult.success) {
    throw new Error(
      `Invalid ${PROJECT_FILE}: ${projectResult.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const project: ProjectConfig = projectResult.data;

  const demoDir = join(projectRoot, 'demos', slug);
  const exists = await access(demoDir).then(
    () => true,
    () => false,
  );
  if (exists) {
    throw new Error(
      `Demo already exists: demos/${slug}. Choose a different slug or remove it first.`,
    );
  }

  // Register the slug in the project's `demos` list when the project keeps
  // one, so the new demo is ordered with the others.
  let registered = false;
  let updatedProject = project;
  if (Array.isArray(project.demos) && !project.demos.includes(slug)) {
    updatedProject = { ...project, demos: [...project.demos, slug] };
    registered = true;
  }

  // Either import an existing demo folder, or scaffold a fresh starter.
  let id: string;
  if (from) {
    id = await importDemoFolder(resolve(cwd, from), demoDir);
  } else {
    id = await scaffoldDemoFolder(slug, demoDir);
  }

  if (registered) {
    await atomicWriteFile(projectPath, JSON.stringify(updatedProject, null, 2) + '\n');
  }

  if (!silent) {
    let msg = `${from ? 'Imported' : 'Added'} ${demoDir}\n`;
    msg += `  id: ${id}\n`;
    if (registered) msg += `Added to the demos list in ${PROJECT_FILE}\n`;
    msg += from
      ? `Next: interactive-demo dev\n`
      : `Replace the placeholder shot in demos/${slug}/assets/, then preview with \`interactive-demo dev\`.\n`;
    process.stdout.write(msg);
  }

  return { projectRoot, demoDir, registered, id };
}

/**
 * Scaffold a fresh starter demo into `destDir`. The starter mints a fresh
 * opaque id, which we read back off the validated config and return.
 */
async function scaffoldDemoFolder(slug: string, destDir: string): Promise<string> {
  const { files, id } = starterDemoFiles(slug, titleFromSlug(slug));
  for (const file of files) {
    await atomicWriteFile(join(destDir, toLocalPath(file.path)), file.contents);
  }
  return id;
}

/**
 * Copy an existing demo folder into the project at `destDir`. The source must
 * hold a schema-valid `demo.config.json`; everything beside it (assets.json,
 * assets/ bytes) is copied so the demo is self-contained. The demo's opaque id
 * is preserved when valid and re-minted otherwise.
 */
async function importDemoFolder(srcDir: string, destDir: string): Promise<string> {
  const srcConfigPath = join(srcDir, 'demo.config.json');
  let raw: string;
  try {
    raw = await readFile(srcConfigPath, 'utf8');
  } catch {
    throw new Error(`No demo.config.json found in ${srcDir} — that is not a demo folder.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${srcConfigPath}: ${(err as Error).message}`);
  }

  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  let id = typeof record.id === 'string' ? record.id : '';
  let config: unknown = parsed;
  let rewriteConfig = false;
  if (!isValidDemoId(id)) {
    id = generateDemoId();
    config = { ...record, id };
    rewriteConfig = true;
  }

  const validated = DemoSchema.safeParse(config);
  if (!validated.success) {
    throw new Error(
      `${srcConfigPath} is not a valid demo: ${validated.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
    );
  }

  await cp(srcDir, destDir, {
    recursive: true,
    filter: (source) => {
      const name = basename(source);
      return name !== 'node_modules' && name !== '.git';
    },
  });
  if (rewriteConfig) {
    await atomicWriteFile(
      join(destDir, 'demo.config.json'),
      JSON.stringify(config, null, 2) + '\n',
    );
  }
  return id;
}
