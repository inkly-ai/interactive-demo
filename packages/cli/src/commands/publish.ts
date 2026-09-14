import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AssetsManifest, Demo } from '@inkly-org/interactive-demo/schema';
import { collectMediaPaths, mapMediaRefs } from '../media.js';
import { normalizeApiBase, readConfig } from '../publish/config.js';
import { fetchDeploymentStatus } from '../publish/previews-api.js';
import {
  planDemoMedia,
  uploadSyncAssets,
  type SyncAssetPlan,
  type SyncFinalizedUpload,
} from '../publish/sync.js';
import { resolveRuntimeFile } from '../page.js';
import { isAbsoluteBrandRef, type ProjectBrand } from '../project.js';
import { persistDemoId } from '../demo-id-maintenance.js';
import { readCliVersion } from './version.js';
import {
  loadProject,
  orderDemos,
  type LoadedDemoConfig,
  type LoadedProject,
} from '../project.js';

export interface PublishOptions {
  cwd: string;
  /** Positional path to a demo folder (e.g. `demos/intro`) or a slug. */
  path?: string;
  /** Select a demo by slug instead of by path. */
  demo?: string;
  json?: boolean;
  silent?: boolean;
  /**
   * Mint a NEW deployment (a new /p/<id> URL) instead of updating the demo's
   * latest deployment in place. By default `publish` replaces, so an embed
   * pointing at the demo keeps working.
   */
  new?: boolean;
}

export interface PublishResult {
  projectRoot: string;
  slug: string;
  id: string;
  url: string;
}

export interface PublishListOptions {
  cwd: string;
  json?: boolean;
  silent?: boolean;
}

export interface PublishListEntry {
  slug: string;
  demoId: string | null;
  deployed: boolean;
  url: string | null;
}

function out(silent: boolean | undefined, message: string): void {
  if (!silent) process.stdout.write(message);
}

export function selectDemo(
  project: LoadedProject,
  options: Pick<PublishOptions, 'cwd' | 'path' | 'demo'>,
): LoadedDemoConfig {
  if (options.demo) {
    const demo = project.demos.find((d) => d.slug === options.demo);
    if (!demo) throw new Error(`No such demo: ${options.demo}`);
    return demo;
  }
  if (options.path) {
    const target = resolve(options.cwd, options.path);
    const demo = project.demos.find((d) => resolve(d.dir) === target);
    if (demo) return demo;
    // Fall back to treating the path's trailing segment as a slug.
    const bySlug = project.demos.find(
      (d) => d.slug === options.path || d.slug === options.path?.replace(/^demos\//, ''),
    );
    if (bySlug) return bySlug;
    throw new Error(
      `No demo found at "${options.path}". Available demos: ${
        project.demos.map((d) => d.slug).join(', ') || '(none)'
      }`,
    );
  }
  if (project.demos.length === 1) return project.demos[0]!;
  throw new Error(
    `This project has ${project.demos.length} demos — pass a demo path or --demo <slug>. ` +
      `Available: ${project.demos.map((d) => d.slug).join(', ')}`,
  );
}

/**
 * Freeze a demo for the hosting service: every relative media path in the
 * config becomes the absolute URL its bytes were uploaded to, and the
 * manifest the API expects is generated from the same uploads. Nothing on
 * disk changes.
 */
function freezeDemo(
  config: Demo,
  plans: SyncAssetPlan[],
  uploads: SyncFinalizedUpload[],
): { config: Demo; assets: AssetsManifest } {
  const uploadBySha = new Map(uploads.map((upload) => [upload.sha256, upload]));
  // Several paths can share one hash; map every referenced path to its upload.
  const shaByPath = new Map<string, string>();
  for (const path of collectMediaPaths(config)) {
    const plan = plans.find((p) => p.id === path) ?? null;
    if (plan) shaByPath.set(path, plan.sha256);
  }
  const frozen = mapMediaRefs(config, (value) => {
    const key = value.replace(/^\.\//, '');
    const sha = shaByPath.get(key);
    const upload = sha ? uploadBySha.get(sha) : undefined;
    return upload ? upload.publicUrl : value;
  });
  const assets: AssetsManifest = {
    version: 1,
    assets: plans.map((plan) => {
      const upload = uploadBySha.get(plan.sha256);
      return {
        id: plan.id,
        sha256: plan.sha256,
        kind: plan.contentType.startsWith('video/') ? 'video' : plan.contentType.startsWith('audio/') ? 'audio' : 'image',
        contentType: plan.contentType,
        size: plan.size,
        file: plan.file,
        ...(upload ? { publicUrl: upload.publicUrl } : {}),
      };
    }),
  };
  return { config: frozen, assets };
}

/**
 * The player version the hosted page renders with. The server pins each
 * deployment to it. Read from the runtime package installed next to the CLI
 * (the same one `build` copies), falling back to the CLI's own version.
 */
async function resolveRuntimeVersion(cwd: string): Promise<string> {
  const playerPath = resolveRuntimeFile('player.js', cwd);
  if (playerPath) {
    try {
      const raw = await readFile(join(dirname(playerPath), '..', 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version) return parsed.version;
    } catch {
      // fall through
    }
  }
  return (await readCliVersion()).version;
}

/**
 * The brand the hosting service can render. A project-relative logo is a
 * file next to the project that `publish` does not upload, so the hosted
 * page would show a broken image where `build` copies the file; drop it
 * and say so. Absolute URLs pass through unchanged.
 */
function hostedBrand(brand: ProjectBrand | undefined, silent: boolean | undefined): ProjectBrand | undefined {
  const logo = brand?.logo?.trim();
  if (!brand || !logo || isAbsoluteBrandRef(logo)) return brand;
  if (!silent) {
    process.stderr.write(
      `⚠ brand.logo "${logo}" is a project file, which publish does not upload;\n` +
        `  the hosted page will show the brand without it. Use an absolute URL\n` +
        `  (https://…) in interactive-demo.json to show a logo there.\n`,
    );
  }
  const { logo: _dropped, ...rest } = brand;
  return rest;
}

/** The project-level context the hosting service stores next to the demo. */
async function projectContext(project: LoadedProject, cwd: string, silent: boolean | undefined) {
  const brand = hostedBrand(project.project.brand, silent);
  return {
    name: project.project.name,
    runtime: await resolveRuntimeVersion(cwd),
    ...(project.project.theme ? { theme: project.project.theme } : {}),
    ...(project.project.tokens ? { tokens: project.project.tokens } : {}),
    ...(brand ? { brand } : {}),
  };
}

export async function runPublish(
  options: PublishOptions,
): Promise<PublishResult> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error('Not logged in. Run `interactive-demo login` first.');
  }
  const apiBase = normalizeApiBase(config.apiBase);

  const project = await loadProject(options.cwd);
  const demo = selectDemo(project, options);
  return publishResolvedDemo({ project, demo, options, apiBase, token: config.token });
}

async function publishResolvedDemo(args: {
  project: LoadedProject;
  demo: LoadedDemoConfig;
  options: PublishOptions;
  apiBase: string;
  token: string;
}): Promise<PublishResult> {
  const { project, demo, options, apiBase, token } = args;
  if (demo.idHealed) {
    // The id was minted in memory while loading. Write it to disk first: the
    // hosted URL is keyed on it, and a later publish must find the same id
    // to update the deployment in place rather than mint a new one.
    await persistDemoId(demo.configPath, demo.config.id);
    out(
      options.silent,
      `Wrote id ${demo.config.id} to demos/${demo.slug}/demo.config.json (it had none); commit it.\n`,
    );
  }
  const demoId = demo.config.id || null;
  const replace = !options.new;

  // A `--new` re-publish mints a NEW /p/<id>, so any embed pointing at the
  // previous deployment keeps serving the old version. Check up front whether
  // this demo was already deployed, so we can warn afterward.
  let hadPriorDeployment = false;
  if (!replace && !options.silent && !options.json && demoId) {
    try {
      hadPriorDeployment = (
        await fetchDeploymentStatus({ apiBase, token, demoId })
      ).deployed;
    } catch {
      // Non-fatal: the nudge is a convenience, never block publishing on it.
    }
  }

  // Ensure every referenced file is on the server's storage before freezing —
  // the hosted demo is served from there, which cannot see the demo folder.
  const plan = await planDemoMedia(demo);
  if (plan.unresolved.length > 0) {
    throw new Error(
      `${plan.unresolved.length} media file(s) the config references have no local bytes, ` +
        `so the demo cannot be published:\n` +
        plan.unresolved.map((a) => `  - ${a.id}`).join('\n'),
    );
  }
  let uploads: SyncFinalizedUpload[] = [];
  if (plan.assets.length > 0) {
    out(options.silent, `Uploading ${plan.assets.length} media file(s)...\n`);
    uploads = (await uploadSyncAssets({
      apiBase,
      token,
      assets: plan.assets,
    })).uploads;
  }

  const frozen = freezeDemo(demo.config, plan.assets, uploads);

  const res = await fetch(`${apiBase}/api/previews`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      demoSlug: demo.slug,
      title: demo.config.title ?? null,
      config: frozen.config,
      assets: frozen.assets,
      hub: await projectContext(project, options.cwd, options.silent),
      replace,
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { id?: string; url?: string; path?: string; replaced?: boolean; error?: string }
    | null;
  if (!res.ok || !json?.id) {
    throw new Error(json?.error ?? `Publish failed: HTTP ${res.status}`);
  }
  const url = json.url ?? `${apiBase}${json.path ?? `/p/${json.id}`}`;

  const result: PublishResult = {
    projectRoot: project.root,
    slug: demo.slug,
    id: json.id,
    url,
  };
  if (options.json) {
    out(options.silent, JSON.stringify(result, null, 2) + '\n');
  } else {
    out(
      options.silent,
      json.replaced
        ? `Demo updated in place:\n  ${url}\n`
        : `Demo published:\n  ${url}\n`,
    );
    if (hadPriorDeployment && !json.replaced) {
      out(
        options.silent,
        `\n⚠ This published a NEW deployment. Your previous one still serves\n` +
          `  the old version — embeds pointing at it won't update. Publish\n` +
          `  without --new to update the existing deployment in place instead.\n`,
      );
    }
    out(options.silent, `\nEmbed it with\n${formatIframeSnippet(url)}\n\nFor a pop-up button instead: interactive-demo embed --mode popup\n`);
  }
  return result;
}

export function formatIframeSnippet(url: string): string {
  return `  <iframe src="${url}" width="960" height="600" allow="fullscreen" loading="lazy"></iframe>`;
}

/**
 * `publish --list`: the live deployment URL of every demo in the project,
 * resolved by each demo's stable id.
 */
export async function runPublishList(options: PublishListOptions): Promise<PublishListEntry[]> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error('Not logged in. Run `interactive-demo login` first.');
  }
  const apiBase = normalizeApiBase(config.apiBase);
  const project = await loadProject(options.cwd);

  const entries: PublishListEntry[] = [];
  for (const demo of orderDemos(project.demos, project.project)) {
    const demoId = demo.config.id || null;
    if (!demoId) {
      entries.push({ slug: demo.slug, demoId: null, deployed: false, url: null });
      continue;
    }
    const status = await fetchDeploymentStatus({ apiBase, token: config.token, demoId });
    entries.push({
      slug: demo.slug,
      demoId,
      deployed: status.deployed,
      url: status.latest?.url ?? null,
    });
  }

  if (options.json) {
    out(options.silent, JSON.stringify(entries, null, 2) + '\n');
  } else {
    for (const entry of entries) {
      out(options.silent, `  ${entry.slug}  ${entry.url ?? '(not published)'}\n`);
    }
  }
  return entries;
}
