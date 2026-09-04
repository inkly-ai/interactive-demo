import type { AssetMeta } from '@/lib/assets';

/**
 * The local JSON API `interactive-demo dev` mounts under `/__demo/editor/`.
 * Every editor write goes through here; there is no other persistence.
 */
export const EDITOR_API_BASE = '/__demo/editor';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function demoPath(slug: string, resource: string): string {
  return `${EDITOR_API_BASE}/demos/${slug.split('/').map(encodeURIComponent).join('/')}/${resource}`;
}

export interface DemoSummary {
  slug: string;
  title: string;
}

export async function listDemos(): Promise<DemoSummary[]> {
  return json<DemoSummary[]>(await fetch('/__demo/demos', { cache: 'no-store' }));
}

export async function getDemoFiles(slug: string): Promise<{ files: Record<string, string>; binary: string[] }> {
  return json(await fetch(demoPath(slug, 'files'), { cache: 'no-store' }));
}

/** Browsers only honour `keepalive` for bodies up to 64 KB. */
const KEEPALIVE_MAX_BYTES = 60_000;

export async function putDemoFiles(
  slug: string,
  files: Record<string, string>,
  deletions: string[] = [],
  options: { keepalive?: boolean } = {},
): Promise<void> {
  const body = JSON.stringify({ files, delete: deletions });
  await json<{ ok: true }>(
    await fetch(demoPath(slug, 'files'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      // Lets a save started from pagehide outlive the page.
      keepalive: Boolean(options.keepalive) && body.length <= KEEPALIVE_MAX_BYTES,
    }),
  );
}

export async function listDemoAssets(slug: string): Promise<AssetMeta[]> {
  const body = await json<{ assets: AssetMeta[] }>(
    await fetch(demoPath(slug, 'assets'), { cache: 'no-store' }),
  );
  return body.assets ?? [];
}

export async function uploadDemoAsset(args: {
  slug: string;
  name: string;
  blob: Blob;
  contentType: string;
  kind?: string;
}): Promise<AssetMeta> {
  const query = new URLSearchParams({ name: args.name });
  if (args.kind) query.set('kind', args.kind);
  const body = await json<{ ok: true; asset: AssetMeta }>(
    await fetch(`${demoPath(args.slug, 'assets')}?${query.toString()}`, {
      method: 'POST',
      headers: { 'content-type': args.contentType || 'application/octet-stream' },
      body: args.blob,
    }),
  );
  return body.asset;
}
