# Authoring demos

## Project layout

```
my-demos/
  interactive-demo.json        { "name", "theme"?, "tokens"?, "brand"?, "demos"? }
  package.json                 scripts: dev, validate, build
  demos/
    onboarding/
      demo.config.json         the demo
      assets/                  screenshots, recordings, audio
    billing/
      …
```

`interactive-demo.json` needs only a `name`. `demos` is an optional list
that fixes the order `dev` lists demos in; demos are discovered by walking
`demos/`, so a folder is enough. `theme` names the preset (`default` or `mono`
ships) and `tokens` overrides its colours, font and radius for every demo.
The default preset paints its watercolor behind cover steps; give a cover its
own `background` to replace it.
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
    "src": "assets/screen-001.png",
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
  "voiceover": { "src": "assets/screen-001.mp3" },
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

### Form submissions

A form's values go two places. The player always emits a `form_submit`
runtime event, which a React host receives through `onEvent` and an
embedding page receives as a message (see the embedding guide). To store
them without writing any code, give the widget a `submitTo` URL: the player
POSTs the fields as JSON to it, then follows the submit button's action.

```json
{
  "type": "form",
  "id": "lead",
  "fields": [{ "id": "email", "label": "Email", "required": true }],
  "submitTo": "https://hooks.zapier.com/hooks/catch/…"
}
```

The body is `{ demoId, stepId, widgetId, fields: [{ id, label, value }],
timestamp }`. The endpoint must accept a cross-origin POST; webhook
services and form backends do. Nothing is sent unless `submitTo` is set,
and the editor's Submissions section fills it in for you.

### Chapters and chrome

`chapters` group step ids under titles for the chapter menu. `chrome`
controls the frame around the screen: `hideHeader`, `controls`
(`full` | `minimal` | `hidden`), `mobileFooterMessage`, `autoplay`, and
`branding` (the "Built with Inkly" badge, default `true`).

## Assets

A config references its media by path, relative to the demo folder:

```json
"background": { "type": "image", "src": "assets/screen-001.png" }
```

Anything under `assets/` works, as does an absolute URL for a file hosted
elsewhere. `validate` reports a path that has no file behind it, `dev` and
`build` serve the folder next to the page, and `publish` uploads each
referenced file once and rewrites the paths to the hosted URLs in the copy
it sends. The editor's asset panel writes the path for you; by hand, copy
the file into `assets/` and reference it.

## What capture writes

`capture stop` writes `demos/<slug>/` with the config and readable file
names: `screen-001.png`, `screen-002.webm` plus
`screen-002-poster.png` for a video step. Each click becomes a content step
with a `cursor` annotation on the clicked element and a zoom towards it;
the element's label becomes the step label. Scrolling or typing right
before a click is recorded as a short video step; without `ffmpeg` it is a
still instead.

## Adding a video step by hand

1. Put the recording in `assets/` (WebM or MP4) and a poster frame next to it.
2. Add a content step with a video background:

```json
{
  "kind": "content",
  "id": "s3",
  "background": {
    "type": "video",
    "src": "assets/clip-001.webm",
    "posterSrc": "assets/clip-001-poster.png",
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
