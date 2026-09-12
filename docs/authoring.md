# Authoring demos

## Project layout

```
my-demos/
  interactive-demo.json        { "name", "theme"?, "tokens"?, "brand"?, "demos"? }
  package.json                 scripts: dev, validate, build
  demos/
    onboarding/
      demo.config.json         the demo
      assets.json              manifest: asset id → file, size, sha256
      assets/                  screenshots, recordings, audio
    billing/
      …
```

`interactive-demo.json` needs only a `name`. `demos` is an optional list
that fixes the order `dev` lists demos in; demos are discovered by walking
`demos/`, so a folder is enough. `theme` names the preset (`default` or `mono`
ships) and `tokens` overrides its colours, font and radius for every demo.
`brand` fills the page header (below).

Add a demo with `interactive-demo init --demo <slug>`, import a folder with
`--from <dir>`, or record one with `capture` (below). The editor at
`/__demo/editor/#/<slug>` edits `demo.config.json` in place.

### Brand and the page header

`dev` and `build` put a bar above the player: the brand mark and name on the
left, the demo title, and up to two call-to-action buttons on the right. It
is plain HTML around the player, not part of `player.js`, so an iframe of a
built page shows it and a page you assemble from the page contract does not.
All of `brand` is optional; with nothing set the bar shows only the demo
title.

```json
{
  "name": "Acme demos",
  "brand": {
    "logo": "brand/logo.svg",
    "name": "Acme",
    "logoHref": "https://www.example.com",
    "cta": { "label": "Try Acme", "href": "https://www.example.com/signup" },
    "secondaryCta": { "label": "Docs", "href": "https://docs.example.com" }
  }
}
```

`logo` is an absolute URL or a path relative to the project root; `validate`
checks a relative file exists and stays inside the project, and `build`
copies it to `dist/<slug>/brand/` next to the page. `publish` does not upload
it: the hosted page shows the rest of the brand and the command warns, so use
an absolute URL for a logo that should appear there. Leave `name` out when the
logo image already carries the wordmark. `logoHref` turns the mark into a
link opening in a new tab; without it the mark links to `/`. CTA and
`logoHref` URLs must be `http(s)` or `mailto`. The buttons take their colour
from the theme preset and the `primary` token.

## demo.config.json

The full field list is in [schema.md](schema.md). The shape:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo/dist/schema/demo.config.json",
  "id": "tourExample0",
  "version": 1,
  "title": "Onboarding",
  "subtitle": "From sign-up to first project",
  "theme": { "preset": "default", "tokens": { "primary": "#5b6cff" } },
  "chrome": { "controls": "full", "autoplay": false, "branding": true },
  "chapters": [{ "id": "setup", "title": "Setup", "stepIds": ["s1", "s2"] }],
  "steps": [ … ]
}
```

`id` is a 12-character URL-safe string that identifies the demo for its whole
life; `init` and `capture` mint one. Keep it when you rename the folder.

### Steps

A step is either `content` (a screen) or `cover` (a full-screen card built
from widgets).

**Content step**

```json
{
  "kind": "content",
  "id": "s1",
  "label": "Dashboard",
  "background": {
    "type": "image",
    "src": "asset:cap-001",
    "naturalWidth": 1440,
    "naturalHeight": 900,
    "alt": "The dashboard after sign-in"
  },
  "script": "What the narrator says on this screen.",
  "annotations": [
    { "id": "a1", "type": "message", "variant": "pointer", "x": 0.72, "y": 0.18,
      "text": "Create a project from here." }
  ],
  "captions": [{ "id": "c1", "start": 0, "end": 2500, "text": "Create a project" }],
  "voiceover": { "src": "asset:vo-001" },
  "transform": { "zoom": 1.6, "x": 0.72, "y": 0.18 },
  "advance": { "trigger": "click" }
}
```

- `background.type` is `image` or `video`. A video background adds
  `posterSrc`, `autoplay` and `muted`; the step advances when the clip ends.
  `naturalWidth`/`naturalHeight` are the media's pixel size and drive the
  player's aspect ratio.
- `annotations` are the hotspots. `x`, `y` (and `w`, `h` for `area`) are
  fractions of the screen, 0–1. Variants of a `message`: `pointer` (a cursor
  with a bubble), `callout` (a numbered marker), `area` (a highlighted
  region), plus `text` overlays and `blur` boxes to hide sensitive data.
  A message with `advancesStep: true` (the default) moves to the next step
  when clicked.
- `captions` are timed subtitles in milliseconds from the step's start.
- `transform` zooms the screen towards a point; the editor sets it when you
  zoom in on a hotspot.
- `advance.trigger` is `click` (wait for the viewer) or `auto` (advance
  after `duration` ms, or when the video ends). `chrome.autoplay` must be
  `true` for `auto` steps to run on their own.

**Cover step**

```json
{
  "kind": "cover",
  "id": "intro",
  "widgets": [{
    "type": "headline",
    "id": "h1",
    "title": "Onboarding",
    "description": "Two minutes from sign-up to first project.",
    "textAlign": "middle",
    "cta": { "label": "Start", "action": { "type": "next" }, "animation": "shimmer" }
  }],
  "background": { "type": "color", "color": "#f7f7f5" },
  "advance": { "trigger": "click" }
}
```

Widgets: `headline` (title, description, CTA, optional logo and image),
`form` (fields; the submit action can jump to a step), `embed` (an iframe)
and `custom` (rendered by a component you register when using the React
player). Button actions are `next`, `prev`, `restart`, `step`, `chapter`
and `url`. A closing cover with a `restart` CTA is the usual way to end a
demo.

### Chapters and chrome

`chapters` group step ids under titles for the chapter menu. `chrome`
controls the frame around the screen: `hideHeader`, `controls`
(`full` | `minimal` | `hidden`), `mobileFooterMessage`, `autoplay`, and
`branding` (the made-with badge, default `true`).

## Assets

Configs never contain file paths. They reference `asset:<id>`, and
`assets.json` maps the id to a file under `assets/`:

```json
{
  "version": 1,
  "assets": [
    { "id": "cap-001", "kind": "image", "contentType": "image/png",
      "file": "screen-001.png", "size": 182331, "sha256": "…",
      "viewport": { "w": 1440, "h": 900 } }
  ]
}
```

`file` is relative to `assets/`. An entry may instead carry an absolute
`publicUrl` for a file hosted elsewhere. The dev server, `validate` and
`build` all resolve assets through this manifest, so a missing file is
reported by `validate` and a renamed folder never breaks a demo.

The editor's asset panel adds files to the manifest for you. By hand: copy
the file into `assets/`, add an entry with a fresh id, and reference it.

## What capture writes

`capture stop` writes `demos/<slug>/` with the config, the manifest and
readable asset names: `screen-001.png`, `screen-002.webm` plus
`screen-002-poster.png` for a video step. Each click becomes a content step
with a `pointer` annotation on the clicked element and a zoom towards it;
the element's label becomes the step label. Scrolling or typing right
before a click is recorded as a short video step; without `ffmpeg` it is a
still instead.

## Adding a video step by hand

1. Put the recording in `assets/` (WebM or MP4) and a poster frame next to it.
2. Add both to `assets.json` (`kind: "video"` and `kind: "image"`).
3. Add a content step with a video background:

```json
{
  "kind": "content",
  "id": "s3",
  "background": {
    "type": "video",
    "src": "asset:clip-001",
    "posterSrc": "asset:clip-001-poster",
    "naturalWidth": 1440,
    "naturalHeight": 900,
    "autoplay": true,
    "muted": true
  },
  "advance": { "trigger": "auto" }
}
```

Run `interactive-demo validate` to check the references, then `dev` to
watch it.
