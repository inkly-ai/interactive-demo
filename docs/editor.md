# The local editor

`interactive-demo dev` serves two things: each demo at `/<slug>/`, and a
visual editor for them at `/__demo/editor/`. The editor runs entirely on
your machine, and everything you change in it is written straight back into
the demo folder in your working tree. There is no draft, no database and no
account — the files are the only copy.

## Opening it

```sh
interactive-demo dev
```

The startup banner prints the editor URL alongside the demo URLs. The index
page at `/` lists every demo with an **Edit** link, and the direct URL for
one demo is:

```
http://localhost:3000/__demo/editor/#/onboarding
```

The slug after `#/` is the demo's folder name under `demos/`. `__demo` is
the reserved route prefix — the editor, the player files and the editor's
JSON API all live under it, and no demo slug may use it.

The editor ships prebuilt inside the CLI package. If you are working in a
clone and see a 503 telling you the editor is not built, run `npm run build`
at the repo root.

## The three panes

- **Left — the step strip.** Every step as a thumbnail, numbered, with a dot
  in the corner when it carries messages. Drag a thumbnail by its footer
  handle to reorder. The `+` between thumbnails inserts a step there; the
  `…` menu on a thumbnail opens step settings, duplicates it, or deletes it
  (a demo has to keep at least one step).
- **Middle — the stage.** The real player, running the demo you are
  editing, with drag handles on top. Click an annotation to select it; drag
  it to move it; drag the corner handles of an area or blur box to resize
  it. The player keeps working — you can click through the demo as a viewer
  would, and the strip follows along.
- **Right — the inspector.** Whatever is selected: an annotation, a cover's
  widget, the step, or the demo.

The toolbar under the stage adds things to the current step: **Message**
(the four variants — cursor, pointer, callout, area), **Annotate** (a blur
box or a text overlay), **Zoom**, media, and **Voiceover**. Each button
carries a small count of what the step already has.

## What you can change

**Steps.** Add a content step from an image or video, or a cover step
(headline, form or embed). Reorder, duplicate, delete, and give each one a
step name. Step settings also swap the step's media and open the crop and
alignment dialog for it.

**Messages.** Text is written in a small rich-text box and stored as
markdown. The inspector holds the variant, the anchor side (or `auto`),
text alignment, corner radius, colours, and whether clicking the message
advances the step.

**Other annotations.** Text overlays and blur boxes for covering sensitive
parts of a screenshot, both positioned and resized on the stage.

**Zoom.** Adding a zoom puts a rectangle on the stage: move and resize it
over the region you want, and the step gets the matching `transform`. The
pill beside it previews how the zoomed step will look, or removes the zoom
again.

**Voiceover.** One panel lists every step's narration. Write the script for
a step, then either record audio from your microphone — it is uploaded into
the demo's `assets/` and attached to the step — or pick an audio file
that is already there. The script box seeds itself from the step's first
message when it is empty.

**Cover widgets.** A cover holds one widget. The inspector switches between
headline, form and embed, and edits their fields: title, description,
image, buttons and where each button goes. A `custom` widget is left alone
— edit it in the JSON.

**Chrome and theme.** Demo settings cover the title and subtitle, the
player header, the "Built with Inkly" badge, the player controls
(full / minimal / hidden), the primary colour, the canvas background behind
the player (theme default, a solid colour, a gradient or an image, with a
blur), and the header logo and its link.

**Assets.** Any media picker in the editor opens the same dialog: the files
already under the demo's `assets/`, searchable, plus a drop zone to add a
new one. A file you drop is written into `demos/<slug>/assets/` and the step
starts referencing it by that path. Uploads are capped at 100 MB. If the
name is already taken by different bytes, the new file lands as
`hero-2.png` and keeps its own path, so steps pointing at the old file are
unaffected. Removing a file is a file-system job: delete it from
`assets/` yourself, and check with `interactive-demo validate` that nothing
still references it.

Two things the editor deliberately leaves to the file: chapters, and
`custom` widgets. Deleting a step still keeps chapters honest — the step id
is removed from every chapter, a chapter left empty is dropped, and any
button that pointed at the deleted step or chapter is retargeted.

## Edits go straight to disk

The editor holds your demo's files in memory and writes the changed ones
back through the dev server's JSON API, which writes into
`demos/<slug>/`. Nothing else is touched.

- **Autosave** fires five seconds after your last edit. The badge in the
  header shows "Unsaved changes", then "Saving", then "Saved".
- **⌘S / Ctrl+S** saves immediately.
- Switching away from the tab or closing it flushes whatever is dirty; a
  hard reload with unflushed edits asks you to confirm first.
- A failed save says so and retries; saves are serialised, so an older
  write can never land on top of a newer one.

Because the file on disk is the real thing, `dev` notices the write like any
other: the demo page at `/<slug>/` reloads with your change, and so does
anything else watching the folder. Your editor, `git diff` and the CLI all
see exactly what the editor wrote.

## Your file keeps its shape

This is the part that matters if you hand-wrote `demo.config.json`.

The config the editor works with comes out of the schema, which means every
optional field carries its default and every key sits in schema order.
Writing *that* back would turn a one-word text change into a whole-file
rewrite: `$schema` sinking to the bottom, hand-ordered keys shuffled, and
defaults you never typed expanded across every step.

So the editor writes edits into the shape of the file you wrote:

- Keys keep the order you put them in, and `$schema` stays first.
- A field you never wrote is not added to the file when it still equals
  what the schema would fill in anyway.
- Array elements are matched by their `id`, so inserting or reordering a
  step doesn't shift every later element onto the wrong counterpart.
- A key the schema strips on the way in — a note you left next to a step —
  stays in the file. The editor never saw it, so it cannot have been the
  edit that removed it. A key the edit really did remove still goes.
- Before writing, the editor parses what it is about to write and compares
  it against the config it meant to save. Anything that didn't survive the
  round trip is put back explicitly. Dropping a defaulted key is a guess
  that the schema will fill the same value back in; this check is what
  makes the guess safe for fields the schema derives from a sibling.

The practical result: edit one hotspot's text, and `git diff` shows one
changed line. Both configs in `examples/` round-trip through the editor
byte for byte.

## The Share dialog

**Share** in the header opens a four-pane dialog. It shows you commands and
snippets; it never uploads or deploys anything.

- **Share** — the two commands that publish a demo and get a link, and a
  field to paste that link into.
- **Inline embed** — the iframe snippet, sized to this demo's own aspect
  ratio and player header, built by the same code
  `interactive-demo embed` uses. It stays locked until you paste a link,
  because a snippet pointing at a placeholder host is worse than no
  snippet.
- **Popup embed** — the loader script plus a trigger for HTML, React,
  Next.js, Vue or Svelte, with the button label editable.
- **React component** — the one-liner for rendering the player in your own
  React tree.

The embedding guide has the longer version of all of these:
[embedding.md](embedding.md).

## When the config doesn't parse

If `demo.config.json` is invalid JSON or fails the schema, the editor
replaces the stage with "Editor unavailable" and lists the offending paths
and messages. Fix the file in your text editor: the editor polls the file
while it is broken and comes back on its own as soon as it parses. It will
not overwrite a file it cannot read.

A config with a missing or malformed `id` is not an error — the editor
mints one in memory and persists it on the next save.

## Working on the runtime at the same time

One trap worth knowing if you are developing this repo rather than using it.

The editor bundles the runtime at **its own** build time, and `dev` serves
that bundle. So rebuilding only the runtime:

```sh
npm run build -w @inkly-org/interactive-demo
```

updates the demo pages — they load `player.js` from the runtime's `dist/` —
but **not** the player running inside the editor's stage. After any runtime
change, run the full build before judging the editor:

```sh
npm run build
```

No restart is needed afterwards; reload the editor tab.
