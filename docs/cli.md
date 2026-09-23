# The CLI

`interactive-demo` scaffolds a project, records a demo from a live web app,
previews it with the editor, validates it and builds static files. Publishing
to the hosting service is optional; everything else works offline.

```sh
npx @inkly-org/interactive-demo-cli init my-demos
cd my-demos && npm install
npx interactive-demo dev
```

`init` writes a `package.json` with the CLI as a devDependency, so inside a
project you can run `npx interactive-demo <command>`, or the `npm run dev`,
`npm run validate` and `npm run build` scripts it sets up.

Most commands look for the project root: the nearest parent directory with an
`interactive-demo.json` in it. `dev` is the exception — point it at a bare
demo folder and it serves that folder alone.

Requirements: Node.js 20 or newer. `capture` also needs Chrome, and `ffmpeg`
on `PATH` for video steps.

## Conventions

- **Demos live at `demos/<slug>/`**, each with a `demo.config.json` and an
  `assets/` folder next to it. The config references media by relative path
  (`assets/screen-001.png`). There is no manifest to keep in sync — the file
  on disk and the path in the config are the whole story.
- **`__demo` is reserved.** It is the route prefix the dev server uses for the
  editor and the player files, so no demo can be called `__demo`. `assets`,
  `api` and `c` are reserved too. Slugs are kebab-case: lowercase letters,
  digits and hyphens, starting and ending with a letter or digit.
- **Exit codes** are 0 on success and 1 on failure. `capture start` exits 130
  if you interrupt it while it is setting up.
- `-h` / `--help` works on every command; `interactive-demo help <command>`
  prints the same text. `-v` / `--version` prints the version.

## init

Scaffolds a new project, or adds a demo to one you already have.

```sh
interactive-demo init <name> [--theme <preset>] [--no-starter-demo]
interactive-demo init --demo <slug> [--from <dir|zip>]
interactive-demo init --from <dir|zip>
```

| Flag | Default | What it does |
|---|---|---|
| `--theme <preset>` | `default` | Theme preset id written to `interactive-demo.json`. `default` and `mono` ship. |
| `--no-starter-demo` | off | Scaffold an empty project with no `getting-started` demo. |
| `--demo <slug>` | — | Inside an existing project: add `demos/<slug>/`. Optional when `--from` is given. |
| `--from <dir\|zip>` | — | Import an existing demo folder, or a `.zip` of one, instead of scaffolding. |

`init <name>` creates `<name>/` and writes `README.md`, `.gitignore`,
`package.json`, `interactive-demo.json` and — unless you pass
`--no-starter-demo` — `demos/getting-started/` with a three-step demo (an
intro cover, one content step on a placeholder SVG, an outro cover) and the
placeholder in `assets/`. It prints the next steps.

`init --demo <slug>` writes `demos/<slug>/demo.config.json` and
`demos/<slug>/assets/placeholder.png`, mints the demo's permanent id and
prints it. If the project file keeps a `demos` list, the new slug is appended
to it so the ordering stays explicit.

`--from` copies an existing demo folder in wholesale — the config and
everything beside it, skipping `node_modules/` and `.git/`. The source must
hold a schema-valid `demo.config.json`. Its id is kept if it is a valid
12-character id, and re-minted if not.

The source may also be a `.zip` of such a folder, which is what the capture
extension downloads. It is unpacked to a temporary directory and imported the
same way, so there is no unzip step; a zip that wraps the demo in a
`<slug>/` folder and one that holds `demo.config.json` at its root both work.

Without `--demo`, the slug is taken from the source name — `onboarding.zip`
becomes `demos/onboarding/`. Pass `--demo` to choose a different one.

```sh
interactive-demo init acme-demos --theme mono
cd acme-demos
interactive-demo init --demo billing
interactive-demo init --demo onboarding --from ~/captures/onboarding
interactive-demo init --from ~/Downloads/acme-3f91b2.zip
```

Common failures:

- The target directory already exists. `init` refuses rather than merging into
  it — pick another name or remove it.
- The name is not a valid slug, or is one of the reserved words. The error
  names the rule it broke.
- `--demo` outside a project. Run `init <name>` first, or `cd` into the
  project.
- `--demo <slug>` where `demos/<slug>` already exists.

## dev

Starts the local preview server and the editor. Edits made in the editor are
written straight to the files in your repo; edits you make in an editor of
your own hot-reload the page.

```sh
interactive-demo dev [<path>] [--port <n>]
```

| Flag | Default | What it does |
|---|---|---|
| `--port <n>`, `-p <n>` | `3000` | Preferred port. If it is taken, the next free port is used. Must be 1–65535. |

`<path>` is a project root, or a bare demo folder (a directory with a
`demo.config.json` and no project file above it). It defaults to the current
directory. A bare folder is wrapped in an in-memory project so an exported
capture previews with no setup.

The server binds to `127.0.0.1` only — it is not reachable from other machines
on your network. What it serves:

| Route | What it is |
|---|---|
| `/` | An index of every demo in the project, with an Edit link each. |
| `/<slug>/` | The demo page — the same four-line page `build` writes. |
| `/__demo/editor/` | The editor. `/__demo/editor/#/<slug>` opens one demo. |
| `/<slug>/assets/…` | The demo's media, served from `demos/<slug>/assets/`. |
| `/<slug>/player.js`, `player.css`, `player-fonts.css` | The player, from the installed runtime package. |
| `/__demo/player.js`, `/__demo/player.css`, `/__demo/player-fonts.css` | The same files at a fixed path, for the editor shell. |
| `/__demo/demos`, `/__demo/demo/<slug>` | JSON: the demo list, and one demo's config. |

On startup it prints the URL, the project name, the demo count, up to ten demo
URLs and the editor URL.

It writes to disk in one case: a `demo.config.json` with no id, or with an id
that another demo already uses, gets one minted and saved. The line
`[dev] healed missing id:` or `[dev] re-minted duplicate id:` tells you which
file changed. Commit the result — the published URL is keyed on that id.

A demo whose config fails to parse does not take the server down. It stays
routable and `/` and `/<slug>/` explain the problem; fixing the file reloads
it back in.

Common failures:

- No `interactive-demo.json` in the directory or any parent, and no
  `demo.config.json` in the directory you pointed at.
- A demo folder named with a reserved slug, or one that isn't kebab-case.
  `dev` refuses to start and names the folder.
- `Player bundle not found` (HTTP 503 on `player.js`). The runtime package
  isn't resolvable — run `npm install`, or build the runtime if you are
  working in this repo's workspace.
- The file watcher only reacts to `demo.config.json`. Dropping a new file into
  `assets/` doesn't trigger a reload, but the file is served as soon as
  something asks for it.

## capture

Records a click-through of a live web app as a demo. `start` opens the URL in
Chrome and arms a recorder; every click you make records one step — a
screenshot of the page you clicked on, with a pointer on the element you
clicked. Clicking after scrolling or typing records that motion as a short
video step instead. `stop` writes the demo folder.

**Chrome is headed by default.** You are meant to click through the product
yourself, so a visible window is the point. `--headless` opts out, and is only
useful when something else is driving the page (a script over CDP, or
`--connect-to-browser`).

```sh
interactive-demo capture start <url> [--name <name>] [options]
interactive-demo capture stop [--session <id>] [--out <dir>]
interactive-demo capture cancel [--session <id>]
interactive-demo capture status [--session <id>]
interactive-demo capture undo [--session <id>]
interactive-demo capture profiles
interactive-demo capture login <url> [--profile <name>]
```

Every subcommand prints JSON, so a script or an agent can drive it as easily
as a person.

| Flag | Default | What it does |
|---|---|---|
| `--name <name>` | the page host | Demo title. |
| `--session <id>` | the only running session | Which session to act on. Required once two are running. |
| `--out <dir>` | the project's `demos/` | With `stop`: write the demo at `<dir>/<slug>` instead. |
| `--browser <path>` | an installed Chrome, or `CHROME_PATH` | Chrome/Chromium binary. |
| `--connect-to-browser <url>` | — | Attach to an already-running Chrome DevTools endpoint instead of launching one. |
| `--width <n>` | `1440` | Viewport width. Must be ≥ 320. |
| `--height <n>` | `900` | Viewport height. Must be ≥ 240. |
| `--window-size <w>x<h>` | — | Shortcut for `--width` + `--height`. |
| `--timeout <ms>` | `120000` | Page load timeout. Must be ≥ 1000. |
| `--headed` | on | Visible Chrome window. Wins over `--headless` if both are passed. |
| `--headless` | off | Headless Chrome. |
| `--profile <name>` | — | Reuse a persistent Chrome profile, so a login survives between captures. |
| `--keep-profile` | off | Keep the temporary profile after `stop`/`cancel`. |
| `--no-video` | video on | Still images only; never build video steps. |
| `--no-zoom` | zoom on | Don't zoom screenshot steps in on the clicked point. |
| `--compress-images` | off | Re-encode screenshots to WebP. |

A normal session:

```sh
interactive-demo capture start https://app.example.com --name "Onboarding"
# click through the product in the Chrome window that opens
interactive-demo capture status    # how many steps so far, and their labels
interactive-demo capture undo      # drop the last one
interactive-demo capture stop      # writes demos/onboarding/
```

`start` prints the session id, the browser it launched, the tab it opened and
whether video is on. It returns as soon as the recorder has armed; recording
continues in a detached listener process, which is why `start` doesn't block
your terminal. That process is `capture-listener`, an internal entry point —
it has no place in the command surface and you never invoke it yourself.

`stop` writes `demos/<slug>/` (or `<out>/<slug>/`) with `demo.config.json` and
readable file names under `assets/`: `screen-001.png`, and for a video step
`screen-002.webm` plus `screen-002-poster.png`. With `--compress-images` the
stills are `.webp`. The slug comes from the demo name, with `-2`, `-3` … if it
is taken. It then tears the session down — Chrome, the listener and the
scratch files — and prints the demo folder, the step count and one label per
step so you can read the flow back without opening the JSON.

`cancel` tears the session down without writing anything. `undo` drops the
most recent step from a live session. `status` reports the recorder state and
the steps so far without touching the browser; `browserAlive: false` means the
window has gone and further clicks record nothing.

Sessions, in-progress frames and persistent profiles live under
`~/.interactive-demo/capture/`. Set `INTERACTIVE_DEMO_CAPTURE_HOME` to move
them.

### Video steps and ffmpeg

Video needs `ffmpeg` on `PATH`. `start` checks once, up front: if ffmpeg is
missing it prints a warning to stderr, reports `videoDisabledReason` in its
JSON, and records every step as a still. Nothing is lost — a click that would
have been a clip becomes a screenshot. Install ffmpeg to get video steps, or
pass `--no-video` to silence the warning. A motion burst too brief to make a
readable clip also falls back to a still.

### Logging in to the app you are capturing

Some sign-ins — OAuth especially — are rejected in an automated browser even
when a human does the clicking. `capture login` opens an ordinary Chrome
window (no debugging port, no automation flags) on a persistent profile:

```sh
interactive-demo capture login https://app.example.com/login --profile acme
# sign in there; you don't have to close the window
interactive-demo capture start https://app.example.com --profile acme
```

The cookies persist in the profile, so later captures with the same
`--profile` skip the login. A bare name maps to a folder under the capture
home; a value with a path separator is used as a directory. `capture profiles`
lists what you have, with whether each one has cookies yet. `capture login`
cannot be combined with `--connect-to-browser` — an attached browser owns its
own profile.

Common failures:

- `No Chrome binary found.` Pass `--browser /path/to/chrome` or set
  `CHROME_PATH`.
- `capture start` needs an `http(s)` URL.
- The recorder fails to arm within 15 seconds. The session is unusable — every
  click would be dropped silently — so `start` fails loudly and prints the
  tail of the listener and Chrome logs.
- `stop` with no steps captured exits 1 and cleans up. Each step comes from a
  click on the page; the initial page load is not a step.
- `stop` outside a project. Run `init` first, or pass `--out <dir>`.
- Two sessions running and no `--session <id>`. The error lists the ids.

## validate

Checks the project and every demo in it: schema, media paths and slugs. Run it
in CI before `build`.

```sh
interactive-demo validate [--json] [--strict]
```

| Flag | Default | What it does |
|---|---|---|
| `--json` | off | Print the result as JSON (`ok`, `projectRoot`, `errors`, `warnings`, `issues`). |
| `--strict` | off | Treat warnings as failures. |

Plain output is one `ERROR`/`WARNING` line per issue, then a summary line.
Warnings print on a passing run too, so you never need a second `--json` pass
to read them. Exit 1 if there are errors, or under `--strict` if there are
warnings.

Errors:

- An unknown theme preset, in the project file or in a demo.
- A `brand.logo` that doesn't exist, or that escapes the project root.
- A demo folder whose slug is invalid or reserved.
- A media path with no file behind it, or one that escapes the demo folder.
- An `asset:` pointer. That form is from before media-by-path and nothing
  resolves it any more — use a path under `assets/`, or an absolute URL.

Warnings:

- A demo config with no id, or an id that isn't a 12-character URL-safe one.
  `dev` and `publish` write one; the hosted URL is keyed on it.
- Two demos sharing one id, usually a hand-copied folder. Run `dev` to
  re-mint.
- The project's `demos` list naming a demo that isn't there.

## build

Writes one self-contained static folder per demo. Deploy it to any static
host; nothing in it depends on where it is served from.

```sh
interactive-demo build [--out <dir>]
```

| Flag | Default | What it does |
|---|---|---|
| `--out <dir>` | `dist` | Output folder, relative to the project root. |

Per demo, under `<out>/<slug>/`:

```
index.html          the page: stylesheet, the #demo-config script tag, #root, player.js
player.js           the player, React bundled in
player.css
player-fonts.css    plus fonts/ and backgrounds/, when the runtime ships them
assets/…            the demo's media, copied from demos/<slug>/assets/
brand/…             the project's logo, if brand.logo is a project file
```

`<out>/embed.js` — the pop-up loader — is written once at the output root,
next to the demo folders. The command prints what it built plus an iframe
snippet and a pop-up snippet.

**`build` deletes the output folder first.** Don't point `--out` at a
directory holding anything you want to keep.

Common failures:

- Not inside a project.
- `Player bundle not found` — the runtime package isn't resolvable next to the
  CLI. `npm install`, or build the runtime in the workspace.
- A media path with no file behind it isn't caught here; `assets/` is copied
  as-is and the page 404s at runtime. Run `validate` first.

## embed

Prints the embed snippet for a demo's **hosted** deployment. For embedding a
built static folder, see [embedding.md](embedding.md) — you don't need this
command for that.

```sh
interactive-demo embed [<path>|--demo <slug>] [--mode inline|popup] [--label <text>] [--json]
```

| Flag | Default | What it does |
|---|---|---|
| `--demo <slug>` | — | Select the demo by slug. |
| `--mode <mode>` | `inline` | `inline` prints a sized iframe; `popup` prints the loader plus a trigger button. |
| `--label <text>` | `Try the demo` | Button text in popup mode. |
| `--json` | off | Print the snippets as JSON. |

`<path>` is a demo folder (`demos/intro`) or a slug. You can leave it out when
the project has exactly one demo.

Inline mode prints the container-query iframe wrapper sized from the demo's
own aspect ratio and header height, so the player never letterboxes. Popup
mode prints the loader and a button for HTML, React, Next.js, Vue and Svelte.

You must be logged in: the snippet points at a hosted URL. If the demo has
never been deployed, `embed` publishes it first and says so.

## login

Logs in to the hosting service, so `publish` and `embed` have a token to use.
Only these two commands need it — `init`, `dev`, `capture`, `validate` and
`build` never talk to a server.

```sh
interactive-demo login [--token <token>] [--no-open] [--status] [--json]
interactive-demo logout
```

| Flag | Default | What it does |
|---|---|---|
| `--token <token>` | — | Save an API token directly and skip the browser. `INTERACTIVE_DEMO_API_TOKEN` does the same. |
| `--no-open` | browser opens | Print the login URL instead of opening a browser. |
| `--status` | — | Show where the credentials live and whether the token still works. |
| `--json` | off | With `--status`: print it as JSON. |
| `--local` | off | Point at a local dev build of the hosting service (`http://localhost:3000`). |

With no `--token`, the CLI starts a callback server on `127.0.0.1`, prints the
login URL and opens it. Finish in the browser and the CLI exchanges the
result for an API token. It gives up after two minutes.

Credentials go to `~/.interactive-demo/credentials.json`, written owner-only
(mode 0600). The file belongs to this CLI alone. `logout` deletes it.

`--status` prints the credentials path, the project root, the API origin,
whether a token is configured, and whether the server still accepts it
(`ok`, `failed` or `skipped`):

```sh
interactive-demo login --status
```

`INTERACTIVE_DEMO_API_BASE` overrides the origin in every mode, including
`--local`.

Common failures:

- `Timed out waiting for browser login.` Nothing came back within two
  minutes — run it again, or use `--no-open` and open the URL yourself.
- With `--token`, a token the server rejects is still saved, and the command
  says `(token saved without online verification)`. Check it with `--status`.

## publish

Uploads a demo's media, then freezes the config as a hosted deployment.
Publishing is optional — `build` gives you files you can host yourself.

```sh
interactive-demo publish [<path>|--demo <slug>] [--new] [--json]
interactive-demo publish --list [--json]
```

| Flag | Default | What it does |
|---|---|---|
| `--demo <slug>` | — | Select the demo by slug. |
| `--new` | off | Mint a new hosted URL instead of updating the demo's existing deployment in place. |
| `--list` | — | Show the hosted URL of every demo in the project. |
| `--json` | off | Print machine-readable JSON. |

What it does, in order: hashes every file the config references and uploads
each one, rewrites those relative paths to the returned hosted URLs in a
**frozen copy** of the config, and sends that copy. Nothing on disk changes —
the paths in your `demo.config.json` stay relative. The one exception is a
demo with no id: the minted id is written to `demo.config.json` first, because
the hosted URL is keyed on it and the next publish has to find the same id to
update the same deployment. Commit it.

By default a re-publish **replaces** the existing deployment, so an embed
pointing at it picks up the new version. `--new` mints a separate URL and
leaves the old one serving the old demo; when that would orphan an existing
deployment, the command warns after the fact.

On success it prints the URL and an iframe snippet. `--list` prints one line
per demo with its URL or `(not published)`.

Common failures:

- `Not logged in.` Run `interactive-demo login` first.
- A config that references media with no local bytes. The command names every
  missing file and refuses — the hosted page can't see your demo folder.
- More than one demo in the project and no selector. Pass a path or
  `--demo <slug>`; the error lists the slugs.
- A project-relative `brand.logo`. `publish` doesn't upload project files, so
  it drops the logo from the hosted brand and warns on stderr. Use an absolute
  `https://` URL in `interactive-demo.json` for a logo that should appear
  there. (`build` copies the file, so a locally hosted page is unaffected.)

## version

Prints the CLI version.

```sh
interactive-demo version
interactive-demo --version
```

A ` (local build)` suffix means the CLI is running from a source checkout
rather than an installed package.

## Environment variables

| Variable | Used by | What it does |
|---|---|---|
| `CHROME_PATH` | `capture` | Chrome/Chromium binary, when it isn't found automatically. |
| `INTERACTIVE_DEMO_CAPTURE_HOME` | `capture` | Where sessions, frames and profiles live. Default `~/.interactive-demo/capture`. |
| `INTERACTIVE_DEMO_CAPTURE_BROWSER_URL` | `capture` | Default for `--connect-to-browser`. |
| `INTERACTIVE_DEMO_API_TOKEN` | `login` | Same as `login --token`. |
| `INTERACTIVE_DEMO_API_BASE` | `login`, `publish`, `embed` | Override the hosting origin. |
