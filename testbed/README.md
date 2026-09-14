# Testbed

A place to exercise the whole product — CLI, dev server, editor, capture,
static build and both embeds — without publishing anything or touching a
hosted backend.

Build first; everything here drives the built CLI, not the sources:

```
npm run build
```

## The automated pass

```
npm run testbed              # every phase
npm run testbed -- --keep    # leave the scratch project on disk
npm run testbed -- --only editor,capture
npm run testbed -- --verbose
```

`testbed/run.mjs` scaffolds a throwaway project in a temp folder and checks it
phase by phase. Each phase pulls in the ones it needs, so `--only capture`
still scaffolds and builds a project to capture.

| phase | what it covers |
| --- | --- |
| `cli` | `version`, `help`, `init`, `init --demo`, id minting, `validate --strict` |
| `dev` | the preview server: the index, a demo page, the page contract, `?embed=inline`, `/__demo/*`, 404s |
| `editor` | the editor bundle plus its API: read files, save a config to disk, upload/serve/delete an asset, embed snippets, path traversal |
| `build` | `dist/<slug>/` contents, the page contract, relative media paths, `embed.js`, `--out` |
| `host` | the stand-in website below: injected demo list, `embed.js`, the form endpoint |
| `capture` | a headless Chrome capture driven over CDP: record clicks, `stop`, import with `init --demo --from`, then validate |
| `failures` | `publish` without credentials, a missing media file, a legacy `asset:` pointer, a bad port |

The `capture` phase needs Chrome (or `CHROME_PATH`) on the machine. It fails
with a clear message where there is none; skip it with
`--only cli,dev,editor,build,failures`.

## The stand-in website

`testbed/host/` is what "your site" would be: a plain page that embeds a built
demo both ways and shows what comes back out of it.

```
node packages/cli/dist/cli.js build          # inside any project
node testbed/host/serve.mjs --dist examples/getting-started/dist --port 4321
open http://localhost:4321/
```

It gives you:

- the **inline iframe**, sized the way `interactive-demo embed` sizes it;
- a **pop-up** button wired to `embed.js` and `InteractiveDemo.open()`;
- a live log of the **runtime events** the framed player relays to the host
  (`interactive-demo:event`);
- a **form endpoint** at `/api/form` and a panel showing what it received, so a
  form widget's `submitTo` can be tested end to end.

The page lists what to look for at the bottom — the parts that only a browser
can show (letterboxing, scroll locking, the overlay ratio).

## Re-shooting the self-demo

`examples/self-demo` is a walkthrough of this product whose screens are all
real. `testbed/shoot.mjs` produces them:

```
npm run build
node testbed/shoot.mjs           # writes examples/self-demo/demos/product-tour/assets/
node testbed/shoot.mjs --keep    # and leave the throwaway project behind
node testbed/shoot.mjs --out /tmp/shots   # somewhere else, to compare first
```

It scaffolds a project, records `testbed/app/` with the real `capture` command
(clicks driven over CDP), writes the capture up, builds it, serves it from the
stand-in site, and photographs the dev preview, the editor, the Share dialog
and both embeds — plus two terminal cards rendered from the transcripts of the
commands it just ran. Needs Chrome.

Element positions land in `metrics.json` beside the screens; the hotspot
coordinates in `demo.config.json` come from there. A re-shoot never touches the
copy or the hotspots, so check they still land where they should afterwards.

## The manual pass

The automated run covers everything reachable over HTTP and the filesystem.
These need eyes:

1. `interactive-demo dev` in a project, then `/__demo/editor/` — move a
   hotspot, edit a caption, check the file on disk changed, and open the Share
   dialog (its snippets come from the same code the `embed` command uses).
2. The host page above — resize the window and watch the inline frame keep the
   demo's ratio; open the pop-up and close it with Escape and with a click
   outside.
3. A headed capture of a real site:
   `interactive-demo capture start https://example.com`, click a few times,
   `interactive-demo capture stop`.

The editor rewrites `demo.config.json` when it opens a demo (it drops
`$schema` and reorders keys). After poking at the example project, restore it:

```
git checkout -- examples/
```
