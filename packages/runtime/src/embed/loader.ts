/**
 * Pop-up embed loader (ported from the original `embed-v1.js`).
 *
 * Usage on a host page:
 *   <script>window.InteractiveDemo=window.InteractiveDemo||{q:[],open:function(){
 *     (this.q=this.q||[]).push(arguments)}};</script>
 *   <script src="https://HOST/embed.js" async></script>
 *   <button onclick="InteractiveDemo.open('https://HOST/p/abc123')">Try the demo</button>
 *
 * `InteractiveDemo.open(url)` opens `url` inside a centred modal iframe and
 * appends `embed=inline` so the framed page renders the player alone. The
 * URL may be a hosted demo, a page from `build` on any static host, or a
 * path relative to the page that loaded this script.
 *
 * The framed page may post `{ type: "interactive-demo:close" }` (the static
 * page and the hosted viewer do so on Escape) to dismiss the overlay, and
 * `{ type: "interactive-demo:size", width, height }` with its player's
 * size, which the overlay adopts as the frame's aspect ratio.
 *
 * The host page may pre-declare a stub `window.InteractiveDemo` that queues
 * `open` calls; the queue is drained once the real implementation installs.
 */

export const EMBED_GLOBAL = 'InteractiveDemo';
export const EMBED_CLOSE_MESSAGE = 'interactive-demo:close';
/**
 * Posted by the framed page with its player's rendered width and height,
 * so the overlay can take the demo's own ratio instead of assuming 16:9.
 */
export const EMBED_SIZE_MESSAGE = 'interactive-demo:size';
/** The messages the pre-pivot viewer posted; still honoured. */
const LEGACY_CLOSE_MESSAGE = 'inkly:close-popup';
const LEGACY_SIZE_MESSAGE = 'inkly:resize';

const STYLE_ID = 'interactive-demo-embed-style';
const ROOT_ID = 'interactive-demo-embed-root';

interface EmbedApi {
  open: (target: string) => void;
  close: () => void;
  __loaded?: true;
  /** Calls the host page's stub queued before the loader arrived. */
  q?: unknown[][];
}

declare global {
  interface Window {
    InteractiveDemo?: EmbedApi;
  }
}

export function installEmbedLoader(win: Window = window): EmbedApi {
  const prior = win[EMBED_GLOBAL];
  if (prior && prior.__loaded) return prior;
  const doc = win.document;

  let activeFrameWindow: Window | null = null;

  function ensureStyles(): void {
    if (doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);}' +
      '#' + ROOT_ID + ' .idm-frame{position:relative;width:min(1100px,92vw,calc(88vh * 16 / 9));aspect-ratio:16/9;height:auto;max-height:88vh;background:transparent;border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.4);}' +
      '#' + ROOT_ID + ' iframe{display:block;width:100%;height:100%;border:0;background:transparent;}' +
      '#' + ROOT_ID + " .idm-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f7f8fb;color:#62656c;font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
      '#' + ROOT_ID + " .idm-loading:before{content:'';width:18px;height:18px;margin-right:10px;border-radius:999px;border:2px solid rgba(98,101,108,.22);border-top-color:#5b6cff;animation:idm-spin .8s linear infinite;}" +
      '#' + ROOT_ID + ' .idm-frame.idm-loaded .idm-loading{display:none;}' +
      '@keyframes idm-spin{to{transform:rotate(360deg)}}' +
      'html.idm-no-scroll,body.idm-no-scroll{overflow:hidden!important;}';
    doc.head.appendChild(s);
  }

  function close(): void {
    const root = doc.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    activeFrameWindow = null;
    doc.documentElement.classList.remove('idm-no-scroll');
    doc.body.classList.remove('idm-no-scroll');
    doc.removeEventListener('keydown', onKey);
    win.removeEventListener('message', onMessage);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  /** The frame itself, or a page nested one level inside it (the hosted viewer frames its player). */
  function fromActiveFrame(source: MessageEventSource | null): boolean {
    if (!activeFrameWindow || !source) return false;
    if (source === activeFrameWindow) return true;
    try {
      return (source as Window).parent === activeFrameWindow;
    } catch {
      return false;
    }
  }

  function onMessage(e: MessageEvent): void {
    if (activeFrameWindow && !fromActiveFrame(e.source)) return;
    const data = e && e.data;
    if (!data || typeof data !== 'object') return;
    markLoaded();
    const type = (data as { type?: unknown }).type;
    if (type === EMBED_CLOSE_MESSAGE || type === LEGACY_CLOSE_MESSAGE) close();
    if (type === EMBED_SIZE_MESSAGE || type === LEGACY_SIZE_MESSAGE) {
      const { width, height } = data as { width?: unknown; height?: unknown };
      if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
        fitFrame(width, height);
      }
    }
  }

  /** Give the frame the demo's own ratio, still capped to the viewport. */
  function fitFrame(width: number, height: number): void {
    const frame = doc.querySelector('#' + ROOT_ID + ' .idm-frame') as HTMLElement | null;
    if (!frame) return;
    frame.style.aspectRatio = width + ' / ' + height;
    frame.style.width = 'min(1100px, 92vw, calc(88vh * ' + width + ' / ' + height + '))';
  }

  function markLoaded(): void {
    const frame = doc.querySelector('#' + ROOT_ID + ' .idm-frame');
    if (!frame || frame.className.indexOf('idm-loaded') !== -1) return;
    frame.className += ' idm-loaded';
  }

  /** Resolve the target against the page and mark it as an inline embed. */
  function resolveTarget(target: string): string | null {
    const raw = String(target || '');
    if (!raw) return null;
    try {
      const url = new URL(raw, win.location.href);
      if (!url.searchParams.get('embed')) url.searchParams.set('embed', 'inline');
      return url.toString();
    } catch {
      return null;
    }
  }

  function open(target: string): void {
    const resolved = resolveTarget(target);
    if (!resolved) {
      console.warn('[interactive-demo] open() requires a demo URL');
      return;
    }
    if (doc.getElementById(ROOT_ID)) return;
    ensureStyles();

    const root = doc.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const frame = doc.createElement('div');
    frame.className = 'idm-frame';

    const iframe = doc.createElement('iframe');
    // `embed=inline` tells the framed page to render the player alone; the
    // overlay supplies the outer chrome.
    iframe.src = resolved;
    iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.title = 'Demo';
    iframe.addEventListener('load', markLoaded);

    const loading = doc.createElement('div');
    loading.className = 'idm-loading';
    loading.textContent = 'Loading demo...';

    frame.appendChild(iframe);
    frame.appendChild(loading);
    root.appendChild(frame);

    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });

    doc.addEventListener('keydown', onKey);
    win.addEventListener('message', onMessage);
    doc.body.appendChild(root);
    // Only exists once the iframe is in the document; read it after, or
    // the close-message guard would accept a message from any window.
    activeFrameWindow = iframe.contentWindow;
    doc.documentElement.classList.add('idm-no-scroll');
    doc.body.classList.add('idm-no-scroll');
  }

  const api: EmbedApi = { open, close, __loaded: true };
  win[EMBED_GLOBAL] = api;

  // Drain any calls queued by the stub before the loader arrived.
  if (prior && prior.q && prior.q.length) {
    for (const call of prior.q) {
      try {
        open(String(call[0] ?? ''));
      } catch {
        /* swallow — one bad URL shouldn't break the rest */
      }
    }
    prior.q.length = 0;
  }
  return api;
}
