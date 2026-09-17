# The runtime package

`@inkly-org/interactive-demo` is the player. It comes in two shapes, and
they render the same demo:

- a React component, `<Demo>`, for a site that is already React;
- `player.js`, a self-contained bundle with React inside it, for a static
  page. This is what the CLI's `build` writes.

Both take the same `demo.config.json`. Nothing in the package talks to a
server: it loads the config and the media you point it at, and that is all.

## Install

```sh
npm install @inkly-org/interactive-demo react react-dom
```

React and React DOM are peer dependencies (`>=18`). Zod is a real
dependency — the package validates every config it renders.

## What the package exports

| Import path | What you get |
|---|---|
| `@inkly-org/interactive-demo` | `Demo`, `DemoModal`, the primitives, the engine hooks, the schema re-exported |
| `@inkly-org/interactive-demo/schema` | `DemoSchema`, `parseDemo`, every sub-schema and its inferred type, `DEMO_CONFIG_SCHEMA_URL` |
| `@inkly-org/interactive-demo/themes` | `demoThemePresets`, `demoThemePresetsById`, `resolveDemoTheme`, `DEFAULT_DEMO_THEME_ID` |
| `@inkly-org/interactive-demo/styles.css` | the player stylesheet. Required — the components ship no inline styles |
| `@inkly-org/interactive-demo/fonts.css` | optional `@font-face` rules and the default theme's cover backdrop |
| `@inkly-org/interactive-demo/player.js` | the standalone bundle for a static page |
| `@inkly-org/interactive-demo/embed.js` | the pop-up loader for a non-React host page |
| `@inkly-org/interactive-demo/schema/demo.config.json` | the generated JSON Schema |

The root entry is ESM with a CJS build alongside it, and it ships types.

A short tour of the root entry, beyond `Demo` and `DemoModal`:

- The player primitives, also hung off `Demo` itself: `Demo.Root`,
  `Demo.Stage`, `Demo.Header`, `Demo.Controls`, `Demo.Chapters`,
  `Demo.Captions`, `Demo.ProgressBar`, `Demo.StepIndicator`,
  `Demo.MobileFooter`, `Demo.Widgets`, `Demo.Button`. Compose these when
  you want a player that isn't the default layout.
- `useDemoPlayerContext()` and `useAssetUrl()`, for a component rendered
  inside the player.
- `usePlayerController()`, the engine behind `Demo.Root`, if you want the
  state machine without the UI.
- `joinBaseUrl(base, path)`, the one-slash join the player uses for media.
- The schema: `DemoSchema`, `parseDemo`, the types (`DemoConfig`, `Step`,
  `Annotation`, `Widget`, `DemoEvent`, `ThemeTokens`, …).

## The `<Demo>` component

```tsx
import { Demo } from '@inkly-org/interactive-demo';
import '@inkly-org/interactive-demo/styles.css';

export function ProductTour() {
  return <Demo src="/demos/onboarding/" />;
}
```

The component validates the config with `DemoSchema` before rendering. A
config that fails validation renders no step rather than a half-built
player, and the parse errors sit on the player context as `errors`.

### Props

| Prop | Type | What it does |
|---|---|---|
| `src` | `string \| object` | The demo. A string is the URL of its folder; an object is the config itself. |
| `config` | `object` | The config object. Same as an object `src`, kept for hosts that already pass it. |
| `baseUrl` | `string` | Where relative media paths are served from. Trailing slash optional. |
| `resolveAssetUrl` | `(path: string) => string` | Your own rule for turning a relative path into a URL. Wins over `baseUrl`. |
| `onEvent` | `(event: DemoEvent) => void` | The runtime event stream (below). |
| `onReady` | `({ demo, controls }) => void` | Fires once after the config parses and the player mounts. `controls` is stable, so you can keep it. |
| `themeId` | `string` | Which preset's tokens to start from, and the value of `data-demo-theme` on the root. Defaults to `config.theme.preset`. |
| `themeTokens` | `Partial<ThemeTokens>` | Host-level token overrides, applied over the preset and under the demo's own tokens. |
| `size` | `'sm' \| 'md' \| 'lg'` | Player size class. Default `'md'`. |
| `controls` | `'auto' \| 'always'` | `'auto'` (default) fades the controls bar in on hover or focus; `'always'` keeps it up. |
| `layout` | `'default' \| (props) => ReactNode` | The player composition. Pass a function to build your own out of the primitives. |
| `components` | `AnnotationRendererMap` | Replace a built-in annotation renderer (`message`, `text`, `blur`). |
| `attribution` | `ReactNode` | A host watermark rendered on cover screens. Not authored by the demo. |
| `shareUrl` | `string \| null` | The demo's public URL, for the minimal controls' copy-link button. Omit it and the button is hidden. |
| `className` | `string` | Replaces the root class, which is `demo-root` by default. Most hosts want `style` instead. |
| `style` | `CSSProperties` | Merged over the theme's CSS custom properties on the root element. |

`chrome` in the config still decides what the player shows — header,
controls mode, the badge, autoplay. See
[authoring.md](authoring.md#chapters-and-chrome).

The player takes the arrow keys, space and `m`, but only after a click or a
focus inside it, so a host page's own shortcuts keep working elsewhere.

### Where the media comes from

A config references its media by a path relative to the demo folder
(`assets/screen-001.png`). Two ways to tell the player what that folder is.

**Point it at the folder.** The component fetches `demo.config.json` from
the URL and uses the same URL as the media base:

```tsx
<Demo src="/demos/onboarding/" />
```

It shows a `.demo-loading` placeholder while the request is in flight, and
a `.demo-error` card with `role="alert"` if the fetch fails, so a wrong URL
is visible on the page instead of silent.

**Import the config and say where its folder is served from.** Useful when
you want the config in the bundle and no extra request:

```tsx
import config from './demos/onboarding/demo.config.json';

<Demo src={config} baseUrl="/demos/onboarding/" />
```

The rules the resolver follows:

- An absolute URL in the config — `https://`, `data:`, `blob:`, or a
  site-root `/…` path — is used as-is. `baseUrl` never touches it.
- A relative path is joined onto `baseUrl`, with one slash between them and
  a leading `./` dropped.
- With no `baseUrl` and no `resolveAssetUrl`, a relative path is passed
  through and the browser resolves it against the page. That is what the
  static build relies on.
- A pre-release `asset:<id>` pointer is not resolved by anything. It passes
  through with one console warning per id.

**Serve the media from somewhere else.** `resolveAssetUrl` gets every
relative path and returns the URL to fetch. Absolute URLs never reach it:

```tsx
<Demo
  src={config}
  resolveAssetUrl={(path) => `https://cdn.example.com/onboarding/${path}`}
/>
```

This is the hook for a CDN, a signed URL, or a bundler that hashes the
files. It takes precedence over `baseUrl`.

### Driving the player

`onReady` hands you the validated config and the controls:

```tsx
<Demo
  src="/demos/onboarding/"
  onReady={({ demo, controls }) => {
    console.log(demo.steps.length);
    controls.seekToStep('s3');
  }}
/>
```

`controls` is `play`, `pause`, `toggle`, `next`, `prev`, `seekToStep(id)`,
`seekToChapter(id)`, `restart`, `setMuted(bool)`, `toggleMute`,
`setCaptionsEnabled(bool)` and `toggleCaptions`. `next` and `prev` are
no-ops at the ends, so you don't have to bounds-check.

### Custom renderers

Two separate maps, because annotations and widgets are separate things:

- Annotation renderers go on `<Demo components={…}>`, keyed by annotation
  type: `message`, `text`, `blur`.
- Widget renderers are a prop of `Demo.Stage`, `widgetComponents`, keyed
  `widget.headline`, `widget.form`, `widget.embed` and
  `widget.custom.<name>` for a `custom` widget's `name`. `<Demo>` does not
  forward this one, so registering a custom widget means composing the
  player yourself through the `layout` prop.

A `custom` widget with no matching renderer renders nothing and warns in
development — the package can't know the shape of its `data`.

## Events

Every event carries `demoId` and `timestamp`. The types:

| `type` | Also carries | When |
|---|---|---|
| `ready` | `stepIds` | Once, after the config parses and the player mounts. |
| `step_view` | `stepId`, `stepIndex` | On mount and on every step change. |
| `complete` | — | The demo reaches its end. |
| `cta_click` | `stepId`, `action`, `widgetId?`, `annotationId?` | A viewer clicks an authored button. |
| `form_submit` | `stepId`, `widgetId`, `fields` | A form widget is submitted. |
| `embed_message` | `stepId`, `widgetId`, `data` | An `embed` widget's iframe posts a message. |
| `custom` | `name`, `payload?`, `stepId?`, `widgetId?`, `annotationId?` | Emitted by a renderer you registered. |

`fields` is `[{ id, label, value }]`, in the authored field order, with the
author-facing label resolved for you.

```tsx
<Demo
  src="/demos/onboarding/"
  onEvent={(event) => {
    if (event.type === 'form_submit') {
      analytics.track('demo_lead', { fields: event.fields });
    }
  }}
/>
```

The package is headless about this: it emits, you decide. Nothing is sent
anywhere unless a form widget has a `submitTo` URL (see
[authoring.md](authoring.md#form-submissions)).

A demo inside an iframe relays the same events to the page that frames it —
see [embedding.md](embedding.md#listening-for-events-from-an-embedded-demo).

## `<DemoModal>`

For a pop-up in a React app, don't load `embed.js`. `DemoModal` draws the
same overlay but renders the player in-process through a portal, so there
is no iframe and no second copy of the runtime:

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

Props: `open`, `onClose`, `children`, and `label` for the dialog's
accessible name (default `'Demo'`). Escape and a click on the scrim call
`onClose`. The children mount only while open, so the demo starts from the
beginning each time; the page stops scrolling while open, and focus goes
back where it was on close.

## The static page contract

`player.js` is the whole player with React bundled in. It mounts itself
from the page, so a page needs four things:

```html
<link rel="stylesheet" href="./player.css" />
<script id="demo-config" type="application/json">{ /* demo.config.json */ }</script>
<div id="root"></div>
<script src="./player.js"></script>
```

`player.css` is this package's `styles.css` under another name; `build`
copies it. The script tag must have `id="demo-config"` and
`type="application/json"`. There is no fetch and no manifest: the config is
inline, media paths stay relative, and the browser resolves them against
the page — which is why the page lives in the demo folder next to
`assets/`.

With no `#demo-config` element, or a config that fails validation, the
player renders an error card naming what went wrong instead of a blank
page.

Two query parameters are read from the page URL:

- `?autoplay=1` starts playback as soon as the player is ready.
- `?render=1` is for an exporter driving the page. It implies autoplay.

The player also applies the demo-level canvas background (`background` or
`backgroundColor` in the config) to `#root`, and injects the active theme's
scoped CSS into `<head>`.

### `window.__demo`

Once mounted, the player publishes a small contract so a host page or an
exporter can detect readiness, drive the player and wait for the end:

```ts
window.__demo = {
  ready: true,       // set when the player has parsed the config and mounted
  complete: false,   // flips to true when the demo reaches its end
  stepIds: string[], // every step id, in order
  controls,          // play(), pause(), next(), prev(), seekToStep(id), …
  demo,              // the validated config
};
```

It appears when the player mounts, so poll for it rather than reading it on
load:

```js
await new Promise((resolve) => {
  const tick = () => (window.__demo?.ready ? resolve() : setTimeout(tick, 50));
  tick();
});
window.__demo.controls.seekToStep('s3');
```

### Render modes

The page the CLI writes reads `?embed=inline` and renders the player alone:
no page bar, no canvas, transparent background, the player filling the
frame. That is the page's own CSS, not `player.js`, so a page you assemble
by hand from the four lines above gets the plain layout only.

The same page posts `interactive-demo:close` to its parent on Escape and
relays every runtime event as `interactive-demo:event`.
[embedding.md](embedding.md) has the iframe, its sizing, and the pop-up
loader.

## Themes and fonts

A theme is four tokens — `primary`, `secondary`, `font`, `radius` — plus
optional CSS scoped to `[data-demo-theme="<id>"]`. Two presets ship:
`default` and `mono`.

The tokens cascade, each layer winning over the one before it:

1. the preset named by `themeId`, or by `config.theme.preset`;
2. the `themeTokens` prop;
3. `config.theme.tokens`.

The result lands on the root element as `--demo-primary`,
`--demo-secondary`, `--demo-font` and `--demo-radius`, with
`--demo-primary-fg` computed for readable text on the primary colour.
Everything else is a CSS-level default in `styles.css`, so host CSS can
override it, scoped to `[data-demo-theme="mono"]` if you want one theme
only.

A preset's scoped CSS is a separate string. `player.js` injects it for you
on a static page. A React host that selects a preset injects it itself:

```ts
import { resolveDemoTheme } from '@inkly-org/interactive-demo/themes';

const { themeId, css } = resolveDemoTheme({ demoTheme: { preset: 'mono' } });
```

### Fonts

`styles.css` loads no fonts. Without `fonts.css` the UI falls back to the
system sans and mono, and cover steps get a flat fill. Opt in with one more
import:

```ts
import '@inkly-org/interactive-demo/styles.css';
import '@inkly-org/interactive-demo/fonts.css';
```

`fonts.css` declares two faces — Inter and Geist Mono, variable weights,
SIL Open Font License — pointing at `dist/fonts/*.woff2` in this package,
and the default theme's watercolor cover backdrop from
`dist/backgrounds/`. Both URLs are relative to the stylesheet, so it works
wherever you serve the files from, and nothing is fetched from a third
party. The display face named first in the default theme's heading stack is
not shipped; Inter stands in for it.

The CLI includes the same file as `player-fonts.css` next to `player.css`,
with `fonts/` and `backgrounds/` beside it. Delete those from a built
folder and you get the fallbacks.

## The schema

```ts
import { DemoSchema, parseDemo, DEMO_CONFIG_SCHEMA_URL } from '@inkly-org/interactive-demo/schema';

const demo = parseDemo(JSON.parse(raw)); // throws a ZodError on a bad config
```

`parseDemo` is `DemoSchema.parse`. Every sub-schema is exported next to it
(`StepSchema`, `AnnotationSchema`, `WidgetSchema`, `ChromeSchema`, …)
along with the inferred types, so you can build a config in TypeScript and
have the compiler check it.

`annotations[]` and `widgets[]` are deliberately tolerant: a known `type`
is validated strictly, and an unknown one parses and is skipped by the
player, so a config written for a newer runtime still plays.

The build generates `dist/schema/demo.config.json` from `DemoSchema`, so
the published JSON Schema cannot drift from what the player accepts. Point
an editor at it for autocompletion and inline validation:

```json
{ "$schema": "https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo/dist/schema/demo.config.json" }
```

`DEMO_CONFIG_SCHEMA_URL` holds that string. A version-pinned copy lives at
`…/@inkly-org/interactive-demo@<version>/dist/schema/demo.config.json`.

[schema.md](schema.md) is the human-readable field reference, generated
from that same document — so it is the same source, formatted for reading.
