# Embedding a demo

`interactive-demo build` writes one self-contained folder per demo:

```
dist/<slug>/
  index.html      the page (four lines: stylesheet, the config script tag, root, player.js)
  player.js       the player with React bundled in
  player.css      the stylesheet
  player-fonts.css  optional self-hosted files: fonts/*.woff2 and backgrounds/ (the
                    default theme's watercolor cover); drop them to fall back to
                    system fonts and a flat cover
  assets/…        screenshots, recordings, audio
dist/embed.js     the pop-up loader, once for the whole folder (see below)
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

## Pop-up

To open a demo from a button instead of holding space for it, include the
loader once and call `InteractiveDemo.open` with the demo's URL. The loader
is three kilobytes with no dependencies; `build` writes it to `dist/embed.js`
and the hosting service serves the same file at `/embed.js`.

```html
<script>window.InteractiveDemo=window.InteractiveDemo||{q:[],open:function(){(this.q=this.q||[]).push(arguments)}};</script>
<script src="https://your-site.com/demos/embed.js" async></script>

<button onclick="InteractiveDemo.open('https://your-site.com/demos/onboarding/')">Try the demo</button>
```

The first line is a stub that queues clicks made before the script arrives.
`open` draws a scrim and a centred 16:9 frame, loads the page inside it with
`?embed=inline` so the page shows the player alone, and closes on Escape, on a
click outside the frame, or on `InteractiveDemo.close()`. A relative URL is
resolved against the host page. Hosted demos work the same way:
`interactive-demo embed --mode popup` prints the loader and a button for
HTML, React, Next.js, Vue and Svelte.

## Using the React component instead

If the host page is React, skip the iframe and render the player inline.
Copy the demo folder into your app's static files (Next.js: `public/`,
Vite: `public/`) and point the player at it:

```tsx
import { Demo } from '@inkly-org/interactive-demo';
import '@inkly-org/interactive-demo/styles.css';

<Demo src="/demos/onboarding/" />
```

The component fetches `demo.config.json` from that folder and resolves the
media paths in it against the same folder. To import the config at build
time instead, pass the object and say where its folder is served from:

```tsx
import config from './demos/onboarding/demo.config.json';

<Demo src={config} baseUrl="/demos/onboarding/" />
```

Media served from somewhere else, such as a CDN, goes through
`resolveAssetUrl={(path) => …}`, which receives each relative path.

The component takes the same config the static page embeds, so a demo
authored in the editor works in both places without changes.

For a pop-up in a React app, wrap the player in `DemoModal` rather than
loading `embed.js`: it renders the player in-process through a portal with
the same overlay, so there is no iframe and no second copy of the runtime.

```tsx
import { useState } from 'react';
import { Demo, DemoModal } from '@inkly-org/interactive-demo';

function TryTheDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Try the demo</button>
      <DemoModal open={open} onClose={() => setOpen(false)} label="Onboarding demo">
        <Demo src="/demos/onboarding/" />
      </DemoModal>
    </>
  );
}
```

`DemoModal` mounts its children only while open, so the demo starts from
the beginning each time, and it hands focus back to the button on close.
