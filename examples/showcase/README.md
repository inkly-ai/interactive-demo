# showcase

A one-minute demo of `interactive-demo`, made with `interactive-demo`: an
agent records a product, a person polishes the result, and it ships on a
website.

It is published at <https://interactive-demo.inklyai.dev/p/AMrDQaVQfiHtHbkRhcI9Ew>.

```
npm --prefix ../.. run build      # build the CLI once
node ../../packages/cli/dist/cli.js dev
```

Then open the `interactive-demo` demo.

## The six steps

| step | what the viewer sees | made with |
| --- | --- | --- |
| `cover-intro` | "Interactive product demos that live in your repo", beside a finished demo mid-play | cover with a `headline` widget: a `hero` `image` on the right, running off the corner, and one `next` button |
| `agent` | Claude Code making a demo from one prompt | **video** step; `pointer` message beside the prompt; `voiceover` + `captions` |
| `extension` | the Chrome extension recording the same app: Start Recording, three clicks, three steps | **video** step; `pointer` message beside the step counter; `voiceover` + `captions` |
| `editor` | the local editor, a hotspot's text being edited | `transform` zoom that pushes in on the editor; `pointer` message; `voiceover` + `captions` |
| `ship` | a marketing page scrolled down to the demo embedded in it | **video** step (`capture` recorded the scroll as a WebM with a poster); `pointer` message; `voiceover` + `captions` |
| `cover-outro` | "Make your first one", over the `init` command | headline with a stacked `image`; a primary `url` button and a `restart` |

Every hotspot is a `pointer` message, placed beside what it points at with
its card in clear space.

Around the steps:

- **Theme** — the player's default theme, untouched.
- **Page bar** — the project `brand` in `interactive-demo.json`: the Inkly
  wordmark from `brand/` and one CTA to the repo.
- **Chrome** — `autoplay: true` so narration starts as each narrated step
  opens, full controls, and the "Built with Inkly" badge. Nothing moves on
  by itself: every step's `advance.trigger` is `click`, so a clip or a
  narration that ends leaves the step where it is until the viewer clicks.

## Where the screens come from

None of them are mockups. `node testbed/shoot-showcase.mjs` at the repo root
makes one demo the way the story tells it — of **Acme Analytics**, the
stand-in product in [`testbed/app/`](../../testbed/app) — and photographs
each stage:

- **The agent session** is real, and recorded rather than rerun: an agent
  does not take the same path twice. A Claude Code agent was given a project
  scaffolded by `init`, with [the skill](../../skills/interactive-demo/SKILL.md)
  installed in it, and one request — *"Make an interactive demo of our
  onboarding flow at http://localhost:4173/app/ — keep it local, I'll publish
  later."* It read the skill, ran `capture start --headless`, wrote a small
  script to click through the app, ran `capture stop`, then rewrote the copy
  and added a cover, chapters and an outro. The whole transcript, tidied of
  the machine's paths, is in
  [`testbed/fixtures/claude-code-session.json`](../../testbed/fixtures/claude-code-session.json),
  along with the first message the session was given. The clip in the `agent`
  step is that session drawn the way Claude Code draws one and filmed as it
  fills in: the prompt typed out, then a short excerpt — the skill,
  `capture start`, `capture stop`, the write-up and `validate`, the closing
  message — one line after another. Nothing in it is reworded; every cut is
  marked with an ellipsis and the calls in between are counted. The pace is
  the film's, not the session's, which took about three minutes.
- **The demo it made** is rebuilt on every re-shoot: the script replays the
  agent's clicks with the real `capture` command, so the screens are today's,
  and puts the agent's `demo.config.json` on top. One thing is changed: the
  agent chose its own theme tokens and a button colour, and those are removed
  so the player inside the screens is the stock one. The fixture keeps what
  the agent wrote.
- **The cover's picture** is one step of that demo (the funnel), composed
  for the cover's hero frame, which runs off the cover's right and bottom
  edges and keeps its top-left corner. The same app page is photographed
  again in a narrow window at 2.6 times the pixels; what lies under the
  funnel card is painted over with the page's own background, so the part
  in view is one calm region — logo and nav, the title row, the funnel; and
  the real player, without its header, controls or badge, draws the
  hotspot. The hotspot's words are the agent's for that step. Its placement
  is composed for the cover: the agent pointed at *Save funnel*, which here
  is past the edge, so the pointer sits on the funnel and its card hangs
  below it.
- **The extension** in the `extension` step is the real Interactive Demo
  Capture, loaded unpacked into a headless Chrome and really recording the
  same app: its popup, Start Recording, the sheet and countdown it puts in
  the page, three clicks, and the popup again counting three steps. The clip
  is those screens in order. Two things in it are drawn rather than
  photographed: the browser's toolbar around the page (a headless Chrome has
  none; the popup is photographed separately and set under the icon, where
  it opens), and a ring where each click lands.
- **The editor** is the one `dev` serves, open on the agent's demo, framed
  with a margin so the step's zoom pushes in without clipping it, and set
  high so the caption has an empty band under it.
- **The website** is [`testbed/host/`](../../testbed/host), serving the
  `build` of the agent's demo; the clip is `capture` recording a scroll.
- **The outro's terminal** is `init my-demos`, with what it printed.
- **The narration**, with `INWORLD_API_KEY` set: the `script` of each of
  the four content steps is read by [Inworld TTS](https://inworld.ai) (voice *Reed*, model
  `inworld-tts-2`) into
  `vo-<step>.mp3`, and the step's `voiceover` duration and one caption per
  sentence, timed in proportion to its length (the rule the editor uses), are
  rewritten to match.

The script also writes `demos/interactive-demo/metrics.json`: the boxes of
the things the demo points at, which is where the hotspot and zoom
coordinates in `demo.config.json` come from. The copy, covers and hotspots
are hand-written and a re-shoot never touches them; check the hotspots still
land after a UI change.

`npm run hero` films the two animations in the repo's README from this demo.
