---
name: interactive-demo
description: Build an interactive product demo from a real web app and publish it as a shareable link or an embed. Use when the user asks to record, capture, author, preview, validate, build, embed or publish a product demo or walkthrough with the interactive-demo CLI. Covers scaffolding a project, driving Chrome to capture a click-through, writing the demo up, and getting a URL.
compatibility: "Needs Node 20+ and the interactive-demo CLI (npx @inkly-org/interactive-demo-cli, bin `interactive-demo`). Capture drives a local Chrome or Chromium; video steps need ffmpeg on PATH. `login`, `publish` and `embed` need an account on the hosting service — everything else works offline."
license: MIT
allowed-tools: Bash
---

# interactive-demo

`interactive-demo` turns a click-through of a real web app into an interactive
demo: screenshots or short recordings, with hotspots and captions on top. The
output is either a link the hosting service serves, or a self-contained folder
you host yourself.

A **project** is a folder with an `interactive-demo.json`. Each **demo** is a
subfolder under `demos/` with a `demo.config.json` and its own `assets/`. The
config references media by relative path — there is no manifest to keep in
step.

## Setup check

```sh
npx @inkly-org/interactive-demo-cli version
npx interactive-demo <command> --help    # exact flags for one command
```

Run everything with `npx interactive-demo …` inside a project, or install the
CLI globally if you prefer. `--help` is the source of truth for flags; this
skill is the map.

## The shape of the job

Capture writes rough steps. It does not write a good demo — the captions,
hotspot copy, chapters and cover are yours. Plan on: capture, then read the
config, then edit it, then validate, then publish.

```sh
npx @inkly-org/interactive-demo-cli init acme-demos   # scaffold
cd acme-demos
npx interactive-demo capture start https://app.example.com --name "Onboarding"
# … drive the page …
npx interactive-demo capture stop                     # writes demos/onboarding/
npx interactive-demo validate
npx interactive-demo login && npx interactive-demo publish
```

## Command map

### Author

| Command | What it does |
|---|---|
| `interactive-demo init <name> [--no-starter-demo]` | Scaffold a project. |
| `interactive-demo init [--demo <slug>] --from <dir\|zip>` | Import an existing demo folder, or a `.zip` of one, into the project you are in. `--demo` is optional; the slug defaults to the source name. |
| `interactive-demo init --demo <slug>` | Add a starter demo to the project you are in. |
| `interactive-demo dev [<path>] [--port <n>]` | Local preview server (default port 3000). Also serves a browser editor at `/__demo/editor/`. |
| `interactive-demo validate [--json] [--strict]` | Check every demo against the schema and confirm each referenced file exists. `--json` for a machine-readable result. |

### Capture

Two ways to record, and the choice matters:

| Command | What it does |
|---|---|
| `interactive-demo capture start <url> [--name <n>]` | Launch Chrome and record. **Headed by default** — a real window opens and every click you make becomes a step. |
| `interactive-demo capture start <url> --connect-to-browser <cdp-url>` | Attach to a Chrome you are already running, with your own profile and sessions, instead of launching a fresh one. |
| `interactive-demo capture status` | Steps so far, with their labels. |
| `interactive-demo capture undo` | Drop the last step. |
| `interactive-demo capture stop [--out <dir>]` | Write `demos/<slug>/` and end the session. |
| `interactive-demo capture cancel` | Throw the session away. |
| `interactive-demo capture login <url> [--profile <name>]` | Sign in once in a persistent profile, then reuse it with `capture start --profile <name>`. Use this for OAuth/SSO rather than trying to automate a login. |

Worth knowing before you run it:

- The session keeps recording after `start` returns — your shell is free. It
  ends at `stop` or `cancel`.
- Each click becomes a content step: a screenshot taken at click time, a
  `cursor` annotation reading `Click on "<label>"` from the element's
  accessible name, and (on screenshot steps) a zoom toward the point.
- **The final page is not captured unless you click again.** Land on it and
  click something harmless, or you will be one screen short.
- Scrolling or typing right before a click is recorded as a short video step —
  but only with `ffmpeg` on PATH. Without it `start` warns on stderr, reports
  `videoDisabledReason` in its JSON, and you get stills instead.
- `--headless` exists but is only useful when a script drives the page, or with
  `--connect-to-browser`. There is nobody to click in a headless window.
- `--no-zoom`, `--no-video`, `--compress-images`, `--width`/`--height`
  (1440×900 by default) shape the output.

### Publish and embed

| Command | What it does |
|---|---|
| `interactive-demo login` | Connect to the hosting service (browser flow). `login --status` shows the credentials path, the project, the API origin, whether a token is set, and whether the server still accepts it. |
| `interactive-demo publish [<path>\|--demo <slug>] [--new] [--json]` | Publish and print the URL. Publishing again **updates the same URL**, so embeds keep working; `--new` mints a fresh one instead. |
| `interactive-demo publish --list` | Every demo in the project, with its URL or `(not published)`. |
| `interactive-demo build [--out <dir>] [--force]` | Write a self-contained folder per demo (default `dist/`) plus `embed.js`, to host anywhere. **Empties the output folder first** — only one it created (it leaves a `.interactive-demo-build` marker) or an empty one, unless you pass `--force`. |
| `interactive-demo embed [<path>\|--demo <slug>] [--mode inline\|popup] [--label <text>] [--json]` | Print the embed snippet for a published demo. Refuses one that was never published; run `publish` first. |

Publishing is the short path to a link — nothing to deploy. `build` is the
self-host path. The embed snippets are identical either way; only the origin
differs.

## Editing the demo

After `capture stop`, read `demos/<slug>/demo.config.json` and improve it. The
capture gives you structure, not writing.

- **Hotspot text** is the demo. Capture writes `Click on "Save"` into each
  step's `cursor` message; replace it with the reason someone would click
  Save.
- **Order and trim.** Delete steps that do not earn their place.
- **Chapters** group steps. The default player shows no chapter menu; they
  are targets for a `chapter` button action and for a custom layout.
- **The cover** is the first thing anyone sees; give it a real headline.
- **The look** is one theme. Change it with `theme.tokens` (`primary`,
  `secondary`, `font`, `radius`), or `tokens` in `interactive-demo.json` for
  every demo. There are no presets: delete a `theme.preset` or a project
  `theme` if `validate` warns about one.
- Run `interactive-demo validate` after editing. It catches a bad path or a
  broken reference before a viewer does.

Full field reference: `docs/schema.md` in the repo, generated from the schema
itself. https://docs.inklyai.dev/open-source/authoring explains the concepts.

## Gotchas that cost time

- `validate` failing on a media path almost always means a file was moved
  without updating `demo.config.json`. Paths are relative to the demo folder.
- Re-publishing updates the same URL; only `--new` mints another. Check
  `publish --list` before assuming a link is stale.
- `build` empties its output folder before writing. It refuses a non-empty
  folder it did not create; `--force` overrides that, so do not aim
  `--force` at anything you care about.
- `__demo` is a reserved slug and route prefix. So are `assets`, `api`, `c`.
- The editor writes `demo.config.json` back in the shape you wrote it — key
  order kept, `$schema` first, defaults you never set left out. Hand-authored
  configs survive a round trip through it.
