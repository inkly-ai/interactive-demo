# Capturing a demo from a real app

`interactive-demo capture` records a click-through of a live web app and
writes it out as a demo folder. You click through the product yourself in a
real Chrome window; each click becomes one step, with a screenshot of the
page you clicked on and a cursor annotation on the thing you clicked.

Two commands bracket a session:

```sh
interactive-demo capture start https://app.example.com --name "Onboarding"
# a Chrome window opens — click through the product
interactive-demo capture stop
```

`start` returns immediately, so your terminal stays free while you record.
Every `capture` subcommand prints JSON, so a script can drive the same flow
a person does.

## How it works

`start` launches Chrome with a debugging port and talks to it over the
Chrome DevTools Protocol. It opens your URL in a new tab, injects a small
recorder script into the page, then spawns a detached listener process and
hands your prompt back. The listener stays attached to the tab and turns
each click into a step until you run `stop` or `cancel`.

The window is visible by default — the whole point is that you drive the
product. `--headless` opts into headless Chrome, which is only useful when
something other than you is driving the page: a script sending clicks over
CDP, or `--connect-to-browser <url>` pointing at a browser you already
control.

Chrome is found for you: real Google Chrome first (bot-gated sites tend to
block the testing builds), then Chrome for Testing, Canary or Chromium.
`--browser /path/to/chrome` or the `CHROME_PATH` environment variable
overrides that.

The tab is sized to 1440×900 by default (`--width`, `--height`, or
`--window-size 1440x900`) and captured at 2× pixel density, so a default
session writes 2880×1800 screenshots. `start` waits up to `--timeout`
milliseconds (120000 by default) for the first page load, and refuses to
record if Chrome lands on its own error page.

## What a click becomes

Clicks are what produce steps. Scrolling and typing are recorded as motion
and only show up as video (below); the initial page load is not a step.

Each click produces one content step:

- **The background** is the page as it looked *at click time* — before the
  click's own repaint and before any navigation it triggers. That way the
  screenshot, the pointer and the label all describe the same page.
- **An annotation**: a `message` with the `cursor` variant, placed at the
  point you clicked, reading `Click on "Save changes"`. The label is the
  clicked element's accessible name — `aria-label`, `title`, `alt`, its own
  text, a `value`/`placeholder`/`name` — first line only, capped at 48
  characters. When nothing usable is found, the text is `Continue`.
- **A zoom**: a 1.35× `transform` toward the click, eased back as the point
  approaches an edge so the crop does not slam into a corner. `--no-zoom`
  leaves the screen unzoomed.
- **`advance.trigger: "click"`**, so the viewer moves on by clicking the
  annotation.

Because a step describes the page you clicked *on*, the last page you reach
is not captured. If you want the demo to end on the destination, click once
more — anywhere harmless — before you stop.

Two behaviours are worth knowing when you are clicking around:

- A click on a link is held: the recorder cancels the navigation, lets the
  source page be captured, then navigates for you.
- A click that opens a new tab is followed. For three seconds after a
  click, a page Chrome opens is treated as the one to keep recording.

## What `stop` writes

`stop` builds the demo from the recorded screens and writes a folder:

```
demos/onboarding/
  demo.config.json
  assets/
    screen-001.png
    screen-002.webm
    screen-002-poster.png
    screen-003.png
```

The slug comes from `--name` (or the page host with `www.` trimmed),
lowercased and hyphenated; if that folder exists it becomes `onboarding-2`,
`onboarding-3`, and so on. Without `--out`, `stop` must run inside a project
— it writes into that project's `demos/`, and appends the slug to
`interactive-demo.json` when that file keeps a `demos` list. `--out <dir>`
writes `<dir>/<slug>` instead and touches no project file.

The config gets a fresh demo id, `--name` as the title, and steps `s1`,
`s2`, … referencing their media by the relative paths above.
`--compress-images` re-encodes screenshots to WebP and keeps the PNG
whenever the WebP is not actually smaller.

`stop` then tears the session down: the listener, Chrome, its temporary
profile, and the working files it recorded into. It prints the demo folder,
the step count and one label per step, so you can read the captured story
without opening the JSON:

```sh
interactive-demo dev        # then open /onboarding/
```

## Video steps

Video needs `ffmpeg` on `PATH`. `start` checks once, up front: with no
ffmpeg it prints a warning to stderr and records everything as stills for
the whole session, rather than promising video and losing the motion steps
later. `--no-video` asks for stills and silences the warning.

While a session runs, the listener keeps a rolling buffer of screencast
frames. When you scroll or type and *then* click, that click commits the
preceding motion as a video step instead of a still. Only the densest
continuous run of frames is kept — the scroll itself — so idle frames
before it and the settle after the click are dropped.

The clip opens with a half-second hold on its first frame, so the viewer
isn't dropped straight into movement, and is padded to at least 1.5 seconds
by holding its last frame. It is encoded as VP9 WebM, and its first frame
is written alongside as the poster. A burst under 10 frames or 1.2 seconds,
or one whose frames are all identical, is not motion worth a clip: that step
falls back to a still of the source page.

A video step carries the same cursor annotation and the same click-to-advance
as a screenshot step; the auto-zoom is applied to screenshot steps only.

## The session file

A running capture keeps its state outside your project, under
`~/.interactive-demo/capture/`:

- `sessions/<id>.json` — the live session: the browser it launched, the tab
  it is recording, and every screen recorded so far.
- `captures/<id>/` — the screenshots and video frames recorded so far, plus
  `listener.log`.
- `profiles/<name>/` — persistent Chrome profiles (see below).

`INTERACTIVE_DEMO_CAPTURE_HOME` moves all of it somewhere else.

Once the listener is spawned it is the only writer of the session JSON. The
foreground commands read it and write their own sidecar files
(`<id>.listener.json`, `<id>.undo.json`), which is why running `status` or
`undo` mid-session cannot clobber a step being recorded.

You rarely need the session id. With exactly one session running, every
subcommand finds it; with more than one, they stop and list the ids so you
can pass `--session <id>`.

## Checking and undoing while you record

`capture status` reads the session file and reports without touching the
browser:

- `ready` — the recorder armed.
- `browserAlive` — the capture browser is still running. If this is
  `false`, further clicks record nothing; run `stop` to keep what you have.
- `stepCount`, `stepLabels`, `steps` — the story so far, one entry per
  recorded click.

`capture undo` drops the most recent recorded step, for a probing click
("does this button do anything?") you don't want in the demo. It records
the drop in a sidecar; `status` and `stop` then skip that screen.

`capture cancel` throws the session away: it kills the listener and Chrome,
removes the working files, and writes no demo.

## When a capture goes wrong

**Nothing was recorded.** `stop` with zero steps prints `ok: false` with the
reason and cleans the session up for you, so no `cancel` is needed. The
usual cause is that the clicks landed somewhere the recorder wasn't —
remember that the initial page load is not a step, and that a step needs an
actual click.

**The recorder never armed.** `start` waits up to 15 seconds for the
listener to report ready. If it doesn't, `start` fails and prints the tail
of both the listener log and the Chrome log, instead of handing you a
session that silently drops every click. Nothing is left behind; start
again.

**Clicks go missing after a navigation.** After each click the listener
captures the source page, follows the navigation, waits about two seconds
and re-arms the recorder on the page you landed on. A click during that
window can land before the recorder is back. Let the new page paint before
clicking again, and check `capture status` if you are unsure — the labels
tell you exactly which clicks were recorded.

**The page was still loading when you clicked.** The step shows what was on
screen at click time, half-loaded skeletons included. Undo it, wait, click
again.

**`start` was interrupted.** A `^C` during `start` tears down the Chrome and
listener it had already spawned and removes the half-written session, so the
next `stop` cannot bind to a dead session.

**The session file is unreadable.** Any command that touches it says so and
names the session. `capture cancel --session <id>` then cleans up what it
can — it kills the listener recorded in the sidecar and removes the working
files — and reports what it recovered.

**Chrome crashed mid-session.** Each step is written to the session file as
it is recorded, so the steps before the crash are still there. Run `capture
stop` and it exports them.

## Capturing an app you have to log into

Two things make a login survive.

`--profile <name>` points Chrome at a persistent user-data directory instead
of a throwaway one, so cookies live on between captures. A bare name maps to
a folder under the capture home; a value containing a slash is treated as a
directory path. `capture profiles` lists what you have, and whether each
profile has been used and holds cookies.

Signing in *inside* the capture browser does not always work: identity
providers reject an automation-controlled browser, even when a human is
doing the clicking. `capture login` exists for that. It opens a separate,
ordinary Chrome window on the same profile — no debugging port, no
automation flags — which the provider accepts:

```sh
interactive-demo capture login https://app.example.com/sign-in --profile acme
# sign in in the window that opens; you do not have to close it
interactive-demo capture start https://app.example.com --profile acme
```

`start` evicts the login window from the profile before taking it over, so
its cookies are flushed first. A persistent or attached profile is never
deleted on `stop`, `cancel` or an interrupted `start`, so a saved login is
not thrown away with the session.

## Options for `capture start`

- `--name <name>` — demo title, and the basis for the folder slug.
  Defaults to the page host.
- `--browser <path>` — Chrome/Chromium binary. Defaults to an installed
  Chrome, or `CHROME_PATH`.
- `--connect-to-browser <url>` — attach to an already-running DevTools
  endpoint instead of launching Chrome.
- `--width <n>`, `--height <n>`, `--window-size <w>x<h>` — viewport size.
  Defaults to 1440 × 900.
- `--timeout <ms>` — first page-load timeout. Defaults to 120000.
- `--headed`, `--headless` — a visible window (the default) or headless
  Chrome.
- `--profile <name>` — reuse a persistent Chrome profile, so a login
  survives.
- `--keep-profile` — keep the temporary profile after `stop`/`cancel`.
- `--no-video` — stills only; never build video steps.
- `--no-zoom` — don't zoom screenshot steps in on the clicked point.
- `--compress-images` — re-encode screenshots to WebP.

`stop` takes `--out <dir>`; `stop`, `cancel`, `status` and `undo` all take
`--session <id>`.

## After the capture

A captured demo is an ordinary demo folder — the same thing `init` writes
and the editor edits. From here:

- `interactive-demo validate` checks the config and that every referenced
  file exists.
- `interactive-demo dev` previews it, and the editor at
  `/__demo/editor/#/<slug>` is where you rewrite the auto-generated
  `Click on "…"` text into something worth reading. See the
  [editor guide](editor.md).
- `interactive-demo build` writes the static folder to deploy.
