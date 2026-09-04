# Embedding a demo

`interactive-demo build` writes one self-contained folder per demo:

```
dist/<slug>/
  index.html      the page (five lines: stylesheet, two JSON script tags, root, player.js)
  player.js       the player with React bundled in
  player.css      the stylesheet
  assets/…        screenshots, recordings, audio
```

Nothing in the folder depends on where it is served from: every URL inside
it is relative to the page. Move the folder, rename it, nest it under any
path, and it still works.

## Hosting

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, an S3
bucket behind a CDN, or a folder on your existing web server. Upload `dist/`
(or just one `dist/<slug>/`) and note the resulting URL of `index.html`.

Two things to keep:

- Serve `player.js` with a long cache lifetime and `index.html` with a short
  one. The page embeds the demo config, so a rebuilt demo changes
  `index.html`; the player only changes when you upgrade the runtime.
- Recordings can be large. If your host has a file-size limit, keep video
  steps short (the capture tool already trims them to the motion burst).

## The iframe

```html
<iframe
  src="https://your-site.com/demos/onboarding/"
  title="Onboarding demo"
  width="960" height="600"
  loading="lazy"
  allow="fullscreen"
  style="border:0; max-width:100%; aspect-ratio: 16 / 10;">
</iframe>
```

- `allow="fullscreen"` lets the player's fullscreen button work inside the
  frame.
- `loading="lazy"` keeps the player off the critical path of the host page.
- Sizing: give the frame the demo's aspect ratio (a 1440×900 capture is
  16:10; a 1920×1080 one is 16:9) and let `max-width: 100%` handle narrow
  layouts. Below about 640px wide the player switches to its mobile layout.
- The player never reads or writes anything outside its own document. It
  makes no network requests beyond loading its own files and assets.

## Using the React component instead

If the host page is React, skip the iframe and render the player inline:

```tsx
import { Demo } from '@inkly-org/interactive-demo';
import '@inkly-org/interactive-demo/styles.css';
import config from './demo.config.json';
import manifest from './assets.json';

<Demo
  config={config}
  assets={manifest.assets}
  resolveAssetUrl={(entry) => `/demos/onboarding/assets/${entry.file}`}
/>
```

`resolveAssetUrl` turns a manifest entry into the URL your site serves the
file at. Copy the demo's `assets/` folder somewhere your bundler or static
server exposes and point the resolver at it.

The component takes the same config the static page embeds, so a demo
authored in the editor works in both places without changes.
