/**
 * Entry point for the self-contained player bundle (`dist/player.js`).
 *
 * A static page mounts a demo with three things:
 *
 *   <link rel="stylesheet" href="./player.css" />
 *   <script id="demo-config" type="application/json">{ ...demo.config.json }</script>
 *   <script id="demo-assets" type="application/json">[ ...assets ]</script>  (optional)
 *   <div id="root"></div>
 *   <script src="./player.js"></script>
 *
 * `demo-assets` is the `assets` array of an assets manifest. `asset:<id>`
 * URIs in the config resolve to the entry's `publicUrl` when set, otherwise
 * to `./assets/<file>` relative to the page.
 *
 * The mount logic is the pre-pivot CLI page template's module script, with
 * the CDN runtime import replaced by this bundle: it applies the demo-level
 * canvas background, honours `?autoplay=1` (and `?render=1`), and exposes
 * the `window.__demo` contract (`ready`, `complete`, `stepIds`, `controls`,
 * `demo`) so an exporter or host page can detect readiness, drive the
 * player and wait for completion.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './ui/Demo';
import { DemoSchema, type AssetEntry, type Demo as DemoConfig, type DemoEvent } from './schema';
import type { usePlayerController } from './engine/usePlayer';
import { resolveDemoTheme } from './themes/resolve';

type PlayerControls = ReturnType<typeof usePlayerController>['controls'];

export type DemoWindowContract = {
  ready: boolean;
  complete: boolean;
  stepIds: string[];
  controls: PlayerControls;
  demo: DemoConfig;
};

declare global {
  interface Window {
    __demo?: DemoWindowContract;
  }
}

// Export / render support. `?autoplay=1` starts playback on ready;
// `?render=1` (an exporter driving the page) implies autoplay too. The
// exporter drives the page via the window.__demo contract below and waits
// for `__demo.complete`.
const DEMO_PARAMS = new URLSearchParams(location.search);
const DEMO_AUTOPLAY = DEMO_PARAMS.get('autoplay') === '1' || DEMO_PARAMS.get('render') === '1';

function readInlineConfig(): unknown {
  const node = document.getElementById('demo-config');
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || 'null');
  } catch {
    return null;
  }
}

function readInlineAssets(): AssetEntry[] {
  const node = document.getElementById('demo-assets');
  if (!node) return [];
  try {
    const parsed = JSON.parse(node.textContent || '[]');
    return Array.isArray(parsed) ? (parsed as AssetEntry[]) : [];
  } catch {
    return [];
  }
}

// Managed assets carry the URL they should render from when they were
// synced somewhere; local builds fall back to the page-relative `assets/`
// folder next to the page.
function resolveAssetUrl(entry: AssetEntry): string {
  if (entry && typeof entry.publicUrl === 'string' && entry.publicUrl) {
    return entry.publicUrl;
  }
  const file = entry.file ?? entry.path;
  return file ? `./assets/${file.split('/').map(encodeURIComponent).join('/')}` : '';
}

function ensureThemeStyle(themeId: string, css: string) {
  if (!css) return;
  const attr = 'data-demo-theme-css';
  if (document.querySelector(`style[${attr}="${themeId}"]`)) return;
  const style = document.createElement('style');
  style.setAttribute(attr, themeId);
  style.textContent = css;
  document.head.appendChild(style);
}

function mount() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const root = createRoot(rootEl);

  function renderError(title: string, body: string) {
    root.render(
      createElement(
        'div',
        { className: 'demo-error' },
        createElement('h2', null, title),
        createElement('pre', null, body),
      ),
    );
  }

  function renderConfig(rawConfig: unknown, assets: AssetEntry[]) {
    if (!rawConfig) {
      renderError(
        'No demo config',
        'The page has no <script id="demo-config" type="application/json"> element.',
      );
      return;
    }

    const parsed = DemoSchema.safeParse(rawConfig);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      renderError('Invalid demo config', issues);
      return;
    }
    const config = parsed.data;

    // Resolve the demo's theme: `demo.theme.preset` wins, else the default.
    const theme = resolveDemoTheme({ demoTheme: config.theme });
    const themeId = theme.themeId;
    ensureThemeStyle(themeId, theme.css);

    function applyThemeCanvas(id: string) {
      rootEl!.style.background = '';
      rootEl!.style.backgroundColor = '';
      rootEl!.style.backgroundImage = '';
      rootEl!.style.backgroundPosition = '';
      rootEl!.style.backgroundRepeat = '';
      rootEl!.style.backgroundSize = '';

      if (id === 'mono') {
        rootEl!.style.background = '#f7f7f7';
        return;
      }
      rootEl!.style.background = '#f5f5f7';
    }

    function resolveCanvasAssetUri(uri: string): string {
      if (!uri) return uri;
      if (/^(https?:|data:|blob:)/i.test(uri)) return uri;
      const list = Array.isArray(assets) ? assets : [];
      if (uri.startsWith('asset:')) {
        const id = uri.slice('asset:'.length);
        const found = list.find((entry) => entry && entry.id === id);
        return found ? resolveAssetUrl(found) : uri;
      }
      return uri;
    }

    const demoBackground = config.background;
    const canvasColor =
      demoBackground && demoBackground.type === 'color' && demoBackground.color
        ? demoBackground.color
        : typeof config.backgroundColor === 'string'
          ? config.backgroundColor
          : '';
    applyThemeCanvas(themeId);
    if (
      demoBackground &&
      demoBackground.type === 'color' &&
      demoBackground.from &&
      demoBackground.to
    ) {
      rootEl!.style.background = `linear-gradient(135deg, ${demoBackground.from}, ${demoBackground.to})`;
    } else if (demoBackground && demoBackground.type === 'image' && demoBackground.src) {
      rootEl!.style.backgroundColor = '#f5f5f5';
      rootEl!.style.backgroundImage = `url("${resolveCanvasAssetUri(demoBackground.src)}")`;
      rootEl!.style.backgroundPosition = 'center';
      rootEl!.style.backgroundRepeat = 'no-repeat';
      rootEl!.style.backgroundSize = 'cover';
    } else if (demoBackground && demoBackground.type === 'none') {
      // Keep the active theme's default player canvas.
    } else if (canvasColor) {
      rootEl!.style.background = canvasColor;
    }

    // The .demo-wrap div gives <Demo> a definite-width containing block
    // so its internal `width: min(100%, 960px, ...)` resolves correctly.
    root.render(
      createElement(
        'div',
        { className: 'demo-wrap' },
        createElement(Demo, {
          config,
          themeId,
          assets: assets || [],
          resolveAssetUrl,
          // Expose the window.__demo contract so a host page or exporter
          // can detect readiness, drive step seeks, and wait for completion.
          onReady: (info) => {
            const controls = info && info.controls;
            const demo = info && info.demo;
            window.__demo = {
              ready: true,
              complete: false,
              stepIds: demo && demo.steps ? demo.steps.map((s) => s.id) : [],
              controls,
              demo,
            };
            if (DEMO_AUTOPLAY && controls) {
              try {
                controls.play();
              } catch {
                /* ignore */
              }
            }
          },
          onEvent: (event: DemoEvent) => {
            if (event && event.type === 'complete' && window.__demo) {
              window.__demo.complete = true;
            }
          },
        }),
      ),
    );
  }

  // First paint uses the config + assets inlined into the HTML — no fetch.
  renderConfig(readInlineConfig(), readInlineAssets());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
