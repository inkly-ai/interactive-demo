# Docs

Start with whichever matches what you are doing.

## Making a demo

- [Authoring demos](authoring.md) — the project layout, what a step is,
  hotspots, captions, chapters, voiceover, assets. Read this first if you are
  writing a demo by hand.
- [Capturing from a live app](capture.md) — click through your product in
  Chrome and let every click become a step. Covers video steps, what to do
  when a click is missed, and how to recover an interrupted session.
- [The local editor](editor.md) — the editor `dev` serves. What you can
  change, how autosave works, and the guarantee that your `demo.config.json`
  comes back in the shape you wrote it.

## Shipping it

- [Embedding](embedding.md) — hosting the built folder, iframe sizing, the
  pop-up loader, listening for events, and the React route.
- [Runtime and React API](runtime.md) — `<Demo>` and its props, `<DemoModal>`,
  the static page contract, the events a host page can listen for, themes and
  fonts.

## Reference

- [CLI reference](cli.md) — every command, every flag, and its real default.
- [`demo.config.json` reference](schema.md) — every field in the config.
  Generated from the schema; do not edit it by hand.

## Working on this repo

- [Architecture](architecture.md) — what each package is responsible for, the
  build graph and why the editor has to be rebuilt after a runtime change, the
  testbed, and the checks a change has to pass.
- [CONTRIBUTING](../CONTRIBUTING.md) — how to propose a change, and the
  sign-off the project uses.
