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
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './ui/Demo';
import type { AssetEntry } from './schema';
import { resolveDemoTheme } from './themes/resolve';

function readJson<T>(id: string, fallback: T): T {
  const node = document.getElementById(id);
  if (!node) return fallback;
  try {
    const parsed = JSON.parse(node.textContent || 'null');
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function resolveAssetUrl(entry: AssetEntry): string {
  if (entry.publicUrl) return entry.publicUrl;
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
  const config = readJson<unknown>('demo-config', null);
  const assets = readJson<AssetEntry[]>('demo-assets', []);
  const root = createRoot(rootEl);

  if (!config) {
    root.render(
      createElement(
        'div',
        { className: 'demo-error' },
        createElement('h2', null, 'No demo config'),
        createElement(
          'pre',
          null,
          'The page has no <script id="demo-config" type="application/json"> element.',
        ),
      ),
    );
    return;
  }

  const theme = resolveDemoTheme({
    demoTheme: (config as { theme?: { preset?: string } }).theme,
  });
  ensureThemeStyle(theme.themeId, theme.css);

  root.render(
    createElement(
      'div',
      { className: 'demo-wrap' },
      createElement(Demo, {
        config,
        themeId: theme.themeId,
        assets: Array.isArray(assets) ? assets : [],
        resolveAssetUrl,
      }),
    ),
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
