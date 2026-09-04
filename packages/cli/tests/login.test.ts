import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runLogin } from '../src/commands/login';

async function waitForLoginUrl(writes: string[]): Promise<string> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const match = writes.join('').match(/http:\/\/localhost:3000\/cli\/login[^\s]+/);
    if (match?.[0]) return match[0];
    await delay(10);
  }
  throw new Error('Timed out waiting for CLI login URL.');
}

beforeEach(() => {
  delete process.env.INTERACTIVE_DEMO_API_BASE;
  delete process.env.INTERACTIVE_DEMO_API_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI browser login', () => {
  it('fails immediately when the server returns a login error callback', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const loginPromise = runLogin({
      cwd: process.cwd(),
      local: true,
      open: false,
    });
    const loginErrorPromise = loginPromise.catch((err: unknown) => err);

    const loginUrl = new URL(await waitForLoginUrl(writes));
    const callback = loginUrl.searchParams.get('callback');
    const state = loginUrl.searchParams.get('state');
    expect(callback).toBeTruthy();
    expect(state).toBeTruthy();

    const callbackUrl = new URL(callback ?? '');
    callbackUrl.searchParams.set('state', state ?? '');
    callbackUrl.searchParams.set('error', 'Could not create the CLI login grant.');

    const res = await fetch(callbackUrl, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/cli/login/complete');
    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('message')).toContain('Could not create the CLI login grant.');
    await expect(loginErrorPromise).resolves.toMatchObject({
      message: 'Could not create the CLI login grant.',
    });
  });

  it('rejects a callback whose state does not match', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const loginPromise = runLogin({ cwd: process.cwd(), local: true, open: false });
    const loginErrorPromise = loginPromise.catch((err: unknown) => err);

    const loginUrl = new URL(await waitForLoginUrl(writes));
    const callbackUrl = new URL(loginUrl.searchParams.get('callback') ?? '');
    callbackUrl.searchParams.set('state', 'wrong');
    callbackUrl.searchParams.set('pairingToken', 'pt');

    const res = await fetch(callbackUrl, { redirect: 'manual' });
    expect(res.status).toBe(400);

    // The login is still pending (the bad callback was ignored); finish it
    // with an error callback so the loopback server closes.
    const errorUrl = new URL(loginUrl.searchParams.get('callback') ?? '');
    errorUrl.searchParams.set('state', loginUrl.searchParams.get('state') ?? '');
    errorUrl.searchParams.set('error', 'cancelled');
    await fetch(errorUrl, { redirect: 'manual' });
    await expect(loginErrorPromise).resolves.toMatchObject({ message: 'cancelled' });
  });
});
