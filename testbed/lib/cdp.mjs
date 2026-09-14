/**
 * Just enough Chrome DevTools Protocol to drive a headless capture from a
 * script: attach to the tab `capture start` opened, then click, type and
 * scroll in it the way a person would in the headed window.
 *
 * Dev-only helper for the testbed — the CLI has its own client in
 * packages/cli/src/capture/chrome.ts.
 */
import WebSocket from 'ws';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function attach(webSocketDebuggerUrl, targetId) {
  const ws = new WebSocket(webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  const pending = new Map();
  let nextId = 0;

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
    if (msg.error) waiting.reject(new Error(`${msg.error.message ?? JSON.stringify(msg.error)}`));
    else waiting.resolve(msg.result);
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  return {
    /** Raw protocol call, already bound to the attached tab. */
    send: (method, params) => send(method, params, sessionId),
    /** A left click at viewport coordinates, then a pause for the page to settle. */
    async click(x, y, settleMs = 1200) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId);
      }
      await sleep(settleMs);
    },
    async scroll(x, y, deltaY, settleMs = 700) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }, sessionId);
      await sleep(settleMs);
    },
    async type(text, settleMs = 400) {
      for (const char of text) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', text: char }, sessionId);
        await send('Input.dispatchKeyEvent', { type: 'keyUp', text: char }, sessionId);
      }
      await sleep(settleMs);
    },
    /** Evaluate an expression in the page and return its JSON value. */
    async evaluate(expression) {
      const result = await send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    },
    /** Viewport coordinates of the centre of the first element matching a selector. */
    async centerOf(selector) {
      return this.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
    },
    close() {
      ws.close();
    },
  };
}

export { sleep };
