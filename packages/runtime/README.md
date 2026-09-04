# @inkly-org/interactive-demo

The React player and the demo schema for interactive product demos.

A demo is a `demo.config.json` file: an ordered list of steps, each a
screenshot (`image`) or a screen recording (`video`) with hotspots,
captions and an optional voiceover, plus cover screens made of widgets.
The schema is defined with Zod and exported from `./schema`.

## Install

```sh
npm install @inkly-org/interactive-demo react react-dom
```

## Use as a React component

```tsx
import { Demo } from '@inkly-org/interactive-demo';
import '@inkly-org/interactive-demo/styles.css';
import config from './demo.config.json';

export function ProductTour() {
  return <Demo config={config} />;
}
```

`Demo` validates `config` with `DemoSchema` and renders the player. Props of
note: `themeId`, `themeTokens`, `assets` + `resolveAssetUrl` (to resolve
`asset:<id>` references), `onEvent` (step views, completion, CTA clicks,
form submits), `layout` and `controls`.

## Use the self-contained player on a static page

`player.js` bundles React and the player. A page mounts a demo with two
JSON script tags and a root element:

```html
<link rel="stylesheet" href="./player.css" />
<script id="demo-config" type="application/json">{ /* demo.config.json */ }</script>
<script id="demo-assets" type="application/json">[ /* assets.json → assets[] */ ]</script>
<div id="root"></div>
<script src="./player.js"></script>
```

`demo-assets` is optional. `asset:<id>` references resolve to the entry's
`publicUrl` when set, otherwise to `./assets/<file>` relative to the page.
The CLI's `build` command writes exactly this layout.

## Schema

```ts
import { DemoSchema, parseDemo } from '@inkly-org/interactive-demo/schema';
```

`DEMO_CONFIG_SCHEMA_URL` is the `$schema` URL for editor autocompletion.

## Themes

```ts
import { resolveDemoTheme, demoThemePresets } from '@inkly-org/interactive-demo/themes';
```

One preset ships (`mono`). A preset is four tokens (primary, secondary,
font, radius) plus optional scoped CSS.
