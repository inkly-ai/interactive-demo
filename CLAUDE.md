# Working in this repo

Open-source interactive product demos: `packages/runtime` (React player + schema),
`packages/cli` (`init`, `dev`, `capture`, `validate`, `build`, `login`, `publish`),
`packages/editor` (local editor, built into the CLI and served by `dev` at `/__demo/editor/`).

## Rules

- **Revive, don't rebuild.** This code was ported from a tested predecessor. Before writing any
  function, check whether an original exists (see `CLAUDE.local.md` for where the reference
  tree lives) and port it with trims. Rewrites need a stated reason.
- **Commit in waves.** One concern per commit, Conventional Commits, `git commit -s` (DCO).
  Never one bulk commit per package. Subagents do not commit; the orchestrator does after review.
- **Scope is fixed for v1:** image and video steps only; no HTML/snapshot or animation steps,
  no hub/index page, no AI editing, no telemetry, no hosted app in this repo.
- **Nothing internal in the tree.** No private hostnames, keys, telemetry, or product names
  beyond the `@inkly-org` npm scope, the badge link, and the one sentence in the README.
- **Keep formatting of ported lines.** No repo-wide reformatting; there is no Prettier config.

## Checks

From the repo root: `npm run build`, `npm run typecheck`, `npm run lint` (0 errors; two known
hook warnings in the runtime), `npm test` (44 files). CI also validates and builds
`examples/getting-started` with the built CLI. A fresh-clone simulation (`git clone`, `npm ci`,
then the four commands) is the bar before calling anything done.

## Conventions worth knowing

- Reserved internal slug and route prefix: `__demo`. Page contract for static output:
  `#demo-config` + `#demo-assets` JSON script tags, `#root`, `player.js`/`player.css`;
  the player exposes `window.__demo` and honours `?autoplay=1`.
- Assets live at `demos/<slug>/assets/<file>` with an `assets.json` manifest; `asset:<id>` URIs
  resolve to `publicUrl` or `./assets/<file>`.
- The "Built with Inkly" badge is on by default (`chrome.branding: false` hides it); it links to inklyai.dev.
- `capture` is headed by default; `--headless` opts in; video needs `ffmpeg` on PATH.
