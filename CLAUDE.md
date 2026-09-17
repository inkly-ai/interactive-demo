# Working in this repo

Open-source interactive product demos: `packages/runtime` (React player + schema),
`packages/cli` (`init`, `dev`, `capture`, `validate`, `build`, `embed`, `login`, `publish`),
`packages/editor` (local editor, built into the CLI and served by `dev` at `/__demo/editor/`).

## Rules

- **Revive, don't rebuild.** This code was ported from a tested predecessor. Before writing any
  function, check whether an original exists (see `CLAUDE.local.md` for where the reference
  tree lives) and port it with trims. Rewrites need a stated reason.
- **Commit in waves.** One concern per commit, Conventional Commits, `git commit -s` (DCO).
  Never one bulk commit per package. Subagents do not commit; the orchestrator does after review.
- **Scope is fixed for v1:** image and video steps only; no HTML/snapshot or animation steps,
  no hub/index page, no AI editing, no telemetry, no hosted app in this repo.
- **Nothing internal in the tree.** No keys, no telemetry, no private hostnames, and nothing
  about how the hosting service is built — its database, auth, storage or deploy setup live in
  another repo and stay there. The brand and the service itself ARE public surface: the
  `@inkly-org` scope, the badge, the Inkly lockup in the editor chrome, and the README, docs and
  CLI output that point at `publish`. Naming the service is fine; describing its insides is not.
- **Keep formatting of ported lines.** No repo-wide reformatting; there is no Prettier config.

## Checks

From the repo root: `npm run build`, `npm run typecheck`, `npm run lint` (0 errors; two known
hook warnings in the runtime), `npm test` (55 files as of this line; the count moves — zero
failures is the bar). CI also validates and builds
`examples/getting-started` with the built CLI. A fresh-clone simulation (`git clone`, `npm ci`,
then the four commands) is the bar before calling anything done.

## Conventions worth knowing

- Reserved internal slug and route prefix: `__demo`. Page contract for static output:
  the `#demo-config` JSON script tag, `#root`, `player.js`/`player.css`;
  the player exposes `window.__demo` and honours `?autoplay=1`.
- Media lives at `demos/<slug>/assets/<file>` and the config references it by that relative
  path; there is no manifest. `publish` hashes the referenced files and rewrites the paths to
  hosted URLs in the frozen copy. `packages/cli/src/media.ts` is the one walker.
- The "Built with Inkly" badge is on by default (`chrome.branding: false` hides it); it links to inklyai.dev.
- `capture` is headed by default; `--headless` opts in; video needs `ffmpeg` on PATH.
- `publish` is the path the README, the docs and the CLI's own output lead with — one command
  to a link, no hosting to solve. Self-hosting a `build` folder is a first-class alternative
  documented beside it, never a footnote. The embed snippets are identical either way; only the
  origin differs, and saying so is what keeps the choice low-stakes.
- Two questions decide how a demo is used, and the docs are cut along them: does it run as its
  own page (link / iframe / `embed.js`) or inside a React app (`<Demo>` / `<DemoModal>`), and —
  for the page — who hosts it. `docs/embedding.md` leads with that table; keep it that way.
