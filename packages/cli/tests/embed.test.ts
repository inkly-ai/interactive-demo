import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readConfigMock } = vi.hoisted(() => ({ readConfigMock: vi.fn() }));

vi.mock('../src/publish/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/publish/config.js')>();
  return { ...actual, readConfig: readConfigMock };
});

import { runInit } from '../src/commands/init';
import { runEmbed } from '../src/commands/embed';

describe('interactive-demo embed', () => {
  let workdir: string;
  let projectDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    delete process.env.INTERACTIVE_DEMO_API_BASE;
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-embed-'));
    projectDir = (await runInit({ name: 'site', cwd: workdir, silent: true })).dir;
    readConfigMock.mockResolvedValue({ token: 'test-token', apiBase: 'https://example.test' });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(workdir, { recursive: true, force: true });
  });

  it('refuses a demo that was never published instead of publishing it', async () => {
    const fetchMock = vi.fn(async (_url: string, _opts?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ deployed: false }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(runEmbed({ cwd: projectDir, silent: true })).rejects.toThrow(
      '"getting-started" has not been published yet. Run `interactive-demo publish getting-started` first',
    );
    // The status lookup, and nothing that writes.
    expect(fetchMock.mock.calls.map(([url, opts]) => [url, opts?.method ?? 'GET'])).toEqual([
      [expect.stringMatching(/^https:\/\/example\.test\/api\/previews\?demoId=/), 'GET'],
    ]);
  });

  it('prints the snippet for a published demo', async () => {
    const url = 'https://example.test/p/abc';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ deployed: true, latest: { id: 'abc', path: '/p/abc', url, createdAt: '' } }),
    })) as unknown as typeof fetch;

    await expect(runEmbed({ cwd: projectDir, silent: true })).resolves.toEqual({ mode: 'inline', url });
  });
});
