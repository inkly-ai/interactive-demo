/**
 * Thin client for the owner-scoped preview-deployment endpoints. Used by
 * `interactive-demo publish` (staleness check, `--list`).
 */

export interface LatestDeployment {
  id: string;
  path: string;
  url: string;
  createdAt: string;
}

export interface DeploymentStatus {
  deployed: boolean;
  latest?: LatestDeployment;
}

/**
 * Resolve a demo's live deployment by its stable demo id. Returns
 * `{ deployed: false }` when the demo has never been published. The stable id
 * is the only key needed — nothing is cached locally.
 */
export async function fetchDeploymentStatus(args: {
  apiBase: string;
  token: string;
  demoId: string;
}): Promise<DeploymentStatus> {
  const url = `${args.apiBase}/api/previews?demoId=${encodeURIComponent(args.demoId)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${args.token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Could not check deployment status: HTTP ${res.status}.`,
    );
  }
  const json = (await res.json().catch(() => null)) as DeploymentStatus | null;
  if (!json || typeof json.deployed !== 'boolean') {
    throw new Error('Unexpected response from deployment status endpoint.');
  }
  return json;
}
