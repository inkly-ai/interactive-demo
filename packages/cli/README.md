# @inkly-org/interactive-demo-cli

Author, preview and build interactive product demos from the command line.

```sh
npx @inkly-org/interactive-demo-cli init my-demos
cd my-demos && npm install
npm run dev                     # local preview + editor at http://localhost:3000
npm run build                   # static output under dist/
```

## Commands

| command | what it does |
|---|---|
| `init <name> [--theme <preset>] [--no-starter-demo]` | scaffold a new project |
| `init --demo <slug> [--from <dir>]` | add a demo to the current project (scaffold, or import a folder) |
| `dev [<path>] [--port <n>]` | local preview server with live reload; also serves the editor API |
| `validate [--json] [--strict]` | check the project file, every `demo.config.json` and asset reference |
| `build [--out <dir>]` | write a self-contained static folder per demo |
| `capture start <url>` … `capture stop` | record a click-through of a live web app as a demo (see below) |
| `version`, `help [command]` | |

`dev` also accepts a bare demo folder (one containing `demo.config.json`) and
serves it in place.

## Project layout

```
my-demos/
  interactive-demo.json          name, optional theme/tokens, optional demo order
  demos/
    <slug>/
      demo.config.json           the demo: steps, hotspots, captions, chapters
      assets.json                manifest of the demo's assets (id → file)
      assets/                    screenshots, recordings, audio
```

Demo configs reference assets as `asset:<id>`; the manifest maps each id to a
file under `assets/`.

## Page contract

Every demo page, in `dev` and in `build` output, is:

```html
<link rel="stylesheet" href="./player.css">
<script id="demo-config" type="application/json">…demo config…</script>
<script id="demo-assets" type="application/json">…assets manifest array…</script>
<div id="root"></div>
<script src="./player.js"></script>
```

`player.js` and `player.css` come from `@inkly-org/interactive-demo`. The
player resolves `asset:<id>` to the manifest entry's `publicUrl` (absolute
URLs are used as-is; local files become `./assets/<file>` next to the page).

## Static output

```
dist/<slug>/
  index.html
  player.js
  player.css
  assets/…
```

Deploy the folder as static files and embed a demo with an iframe:

```html
<iframe src="https://your-site/demos/<slug>/" width="960" height="600" allow="fullscreen"></iframe>
```

## Capture

`capture` records a click-through of a live web app: every click you make
becomes one step, a screenshot of the page you clicked on with a pointer on the
clicked element. Scrolling or typing right before a click is recorded as a short
video step instead.

```sh
npx interactive-demo capture start https://app.example.com --name "Onboarding"
# … click through the product in the Chrome window that opened …
npx interactive-demo capture stop
npx interactive-demo dev
```

`stop` writes the demo into the current project at `demos/<slug>/` (or into
`--out <dir>` when you are not inside a project). `status` shows the steps
recorded so far, `undo` drops the last one, `cancel` throws the session away.

Requirements:

- **Google Chrome** (or Chromium). An installed Chrome is found automatically;
  otherwise pass `--browser /path/to/chrome` or set `CHROME_PATH`.
- **ffmpeg** on `PATH`, only for video steps. Without it, motion is recorded as
  still images (pass `--no-video` to silence the notice).

Signing in first: OAuth providers reject sign-ins from an automated browser, so
sign in once in a plain Chrome window on a persistent profile, then capture with
that profile:

```sh
npx interactive-demo capture login https://app.example.com/login      # opens a normal Chrome; sign in, leave it open
npx interactive-demo capture start https://app.example.com --profile app-example-com
```

Profiles live under `~/.interactive-demo/capture/profiles/` (override the whole
capture home with `INTERACTIVE_DEMO_CAPTURE_HOME`). `capture profiles` lists them.
Nothing is uploaded anywhere: sessions, frames and profiles stay on your machine.

## Dev server routes

- `/` — a list of the project's demos
- `/<slug>/` — the demo page; `/<slug>/player.js`, `/<slug>/player.css`, `/<slug>/assets/<file>`
- `/__demo/demos`, `/__demo/demo/<slug>` — JSON used by the editor
- `/__demo/editor/demos/<slug>/files` (GET, PUT) and `/__demo/editor/demos/<slug>/assets?name=<file>` (POST) — the editor's read/write API

The `__demo` slug is reserved for these routes.
