# @inkly-org/interactive-demo-cli

Author, preview and ship interactive product demos from the command line.

```sh
npx @inkly-org/interactive-demo-cli init my-demos
cd my-demos && npm install
npm run dev                     # local preview + editor at http://localhost:3000
npx interactive-demo publish    # a link you can share and embed
```

Prefer to host it yourself? `npm run build` writes a static folder per demo
under `dist/` for any static host. The embed snippets are the same either
way; only the origin differs.

## Commands

| command | what it does |
|---|---|
| `init <name> [--no-starter-demo]` | scaffold a new project |
| `init --demo <slug> [--from <dir\|zip>]`, `init --from <dir\|zip>` | add a demo to the current project: scaffold one, or import a demo folder or a capture `.zip` (the slug defaults to the source name) |
| `dev [<path>] [--port <n>]` | local preview server with live reload; also serves the editor and its API |
| `validate [--json] [--strict]` | check the project file, every `demo.config.json` and every media path |
| `capture start <url>` … `capture stop` | record a click-through of a live web app as a demo (see below) |
| `login [--token <token>] [--local] [--status]`, `logout` | save or remove the hosting service credentials |
| `publish [<path>\|--demo <slug>] [--new]`, `publish --list` | publish a demo and print its URL; list every demo's URL |
| `embed [<path>\|--demo <slug>] [--mode inline\|popup]` | print the embed snippet for a published demo (refuses one that never was — `publish` first) |
| `build [--out <dir>] [--force]` | write a self-contained static folder per demo |
| `version`, `help [command]` | |

`dev` also accepts a bare demo folder (one containing `demo.config.json`) and
serves it in place. [The CLI reference](https://docs.inklyai.dev/open-source/cli) has every flag.

## Project layout

```
my-demos/
  interactive-demo.json          name, optional tokens/brand, optional demo order
  demos/
    <slug>/
      demo.config.json           the demo: steps, hotspots, captions, chapters
      assets/                    screenshots, recordings, audio
```

A demo config references its media by path relative to the demo folder
(`assets/screen-001.png`). There is no manifest: the file on disk and the path
in the config are the whole story.

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

`stop` writes the demo into the current project at `demos/<slug>/` and adds
the slug to the project's `demos` list when it keeps one (or writes into
`--out <dir>` when you are not inside a project). `status` shows the steps
recorded so far, `undo` drops the last one, `cancel` throws the session away.

Requirements:

- **Google Chrome** (or Chromium). An installed Chrome is found automatically;
  otherwise pass `--browser /path/to/chrome` or set `CHROME_PATH`.
- **ffmpeg** on `PATH`, only for video steps. Without it, `start` says so
  (`videoDisabledReason` in its output) and every step is recorded as a still
  image (pass `--no-video` to silence the notice).

Signing in first: OAuth providers reject sign-ins from an automated browser, so
sign in once in a plain Chrome window on a persistent profile, then capture with
that profile:

```sh
npx interactive-demo capture login https://app.example.com/login      # opens a normal Chrome; sign in, leave it open
npx interactive-demo capture start https://app.example.com --profile app-example-com
```

Without `--profile`, `capture login` names the profile after the URL's host
(`app.example.com` becomes `app-example-com`).

Profiles live under `~/.interactive-demo/capture/profiles/` (override the whole
capture home with `INTERACTIVE_DEMO_CAPTURE_HOME`). `capture profiles` lists them.
Nothing is uploaded anywhere: sessions, frames and profiles stay on your machine.

## Publish

`publish` is the short path to a link: it puts a demo on the hosting service
and prints a URL you can send or embed straight away. Nothing to deploy.

```sh
npx interactive-demo login                 # opens the browser once; token saved to ~/.interactive-demo/credentials.json
npx interactive-demo publish               # the project's only demo, or …
npx interactive-demo publish demos/intro   # … one by path or --demo <slug>
npx interactive-demo publish --list        # every demo, with its URL or "(not published)"
npx interactive-demo embed --mode popup    # snippets for the published demo
npx interactive-demo logout
```

- A demo is keyed by the `id` in its `demo.config.json`. Publishing again
  updates the same hosted URL in place, so embeds keep working; `--new`
  mints a fresh URL instead.
- The media the config references is uploaded first, each unique file once,
  then a frozen copy of the config is published at `/p/<id>`. The paths in
  your `demo.config.json` stay relative.
- `login --token <token>` or `INTERACTIVE_DEMO_API_TOKEN` skips the browser.
  `INTERACTIVE_DEMO_API_BASE` points the CLI at another origin (for example a
  local build of the hosting service; `login --local` is shorthand for
  `http://localhost:3000`). `login --status` shows the credentials path, the
  origin and whether the token still works.
- The credentials file belongs to this CLI only and is written owner-only.

## Host it yourself

`build` writes one self-contained folder per demo. Nothing in it depends on
where it is served from.

```
dist/<slug>/
  index.html
  player.js
  player.css
  player-fonts.css               plus fonts/ and backgrounds/
  assets/…
  brand/…                        the project logo, when brand.logo is a project file
dist/embed.js                    the pop-up loader, once for the whole folder
```

Deploy the folder as static files and embed a demo with an iframe:

```html
<iframe src="https://your-site/demos/<slug>/?embed=inline" loading="lazy" allow="fullscreen"
        style="border:0; width:100%; height:min(900px, 80vh)"></iframe>
```

`?embed=inline` renders the player alone, without the page bar and canvas.
`build` prints the full snippets for you — this iframe sized to the demo, and
a pop-up button — from the same code as `embed` and `publish`. See [Sharing and embedding](https://docs.inklyai.dev/open-source/embedding).

`build` empties its output folder first, so it only does that to a folder it
created (it leaves a `.interactive-demo-build` marker) or an empty one. It
refuses any other non-empty folder unless you pass `--force`, and always
refuses the project folder itself.

### Page contract

Every demo page, in `dev` and in `build` output, is:

```html
<link rel="stylesheet" href="./player.css">
<link rel="stylesheet" href="./player-fonts.css">   <!-- optional: self-hosted fonts, with fonts/*.woff2 next to it -->
<script id="demo-config" type="application/json">…demo config…</script>
<div id="root"></div>
<script src="./player.js"></script>
```

`player.js` and `player.css` come from `@inkly-org/interactive-demo`. Media
paths in the config stay relative, so the browser resolves them against the
page, which sits in the demo folder next to `assets/`. Absolute URLs are used
as-is.

## Dev server routes

- `/` — a list of the project's demos
- `/<slug>/` — the demo page; next to it `player.js`, `player.css`, `player-fonts.css`, `fonts/`, `backgrounds/`, `brand/` and `assets/<file>`, laid out as `build` writes them
- `/__demo/player.js`, `/__demo/player.css`, `/__demo/player-fonts.css`, `/__demo/fonts/`, `/__demo/backgrounds/` — the same player files at a fixed path, for the editor
- `/__demo/editor/` — the editor; open a demo at `/__demo/editor/#/<slug>` (the `/` list links to it)
- `/__demo/demos`, `/__demo/demo/<slug>` — JSON used by the editor
- `/__demo/editor/demos/<slug>/files` (GET, PUT), `/__demo/editor/demos/<slug>/assets` (GET, and POST or DELETE with `?name=<file>`), `/__demo/editor/demos/<slug>/embed` (GET, the Share dialog's snippets) — the editor's read/write API
- `/__demo/editor/capabilities` (GET) — optional host features for the editor; `dev` offers none and answers `{}`

The `__demo` slug is reserved for these routes.
