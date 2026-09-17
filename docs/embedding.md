# Sharing and embedding a demo

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

## Which of these do you want?

A built demo is a page. There are three ways to put it in front of someone,
and the first thing to decide is whether the demo runs in its own document or
inside your app's:

|  | on its own | inline in a page | as a pop-up |
|---|---|---|---|
| **the built page** | send the link | `<iframe>` | `embed.js` |
| **your React app** | — | `<Demo>` | `<DemoModal>` |

The top row is the same page used three ways. Send someone the URL and they
get the demo full-screen; frame that same URL and it sits in your page;
point the loader script at it and it opens over your page. Nothing is
installed, and the page doing the embedding can be React, Vue, Rails or plain
HTML — the loader is only DOM.

The bottom row skips the page. You install the runtime package and render the
player inside your own React tree, so there is no iframe and no second
document.

Pick the top row if you want isolation, or if the demo lives on a different
host from the site showing it. Pick the bottom row if you want the demo to
behave like part of your app — your router, your state, your styling around
it. The trade is real either way: an iframe costs you a second document and
cross-document messaging for size and events, while the component costs you
the player in your bundle.

They also need different things deployed. The top row serves `dist/` from
`build`. The bottom row does not use `dist/` at all — it wants the demo
*folder* (its `demo.config.json` and `assets/`) reachable as static files,
plus `@inkly-org/interactive-demo` installed. That catches people out, so it
is worth saying twice.

## Getting the page online

Everything in the top row of that table needs the demo page to exist at a URL.
There are two ways to get one, and the rest of this page is the same either
way — only the URL changes.

### Publish it

```sh
interactive-demo login      # once per machine
interactive-demo publish    # prints the demo's URL
```

Nothing to deploy and nothing to configure. Publishing the same demo again
updates that URL in place rather than minting a new one, so embeds you have
already pasted keep working; `--new` opts into a fresh URL when you want the
old one left alone.

### Or host it yourself

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, an S3
bucket behind a CDN, or a folder on your existing web server. Upload `dist/`
(or just one `dist/<slug>/`) and note the resulting URL of `index.html`.

Two things to keep:

- Serve `player.js` with a long cache lifetime and `index.html` with a short
  one. The page embeds the demo config, so a rebuilt demo changes
  `index.html`; the player only changes when you upgrade the runtime.
- Recordings can be large. If your host has a file-size limit, keep video
  steps short (the capture tool already trims them to the motion burst).

## On its own: send the link

`dist/<slug>/index.html` is a complete page, so the simplest thing you can do
with a demo is send someone its URL. No snippet, nothing to install, and it
is the same URL the iframe and the pop-up point at — the two sections below
are that page used in a frame rather than a different build of it.

Add `?autoplay=1` if you want it to start playing as soon as it loads.

## Inline: the iframe

Add `?embed=inline` to the page URL and the page renders the player alone:
no bar, no canvas, transparent background, the player filling the frame
edge to edge. Size the frame to the demo, which is its screen ratio plus the
player's header (52px in the default theme, 48px in `mono`) and 2px for the card's border:

```html
<div style="container-type: inline-size; width: 100%; max-width: calc(max(0px, 80vh - 54px) * 1440 / 900); margin: 0 auto;">
  <div style="position: relative; width: 100%; height: calc(100cqw * 900 / 1440 + 52px + 2px);">
    <iframe
      src="https://your-site.com/demos/onboarding/?embed=inline"
      title="Onboarding demo"
      loading="lazy"
      allow="clipboard-read; clipboard-write; fullscreen"
      allowfullscreen
      style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0;">
    </iframe>
  </div>
</div>
```

`interactive-demo embed` prints this with the numbers filled in from the
demo, and so does the editor's Share dialog. The outer `max-width` keeps the
frame under 80% of the viewport height; the inner box is the exact ratio
plus header, so the player never letterboxes.

- `allow="fullscreen"` lets the player's fullscreen button work inside the
  frame.
- `loading="lazy"` keeps the player off the critical path of the host page.
- Below about 640px wide the player switches to its mobile layout.
- Without `?embed=inline` the page keeps its own bar and canvas, which is
  what you want for a link, not an embed.
- The player never reads or writes anything outside its own document. It
  makes no network requests beyond loading its own files and assets.

## Pop-up: the loader script

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

## Listening for events from an embedded demo

A framed demo, inline or in the pop-up, relays every runtime event to the
page that embeds it as a `message` of type `interactive-demo:event`. Form
submissions, step views, completion and CTA clicks all arrive this way, so
the host page can react without touching the demo:

```html
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'interactive-demo:event') return;
    const event = e.data.event;
    if (event.type === 'form_submit') {
      // event.fields is [{ id, label, value }]
    }
  });
</script>
```

Check `e.origin` against the host you embed from before trusting the
payload. A demo that stands on its own page sends nothing. The React
component gets the same events directly through its `onEvent` prop, and a
form can also POST its values to a URL of your choosing with `submitTo`
(see the authoring guide).

## In your own React app

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
