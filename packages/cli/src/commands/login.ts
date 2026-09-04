import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import {
  clearConfig,
  CONFIG_PATH,
  DEFAULT_API_BASE,
  LOCAL_API_BASE,
  normalizeApiBase,
  readConfig,
  writeConfig,
} from '../publish/config.js';
import { findProjectRoot } from '../project.js';

export interface LoginOptions {
  /**
   * Select the local dev build (http://localhost:3000) of the hosting app
   * instead of the production origin. `INTERACTIVE_DEMO_API_BASE` overrides
   * both.
   */
  local?: boolean;
  token?: string;
  cwd: string;
  open?: boolean;
  silent?: boolean;
}

export interface StatusOptions {
  cwd: string;
  json?: boolean;
  silent?: boolean;
}

export interface LoginResult {
  apiBase: string;
  configPath: string;
  verified: boolean;
  method: 'browser' | 'token';
}

export interface StatusResult {
  configPath: string;
  apiBase: string | null;
  loggedIn: boolean;
  projectRoot: string | null;
  online: 'ok' | 'failed' | 'skipped';
  message?: string;
}

export async function runLogin(options: LoginOptions): Promise<LoginResult> {
  const apiBase = normalizeApiBase(options.local ? LOCAL_API_BASE : DEFAULT_API_BASE);
  const token = options.token ?? process.env.INTERACTIVE_DEMO_API_TOKEN;
  if (token) {
    const result = await verifyToken(apiBase, token).catch(
      (): VerifyResult => ({ valid: false, userId: null, email: null }),
    );
    await writeConfig({ apiBase, token });

    if (!options.silent) {
      process.stdout.write(
        `Logged in to ${apiBase}${result.valid ? '' : ' (token saved without online verification)'}\n`,
      );
    }
    return { apiBase, configPath: CONFIG_PATH, verified: result.valid, method: 'token' };
  }

  const grant = await runBrowserLogin({
    apiBase,
    shouldOpen: options.open !== false,
    silent: options.silent,
  });
  await writeConfig({ apiBase: grant.apiBase, token: grant.apiToken });
  const result = await verifyToken(grant.apiBase, grant.apiToken).catch(
    (): VerifyResult => ({ valid: false, userId: null, email: null }),
  );

  if (!options.silent) {
    process.stdout.write(`Logged in to ${grant.apiBase}\n`);
  }
  return {
    apiBase: grant.apiBase,
    configPath: CONFIG_PATH,
    verified: result.valid,
    method: 'browser',
  };
}

export async function runLogout(options: { silent?: boolean } = {}): Promise<void> {
  await clearConfig();
  if (!options.silent) process.stdout.write(`Removed ${CONFIG_PATH}\n`);
}

export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  const config = await readConfig();
  const apiBase = config.apiBase ? normalizeApiBase(config.apiBase) : null;
  const projectRoot = await findProjectRoot(options.cwd);
  let online: StatusResult['online'] = 'skipped';
  let message: string | undefined;

  if (apiBase && config.token) {
    try {
      const verify = await verifyToken(apiBase, config.token);
      online = verify.valid ? 'ok' : 'failed';
      if (online === 'failed') message = 'Token was rejected by the server.';
    } catch (err) {
      online = 'failed';
      message = (err as Error).message;
    }
  }

  const result: StatusResult = {
    configPath: CONFIG_PATH,
    apiBase,
    loggedIn: Boolean(config.token),
    projectRoot,
    online,
    message,
  };

  if (!options.silent) {
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(`Credentials: ${CONFIG_PATH}\n`);
      process.stdout.write(`Project: ${projectRoot ?? '(not inside a project)'}\n`);
      process.stdout.write(`API: ${apiBase ?? '(not configured)'}\n`);
      process.stdout.write(`Login: ${result.loggedIn ? 'configured' : 'not configured'}\n`);
      process.stdout.write(`Online: ${online}${message ? ` (${message})` : ''}\n`);
    }
  }

  return result;
}

interface VerifyResult {
  valid: boolean;
  userId: string | null;
  email: string | null;
}

async function verifyToken(apiBase: string, token: string): Promise<VerifyResult> {
  const res = await fetch(`${apiBase}/api/captures/verify`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { valid: false, userId: null, email: null };
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const body = (await res.json()) as { userId?: unknown; email?: unknown };
    if (typeof body.userId === 'string' && body.userId) userId = body.userId;
    if (typeof body.email === 'string' && body.email) email = body.email;
  } catch {
    // A server without `userId`/`email` in the probe — token still valid.
  }
  return { valid: true, userId, email };
}

async function runBrowserLogin(args: {
  apiBase: string;
  shouldOpen: boolean;
  silent?: boolean;
}): Promise<{ apiToken: string; apiBase: string }> {
  const state = randomBytes(16).toString('hex');
  const server = createServer();
  const callback = await listenOnLoopback(server);
  const loginUrl = new URL('/cli/login', args.apiBase);
  loginUrl.searchParams.set('callback', callback.url);
  loginUrl.searchParams.set('state', state);

  const resultPromise = waitForCallback({
    server,
    state,
    apiBase: args.apiBase,
    timeoutMs: 2 * 60 * 1000,
  });

  if (!args.silent) {
    process.stdout.write(`Opening browser to log in:\n${loginUrl.toString()}\n`);
  }
  if (args.shouldOpen) openBrowser(loginUrl.toString());

  return resultPromise;
}

async function listenOnLoopback(server: ReturnType<typeof createServer>): Promise<{
  url: string;
}> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start local login callback server.');
  }
  return { url: `http://127.0.0.1:${address.port}/callback` };
}

async function waitForCallback(args: {
  server: ReturnType<typeof createServer>;
  state: string;
  apiBase: string;
  timeoutMs: number;
}): Promise<{ apiToken: string; apiBase: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      closeServer(args.server);
      reject(new Error('Timed out waiting for browser login.'));
    }, args.timeoutMs);

    args.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          if (url.pathname !== '/callback') {
            sendHtml(res, 404, 'Not found.');
            return;
          }
          const returnedState = url.searchParams.get('state');
          const pairingToken = url.searchParams.get('pairingToken');
          const returnedError = url.searchParams.get('error');
          if (returnedState !== args.state) {
            sendHtml(res, 400, 'Invalid CLI login callback. You can close this tab.');
            return;
          }
          if (returnedError) {
            clearTimeout(timeout);
            sendRedirect(
              res,
              cliLoginCompleteUrl(args.apiBase, 'error', `CLI login failed: ${returnedError}`),
            );
            closeServer(args.server);
            reject(new Error(returnedError));
            return;
          }
          if (!pairingToken) {
            clearTimeout(timeout);
            sendRedirect(
              res,
              cliLoginCompleteUrl(args.apiBase, 'error', 'Invalid CLI login callback. Run interactive-demo login again.'),
            );
            closeServer(args.server);
            reject(new Error('Invalid CLI login callback.'));
            return;
          }
          const exchanged = await exchangePairingToken(args.apiBase, pairingToken);
          clearTimeout(timeout);
          sendRedirect(res, cliLoginCompleteUrl(args.apiBase, 'success'));
          closeServer(args.server);
          resolve(exchanged);
        } catch (err) {
          clearTimeout(timeout);
          sendRedirect(
            res,
            cliLoginCompleteUrl(args.apiBase, 'error', `CLI login failed: ${(err as Error).message}`),
          );
          closeServer(args.server);
          reject(err);
        }
      })();
    });
  });
}

async function exchangePairingToken(
  apiBase: string,
  pairingToken: string,
): Promise<{ apiToken: string; apiBase: string }> {
  const res = await fetch(`${apiBase}/api/cli/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairingToken }),
  });
  const json = await res.json().catch(() => null) as {
    apiToken?: string;
    apiBase?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.apiToken) {
    throw new Error(json?.error ?? `Login exchange failed: HTTP ${res.status}`);
  }
  return { apiToken: json.apiToken, apiBase: normalizeApiBase(json.apiBase ?? apiBase) };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => undefined);
  child.unref();
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><title>interactive-demo</title><body style="font-family: system-ui, sans-serif; padding: 32px;">${escapeHtml(body)}</body>`);
}

function cliLoginCompleteUrl(
  apiBase: string,
  status: 'success' | 'error',
  message?: string,
): string {
  const url = new URL('/cli/login/complete', apiBase);
  url.searchParams.set('status', status);
  if (message) url.searchParams.set('message', message);
  return url.toString();
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('location', location);
  res.end();
}

function closeServer(server: ReturnType<typeof createServer>): void {
  try {
    server.close();
  } catch {
    // already closed
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
