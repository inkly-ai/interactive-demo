// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EMBED_CLOSE_MESSAGE, EMBED_SIZE_MESSAGE, installEmbedLoader } from '../src/embed/loader';

const ROOT = '#interactive-demo-embed-root';

afterEach(() => {
  window.InteractiveDemo?.close();
  delete window.InteractiveDemo;
});

describe('embed loader', () => {
  it('installs the global and opens a modal iframe with embed=inline appended', () => {
    const api = installEmbedLoader();
    expect(window.InteractiveDemo).toBe(api);
    api.open('https://demos.example/p/abc?x=1');
    const root = document.querySelector(ROOT)!;
    expect(root.getAttribute('role')).toBe('dialog');
    const iframe = root.querySelector('iframe')!;
    expect(iframe.src).toBe('https://demos.example/p/abc?x=1&embed=inline');
    expect(iframe.getAttribute('allowfullscreen')).toBe('true');
    expect(document.documentElement.classList.contains('idm-no-scroll')).toBe(true);
    // A second open while one is up is a no-op.
    api.open('https://demos.example/p/other');
    expect(document.querySelectorAll(ROOT).length).toBe(1);
  });

  it('resolves a relative target against the page', () => {
    installEmbedLoader().open('/demos/tour/');
    expect(document.querySelector<HTMLIFrameElement>(`${ROOT} iframe`)!.src).toBe(
      `${window.location.origin}/demos/tour/?embed=inline`,
    );
  });

  it('closes on Escape, on a scrim click, and on the close message from the frame', () => {
    const api = installEmbedLoader();
    api.open('https://demos.example/p/abc');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector(ROOT)).toBeNull();
    expect(document.documentElement.classList.contains('idm-no-scroll')).toBe(false);

    api.open('https://demos.example/p/abc');
    (document.querySelector(ROOT) as HTMLElement).click();
    expect(document.querySelector(ROOT)).toBeNull();

    api.open('https://demos.example/p/abc');
    const frameWindow = document.querySelector<HTMLIFrameElement>(`${ROOT} iframe`)!.contentWindow;
    window.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_CLOSE_MESSAGE }, source: frameWindow }));
    expect(document.querySelector(ROOT)).toBeNull();
  });

  it('ignores a close message from any other window', () => {
    installEmbedLoader().open('https://demos.example/p/abc');
    window.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_CLOSE_MESSAGE }, source: null }));
    expect(document.querySelector(ROOT)).not.toBeNull();
  });

  it('takes the frame ratio from the page\'s size report, ignoring other windows', () => {
    installEmbedLoader().open('https://demos.example/p/abc');
    const frame = document.querySelector<HTMLElement>(`${ROOT} .idm-frame`)!;
    const frameWindow = document.querySelector<HTMLIFrameElement>(`${ROOT} iframe`)!.contentWindow;
    window.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_SIZE_MESSAGE, width: 1440, height: 952 }, source: null }));
    expect(frame.style.aspectRatio).toBe('');
    window.dispatchEvent(new MessageEvent('message', { data: { type: EMBED_SIZE_MESSAGE, width: 1440, height: 952 }, source: frameWindow }));
    expect(frame.style.aspectRatio).toBe('1440 / 952');
    // jsdom folds the calc into a vh value; the shape is what matters.
    expect(frame.style.width).toMatch(/^min\(1100px, 92vw, /);
  });

  it('drains open() calls queued by the host page stub, and installs once', () => {
    const q: unknown[][] = [];
    window.InteractiveDemo = { q, open: (...args: unknown[]) => { q.push(args); }, close: () => {} };
    window.InteractiveDemo.open('https://demos.example/p/queued');
    const api = installEmbedLoader();
    expect(document.querySelector<HTMLIFrameElement>(`${ROOT} iframe`)!.src).toContain('/p/queued?embed=inline');
    expect(q.length).toBe(0);
    expect(installEmbedLoader()).toBe(api);
  });
});
