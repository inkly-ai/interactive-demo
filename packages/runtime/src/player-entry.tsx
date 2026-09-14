/**
 * Entry point for the self-contained player bundle (`dist/player.js`).
 *
 * A static page mounts a demo with three things:
 *
 *   <link rel="stylesheet" href="./player.css" />
 *   <script id="demo-config" type="application/json">{ ...demo.config.json }</script>
 *   <div id="root"></div>
 *   <script src="./player.js"></script>
 *
 * Media paths in the config (`assets/<file>`) are left relative, so the
 * browser resolves them against the page, which sits in the demo folder.
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
import { DemoSchema, type Demo as DemoConfig, type DemoEvent } from './schema';
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

  function renderConfig(rawConfig: unknown) {
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
      if (id === 'default') {
        rootEl!.style.background = '#f5f5f5';
        rootEl!.style.backgroundImage =
          'radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.08) 0.5px, transparent 1px)';
        rootEl!.style.backgroundSize = '10px 10px';
        return;
      }
      rootEl!.style.background = '#f5f5f7';
    }

    function resolveCanvasAssetUri(uri: string): string {
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
  renderConfig(readInlineConfig());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
