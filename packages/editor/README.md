# @inkly-org/interactive-demo-editor

The local editor for demo configs. It is a single-page React app that
`interactive-demo dev` serves at `/__demo/editor/`; it is built into the CLI
package and is not published on its own.

## What it does

- Slide strip, stage and inspectors for `demo.config.json`: add image or
  video steps, place and style hotspots, blur and text overlays, zoom
  regions, cover screens, captions and voiceover (record or upload).
- Every edit is written straight back to the demo folder through the dev
  server's JSON API, debounced. There is no draft or publish step.

Open it from the demo list at `http://localhost:3000/` ("Edit"), or directly
at `/__demo/editor/#/<slug>`.

## How it is served

`vite build` writes `dist/` with `base: '/__demo/editor/'`. The CLI's build
copies that folder to `packages/cli/dist/editor/`, and `dev` serves it with a
single-page fallback so hash routes work on reload.

## Local development

Run a project's dev server on port 3000 in one terminal:

```sh
interactive-demo dev
```

Then start the editor with hot reload in another:

```sh
npm run dev -w @inkly-org/interactive-demo-editor
```

Vite proxies the JSON API and demo assets to the dev server.

## API it depends on

All under `/__demo/editor/demos/<slug>/`, provided by `packages/cli/src/dev/editor-api.ts`:

| method | path | purpose |
|---|---|---|
| GET | `files` | text files of the demo (`demo.config.json`, `assets.json`) |
| PUT | `files` | write or delete files |
| GET | `assets` | manifest entries with a URL this server serves |
| POST | `assets?name=<file>[&kind=…]` | upload bytes to `assets/<file>` and register them |
| DELETE | `assets?name=<file>` | remove an asset and its manifest entry |

`GET /__demo/demos` lists the project's demos for the picker.
