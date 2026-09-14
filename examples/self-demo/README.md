# self-demo

A demo of `interactive-demo`, made with `interactive-demo`.

```
npm --prefix ../.. run build      # build the CLI once
node ../../packages/cli/dist/cli.js dev
```

Nine steps: record a click-through with the CLI, watch it back, write it up in
the editor, get the embed snippets, build the folder, and put it on a page
both ways.

## Where the screens come from

None of them are mockups. `testbed/shoot.mjs` at the repo root produces every
one of them in a single run:

1. it scaffolds a throwaway project with the built CLI;
2. it records the stand-in product in `testbed/app/` with the real
   `interactive-demo capture` command, driving the clicks over the DevTools
   protocol instead of a person's hand;
3. it writes that capture up the way you would in the editor;
4. it serves the build from the testbed's stand-in website and photographs the
   dev preview, the editor, the Share dialog and both embeds at 1440x900;
5. it renders two terminal cards from the transcripts of the commands it just
   ran — the paths and step counts in them are real.

So the tour goes stale the moment the product changes, and un-stales with one
command:

```
npm run build && node testbed/shoot.mjs
```

That rewrites `demos/product-tour/assets/` and `demos/product-tour/metrics.json`
(the on-screen positions of the things worth pointing at, which is where the
hotspot coordinates in `demo.config.json` come from). The copy, the chapters
and the hotspots are hand-written and are not touched by a re-shoot — check the
hotspots still land where they should after a UI change.
