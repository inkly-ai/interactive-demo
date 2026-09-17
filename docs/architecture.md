# Architecture

This is a map of the repo for someone who wants to change it. If you only want
to make a demo, read [authoring.md](authoring.md) and
[embedding.md](embedding.md) instead.

The repo is an npm workspace (`packages/*`) with three packages, two of which
are published. Node 20 or newer; `.nvmrc` pins 22 and CI runs 22.

## The three packages

### `packages/runtime` — the player and the schema

The React player, the demo schema, and the themes. Everything that decides what
a demo *is* lives here, so it can never disagree with itself.

- `src/schema/` — Zod schemas (`demo.ts`, `step.ts`, `annotations.ts`,
  `widget.ts`, `cover.ts`, `brand.ts`, `tokens.ts`, …). `DemoSchema` is the
  single source of truth: the CLI validates against it, the editor parses with
  it, and the JSON Schema under `docs/schema.md` is generated from it.
  `src/schema/reserved.ts` holds the reserved slugs and the slug rules.
- `src/engine/` — the playback state machine (`reducer.ts`) and the hooks that
  drive it (`usePlayer.ts`, `useTick.ts`, `useCaption.ts`, `useAudio.ts`).
- `src/ui/` — `Demo` (the component hosts render), `DemoModal` (the React
  pop-up), `CoverPreviewMini` (the thumbnail the editor's slide strip uses).
- `src/annotations/`, `src/primitives/`, `src/theme/`, `src/themes/` — hotspots,
  shared pieces, the stylesheet and design tokens, the theme presets.
- `src/player-entry.tsx` — the entry point for `player.js`, the standalone
  bundle with React compiled in that a built static page loads.
- `src/embed/` — the pop-up loader that becomes `dist/embed.js`, a 3 KB IIFE
  with no dependencies.

Published as `@inkly-org/interactive-demo`. React and `zod` are peer/runtime
dependencies for the library build; the `player.js` build bundles everything.

### `packages/cli` — the commands

`init`, `dev`, `capture`, `validate`, `build`, `login`, `publish`, `embed`.
Dispatch is in `src/main.ts`, one file per command under `src/commands/`.

Shared modules worth knowing before you touch a command:

- `src/project.ts` — reads `interactive-demo.json`, finds the project root,
  loads and orders demos.
- `src/page.ts` — renders the player page. `dev` and `build` both go through
  `renderDemoPage`, so the preview and the built output cannot drift. It also
  resolves the runtime's files (`player.js`, `styles.css`, `fonts.css`) out of
  the installed runtime package. The HTML template is
  `src/template/demo.html`.
- `src/media.ts` — the one walker over a config's media references (below).
- `src/fs-atomic.ts` — every write to a user's file goes through this.
- `src/capture/` — Chrome launching, CDP, the recorder injected into the page,
  and the session file. `capture start` spawns a detached listener
  (`dist/capture-listener.js`) which is the only writer of the session JSON;
  the foreground subcommands only read it.
- `src/dev/` — the editor's static file server (`editor-static.ts`) and its
  JSON API (`editor-api.ts`).
- `src/publish/` — the credentials file, the upload client, the hosting API
  calls and the embed snippets.

Published as `@inkly-org/interactive-demo-cli`, binary `interactive-demo`.
It depends on the runtime by range and resolves it at run time.

### `packages/editor` — the local editor

A Vite + React single-page app. Private; it is never published on its own. It
is built into the CLI package as `dist/editor/` and served by `dev` at
`/__demo/editor/`. Its base path is set in `vite.config.ts` and must match that
route.

`src/api.ts` talks to the dev server's editor API. `src/components/demo-editor/`
is the bulk of it — the stage, the slide strip, the inspectors, and `codec.ts`,
which writes edits back into the shape the author wrote (authored key order
kept, `$schema` stays first).

### How they depend on each other

```
runtime  ←──  cli      (dependency; resolved from node_modules at run time)
   ↑
   └──────── editor    (bundled in at editor build time)
                ↑
               cli     (copies packages/editor/dist into its own dist/editor)
```

The runtime depends on nothing in this repo. The CLI depends on the runtime as
an ordinary npm dependency and on the editor as a build artifact it copies. The
editor depends on the runtime, but not the way the CLI does: `vite.config.ts`
aliases `@inkly-org/interactive-demo` (and its `/schema` and `/themes`
subpaths) to `packages/runtime/src`, so the editor compiles the runtime's
**source** into its own bundle. That is deliberate — the editor and the player
can never disagree about the schema — and it has a consequence, below.

## The build graph

`npm run build` runs three builds in this order, and the order matters:

```sh
npm run build -w @inkly-org/interactive-demo         # 1. runtime
npm run build -w @inkly-org/interactive-demo-editor  # 2. editor
npm run build -w @inkly-org/interactive-demo-cli     # 3. cli
```

**1. Runtime.** `tsup` emits three separate builds from
`packages/runtime/tsup.config.ts`: the library (ESM + CJS + `.d.ts`, React and
zod external), `embed.js` (IIFE, minified) and `player.js` (IIFE, minified,
everything bundled). Then the package script copies `src/theme/styles.css` to
`dist/styles.css`, runs `scripts/copy-fonts.mjs` (the self-hosted woff2 files,
the cover backdrop, and `fonts.css` next to them), and runs
`scripts/emit-json-schema.mjs`, which imports the *built* schema entry and
writes `dist/schema/demo.config.json`.

**2. Editor.** `vite build` into `packages/editor/dist/`, with the runtime
source compiled in.

**3. CLI.** `tsup` builds `dist/cli.js` and `dist/capture-listener.js`, then its
`onSuccess` hook copies `src/template/` to `dist/template/` and
`packages/editor/dist/` to `dist/editor/`. That copy is **skipped silently**
when the editor has not been built — which would ship a CLI whose `dev`
serves no editor. The publish workflow checks for
`packages/cli/dist/editor/index.html` and a bundle under
`dist/editor/assets/` for exactly this reason.

### The consequence: rebuild everything after a runtime change

Two different copies of the runtime are in play at once.

- A **demo page** (in `dev` or in `build` output) loads `player.js` straight out
  of the runtime's `dist/`. Rebuilding only the runtime updates it.
- The **editor's preview** renders through the runtime code compiled into the
  editor bundle, which `dev` serves from `packages/cli/dist/editor/`.
  Rebuilding only the runtime does *not* update it.

So after changing anything in `packages/runtime/src`, run the full
`npm run build` before judging the editor. No server restart is needed; reload
the page. Building only the runtime and then wondering why the editor still
shows the old behaviour is the most common way to lose an hour here.

## How a demo flows through the system

A demo is a folder: `demo.config.json` plus the files it references. There is no
database and no build step between authoring and playing.

**1. Something writes the files.** Either `capture` — which drives Chrome over
CDP, turns each click into a content step with a hotspot on the clicked element,
and writes `demos/<slug>/` with readable file names — or you, by hand, or `init
--demo <slug>` for an empty one.

**2. `dev` serves them.** `packages/cli/src/commands/dev.ts` runs a Vite server
with one middleware in front of it. It walks `demos/`, watches for changes with
chokidar, and serves each demo at `/<slug>/` as the same page `build` writes.
Internal routes live under `/__demo/`. The editor is at `/__demo/editor/`.

**3. The editor edits them in place.** The editor is a client of the dev
server's JSON API under `/__demo/editor/demos/:slug/` — read the files, PUT a
config, POST/DELETE an asset. There is no separate save step and no database:
the PUT writes `demo.config.json` to disk, the watcher notices, the preview
reloads.

**4. `validate` checks them.** Parses every config against `DemoSchema`, checks
that each referenced media path has a file behind it and stays inside the demo
folder, checks slugs and theme presets, flags two demos sharing one `id`, and
rejects legacy `asset:` pointers. `--strict` makes warnings fail the run too;
`--json` prints the issue list.

**5. `build` emits a self-contained folder.** One `dist/<slug>/` per demo: the
page with the config inlined, the player files copied out of the runtime
package, and the demo's `assets/` alongside. Every URL inside is relative, so
the folder works wherever it is served from. `embed.js` is written once at the
output root.

**6. `publish` freezes a copy.** It hashes every file the config references,
uploads each unique hash once, and rewrites the paths in a *copy* of the config
to the returned URLs before sending it to the hosting service. The config on
disk keeps its relative paths; the only thing `publish` writes back is the
demo's minted `id`, because the published URL is keyed on it. Credentials come
from `login` and live in a `0600` file in your home directory, owned by this
CLI alone.

## Conventions

**`__demo` is reserved.** It is the internal route prefix for everything the
dev server owns that is not a demo (`/__demo/player.js`, `/__demo/demos`,
`/__demo/editor/…`), and therefore a slug no demo may use.
`packages/runtime/src/schema/reserved.ts` lists it alongside `assets`, `api` and
`c`, with the slug rules (kebab-case, no leading `_` or `.`). Both the CLI and
the dev server's route resolver call `validateDemoSlug`.

**Media is a path, not an id.** A config references its media by a path relative
to the demo folder — `assets/screen-001.png`. There is no manifest and no
indirection. An absolute URL or a data URI is left alone.

**`packages/cli/src/media.ts` is the single walker.** `collectMediaPaths(config)`
returns the relative paths a demo needs; `mapMediaRefs(config, visit)` returns a
new config with every reference replaced. `validate`, `build`, `publish` and the
dev server all go through it, so they cannot disagree about what a demo
references. If you add a field that can hold a media path — a new widget with an
image, say — add it to `mapMediaRefs` in the same commit, or `publish` will
quietly not upload it.

**The static page contract.** Every page the CLI renders is the same shape, and
any page with this shape works:

```html
<link rel="stylesheet" href="./player.css">
<link rel="stylesheet" href="./player-fonts.css">
<script id="demo-config" type="application/json">{ …demo.config.json… }</script>
<div id="root"></div>
<script src="./player.js"></script>
```

`player-fonts.css` is optional (drop it and you get system fonts and a flat
cover). The player mounts into `#root`, exposes `window.__demo`, and honours
`?autoplay=1`. Media paths resolve relative to the page, which is why the page
sits in the demo folder next to `assets/`. The contract is documented at the top
of `packages/cli/src/page.ts` and checked by the testbed's `dev` and `build`
phases.

## Tests

```sh
npm test        # vitest, all three packages
```

`vitest.workspace.ts` points at each package's own `vitest.config.ts`. At the
time of writing the suite is **55 files, 431 passing and 1 skipped**.

- `packages/runtime/tests/` (31 files, jsdom) — the reducer and the engine,
  rendering, keyboard control, timing, themes, the schema, hotspot clamping, the
  standalone `player.js` entry, the embed loader.
- `packages/cli/tests/` (15 files, node) — the commands against a temp project:
  scaffolding, validation, the rendered page, the media walker, the editor API,
  publish. These alias the runtime's **source**, so `npm test` does not need a
  built runtime.
- `packages/editor/src/**/*.test.{ts,tsx}` (9 files, jsdom) — the config codec
  round trip, the step factories, geometry, inspectors.

The editor's `codec.test.ts` pins the serializer against the real example
configs: both must round-trip byte for byte. If you change how configs are
written, that test is the one that will tell you.

## The testbed

`testbed/` is the whole-product pass that unit tests cannot give you: it drives
the *built* CLI, not the sources. Read [`testbed/README.md`](../testbed/README.md)
for the full account.

```sh
npm run build                 # required first — the testbed runs dist/cli.js
npm run testbed               # every phase
npm run testbed -- --only editor,capture
npm run testbed -- --keep     # leave the scratch project on disk
npm run testbed -- --verbose
```

`testbed/run.mjs` scaffolds a throwaway project in a temp folder and checks it
phase by phase: `cli`, `dev`, `editor`, `build`, `host`, `capture`, `failures`.
Each phase declares what it needs, so `--only capture` still scaffolds and
builds a project to capture. It runs every selected phase, prints a pass/total
summary per phase at the end, and exits 1 if any phase had a failed check.

Only `capture` needs a browser (Chrome, or `CHROME_PATH`). The rest run
offline with no browser at all, which is the subset CI runs:

```sh
npm run testbed -- --only cli,dev,editor,build,host,failures
```

The other pieces under `testbed/`:

- `testbed/host/` — a stand-in website that embeds a built demo both ways and
  shows the runtime events the framed player relays back, plus a form endpoint
  at `/api/form`. Run it with `node testbed/host/serve.mjs --dist <dir>`.
- `testbed/app/` — a stand-in product (five static screens) to point `capture`
  at, so you can record a demo without a real app.
- `testbed/lib/` — the CDP client, a headless-browser helper and the terminal
  card renderer.
- `testbed/shoot.mjs` — re-shoots `examples/self-demo` end to end. Needs Chrome.

## Checks a change has to pass

From the repo root, after `npm install`:

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

`lint` must report **0 errors**. It currently reports **2 warnings**, both
pre-existing and both in the runtime's engine:

```
packages/runtime/src/engine/useCaption.ts:19  react-hooks/exhaustive-deps
packages/runtime/src/engine/usePlayer.ts:177  react-hooks/exhaustive-deps
```

They are known and expected. Do not "fix" them incidentally — the hook
dependencies are the way they are on purpose. If your change adds a third
warning, that one is yours.

Note that `build` comes first. `typecheck` and `test` run against sources, but
the example projects and the testbed run the built CLI.

There is no Prettier config and no repo-wide formatter. Keep the formatting of
lines you are not otherwise changing.

## CI

One workflow runs on every push to `main` and every pull request:
`.github/workflows/ci.yml`. In order:

1. `npm ci`
2. `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`
3. **schema drift** — runs `node scripts/docs-schema.mjs` and then
   `git diff --exit-code -- docs/schema.md`. A diff fails the build.
4. `validate` and `build` of `examples/getting-started` with the built CLI
5. `validate --strict` and `build` of `examples/self-demo`
6. the browser-free testbed phases

The two publish workflows, `.github/workflows/publish-runtime.yml` and
`.github/workflows/publish-cli.yml`, are triggered by tags (`runtime-v*` and
`cli-v*`) or run by hand, never by a push to `main`. Each re-runs the full
build/typecheck/lint/test bar, checks the tag version matches the package
version, verifies the tarball actually contains its build output, and refuses to
overwrite a version already on npm. Release order and the required secret are in
[CONTRIBUTING.md](../CONTRIBUTING.md#releases).

## Generated docs

`docs/schema.md` is **generated — do not edit it by hand.** The chain:

1. `packages/runtime/scripts/emit-json-schema.mjs` runs as part of the runtime
   build and writes `packages/runtime/dist/schema/demo.config.json` from the Zod
   `DemoSchema`. It hand-writes the two `anyOf` wrappers for `annotations[]` and
   `widgets[]`, which `zod-to-json-schema` cannot render on its own.
2. `scripts/docs-schema.mjs` reads that JSON Schema and renders
   `docs/schema.md`.

So after changing anything under `packages/runtime/src/schema/`:

```sh
npm run build
node scripts/docs-schema.mjs
```

and commit the resulting `docs/schema.md` with your change. CI fails if you
forget. The JSON Schema is also what a `$schema` key in a `demo.config.json`
points at, so a schema change reaches editors' autocomplete the same way.

Everything else under `docs/` is written by hand.
