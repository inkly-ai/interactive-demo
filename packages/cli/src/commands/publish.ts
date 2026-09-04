import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AssetsManifest } from '@inkly-org/interactive-demo/schema';
import { normalizeApiBase, readConfig } from '../publish/config.js';
import { fetchDeploymentStatus } from '../publish/previews-api.js';
import {
  contentTypeForFile,
  planDemoAssets,
  uploadSyncAssets,
  type SyncAssetPlan,
  type SyncFinalizedUpload,
} from '../publish/sync.js';
import { resolveRuntimeFile } from '../page.js';
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

function selectDemo(
  project: LoadedProject,
  options: PublishOptions,
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

function applyPreviewUploadsToAssets(
  manifest: AssetsManifest | null,
  plans: SyncAssetPlan[],
  uploads: SyncFinalizedUpload[],
): AssetsManifest {
  const base = manifest ?? { version: 1 as const, assets: [] };
  const uploadBySha = new Map(uploads.map((upload) => [upload.sha256, upload]));
  const planBySha = new Map(plans.map((plan) => [plan.sha256, plan]));
  return {
    ...base,
    assets: base.assets.map((asset) => {
      const upload = uploadBySha.get(asset.sha256);
      if (!upload) return asset;
      const plan = planBySha.get(asset.sha256);
      return {
        ...asset,
        contentType:
          asset.contentType ??
          plan?.contentType ??
          contentTypeForFile(`${asset.sha256}${upload.ext}`, asset.kind),
        publicUrl: upload.publicUrl,
      };
    }),
  };
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

/** The project-level context the hosting service stores next to the demo. */
async function projectContext(project: LoadedProject, cwd: string) {
  return {
    name: project.project.name,
    runtime: await resolveRuntimeVersion(cwd),
    ...(project.project.theme ? { theme: project.project.theme } : {}),
    ...(project.project.tokens ? { tokens: project.project.tokens } : {}),
    ...(project.project.brand ? { brand: project.project.brand } : {}),
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

  // Ensure every asset is on the server's storage before freezing — the hosted
  // demo is served from there, which has no access to the local assets folder.
  const plan = await planDemoAssets(demo);
  if (plan.unresolved.length > 0) {
    throw new Error(
      `${plan.unresolved.length} asset(s) have no local bytes and are not on ` +
        `the server, so the demo cannot be published:\n` +
        plan.unresolved.map((a) => `  - ${a.id} (${a.sha256})`).join('\n'),
    );
  }
  let uploads: SyncFinalizedUpload[] = [];
  if (plan.assets.length > 0) {
    out(options.silent, `Uploading ${plan.assets.length} asset(s)...\n`);
    uploads = (await uploadSyncAssets({
      apiBase,
      token,
      assets: plan.assets,
    })).uploads;
  }

  const frozenAssets = applyPreviewUploadsToAssets(demo.assets, plan.assets, uploads);

  const res = await fetch(`${apiBase}/api/previews`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      demoSlug: demo.slug,
      title: demo.config.title ?? null,
      config: demo.config,
      assets: frozenAssets,
      hub: await projectContext(project, options.cwd),
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
    out(options.silent, `\nEmbed it with\n${formatIframeSnippet(url)}\n`);
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
