/**
 * A headless Chrome that navigates, clicks and returns PNG screenshots at an
 * exact size. Used to retake the self-demo's screens; the product's own
 * `capture` command drives its sessions through packages/cli/src/capture.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `no Chrome found. Set CHROME_PATH, or install Chrome. Looked at:\n  ${CHROME_CANDIDATES.join('\n  ')}`,
    );
  }
  return found;
}

/**
 * @param {{width?: number, height?: number, scale?: number}} options
 *   `scale` is the device pixel ratio: 2 gives retina-sharp screenshots at
 *   twice the pixel size, which is what the demo assets want.
 */
export async function launch({ width = 1440, height = 900, scale = 2 } = {}) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'interactive-demo-shoot-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      `--user-data-dir=${profile}`,
    ],
    { stdio: 'ignore' },
  );

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(150);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* not listening yet */
    }
  }
  if (!wsUrl) {
    proc.kill('SIGKILL');
    throw new Error('Chrome never exposed a debugging endpoint');
  }

  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let nextId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const waiting = msg.id != null && pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    if (msg.error) waiting.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
    else waiting.resolve(msg.result);
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Page.enable', {}, sessionId);
  await call('Runtime.enable', {}, sessionId);
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);

  return {
    width,
    height,
    scale,
    async goto(url, settleMs = 1600) {
      await call('Page.navigate', { url }, sessionId);
      await sleep(settleMs);
    },
    async evaluate(expression) {
      const result = await call(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result?.value;
    },
    async click(x, y, settleMs = 900) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId);
      }
      await sleep(settleMs);
    },
    /** Click the centre of the first element matching a selector. */
    async clickSelector(selector, settleMs = 900) {
      const box = await this.boxOf(selector);
      if (!box) throw new Error(`no element matches ${selector}`);
      await this.click(box.cx, box.cy, settleMs);
      return box;
    },
    async key(key, code, keyCode, settleMs = 600) {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode }, sessionId);
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode }, sessionId);
      await sleep(settleMs);
    },
    /** Viewport box of an element, in CSS pixels and as 0..1 of the viewport. */
    async boxOf(selector) {
      return this.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2),
          x: +( (r.left + r.width / 2) / innerWidth ).toFixed(4),
          y: +( (r.top + r.height / 2) / innerHeight ).toFixed(4),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })()`);
    },
    async shot(path) {
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(data, 'base64'));
      return path;
    },
    async close() {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
      proc.kill('SIGTERM');
    },
  };
}

export { sleep };
