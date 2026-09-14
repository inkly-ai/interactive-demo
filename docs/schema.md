# demo.config.json reference

Generated from the JSON schema published with `@inkly-org/interactive-demo`
(`dist/schema/demo.config.json`). Regenerate with `node scripts/docs-schema.mjs`.
Point editors at the schema with:

```json
{ "$schema": "https://cdn.jsdelivr.net/npm/@inkly-org/interactive-demo/dist/schema/demo.config.json" }
```

## Demo (demo.config.json)

Per-demo configuration. One per demo, lives at demos/<slug>/demo.config.json.

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes | Pattern `^[A-Za-z0-9_-]{12}$`. |
| `version` | integer | yes | Range 1–…. |
| `title` | string |  |  |
| `subtitle` | string |  |  |
| `backgroundColor` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `background` | [background](#background) |  |  |
| `theme` | [theme](#theme) |  |  |
| `chrome` | [chrome](#chrome) |  | Default `{"hideHeader":false,"hideControls":false,"mobileFooterMessage":true,"autoplay":false,"branding":true}`. |
| `aspectRatio` | [aspectRatio](#aspectratio) |  |  |
| `chapters` | [chapters](#chapters)[] |  | Default `[]`. |
| `steps` | [steps (kind = `content`)](#steps-kind-content) \| [steps (kind = `cover`)](#steps-kind-cover)[] | yes |  |

### background

| field | type | required | notes |
|---|---|---|---|
| `type` | `"none"` \| `"color"` \| `"image"` | yes |  |
| `color` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `from` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `to` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `src` | string |  |  |
| `alt` | string |  |  |
| `blur` | number |  | Range 0–48. |

### theme

| field | type | required | notes |
|---|---|---|---|
| `preset` | string |  |  |
| `tokens` | [tokens](#tokens) |  |  |
| `brand` | [brand](#brand) |  |  |

#### tokens

| field | type | required | notes |
|---|---|---|---|
| `primary` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `secondary` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `font` | string |  |  |
| `radius` | string |  |  |

#### brand

| field | type | required | notes |
|---|---|---|---|
| `logo` | string |  |  |
| `name` | string |  |  |
| `logoHref` | string |  |  |

### chrome

| field | type | required | notes |
|---|---|---|---|
| `hideHeader` | boolean |  | Default `false`. |
| `hideControls` | boolean |  | Default `false`. |
| `controls` | `"full"` \| `"minimal"` \| `"hidden"` |  |  |
| `mobileFooterMessage` | boolean |  | Default `true`. |
| `autoplay` | boolean |  | Default `false`. |
| `branding` | boolean |  | Default `true`. |

### aspectRatio

| field | type | required | notes |
|---|---|---|---|
| `width` | number | yes |  |
| `height` | number | yes |  |

### chapters

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `title` | string | yes |  |
| `stepIds` | string[] | yes |  |

### steps (kind = `content`)

| field | type | required | notes |
|---|---|---|---|
| `kind` | `"content"` |  | Default `"content"`. |
| `id` | string | yes |  |
| `label` | string |  |  |
| `duration` | number |  |  |
| `background` | [background (type = `image`)](#background-type-image) \| [background (type = `video`)](#background-type-video) | yes |  |
| `script` | string |  |  |
| `voiceover` | [voiceover](#voiceover) |  |  |
| `transform` | [transform](#transform) |  |  |
| `advance` | [advance](#advance) |  | Default `{"trigger":"auto"}`. |
| `annotations` | [annotations (type = `message`)](#annotations-type-message) \| [annotations (type = `blur`)](#annotations-type-blur) \| [annotations (type = `text`)](#annotations-type-text)[] |  | Default `[]`. |
| `captions` | [captions](#captions)[] |  |  |

#### background (type = `image`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"image"` | yes |  |
| `src` | string | yes |  |
| `naturalWidth` | number | yes |  |
| `naturalHeight` | number | yes |  |
| `alt` | string |  |  |
| `sourceUrl` | string |  |  |
| `title` | string |  |  |
| `objectFit` | `"contain"` \| `"cover"` \| `"fill"` |  |  |
| `objectPosition` | `"left top"` \| `"center top"` \| `"right top"` \| `"left center"` \| `"center center"` \| `"right center"` \| `"left bottom"` \| `"center bottom"` \| `"right bottom"` |  |  |

#### background (type = `video`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"video"` | yes |  |
| `src` | string | yes |  |
| `posterSrc` | string |  |  |
| `naturalWidth` | number | yes |  |
| `naturalHeight` | number | yes |  |
| `alt` | string |  |  |
| `sourceUrl` | string |  |  |
| `title` | string |  |  |
| `autoplay` | boolean |  | Default `true`. |
| `muted` | boolean |  | Default `true`. |
| `objectFit` | `"contain"` \| `"cover"` \| `"fill"` |  |  |
| `objectPosition` | `"left top"` \| `"center top"` \| `"right top"` \| `"left center"` \| `"center center"` \| `"right center"` \| `"left bottom"` \| `"center bottom"` \| `"right bottom"` |  |  |

#### voiceover

| field | type | required | notes |
|---|---|---|---|
| `src` | string | yes |  |
| `duration` | number |  |  |

#### transform

| field | type | required | notes |
|---|---|---|---|
| `zoom` | number |  | Default `1`. Range 1–…. |
| `x` | number |  | Default `0.5`. Range 0–1. |
| `y` | number |  | Default `0.5`. Range 0–1. |

#### advance

| field | type | required | notes |
|---|---|---|---|
| `trigger` | `"auto"` \| `"click"` |  | Default `"auto"`. |

#### annotations (type = `message`)

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `type` | `"message"` | yes |  |
| `variant` | `"pointer"` \| `"callout"` \| `"area"` \| `"cursor"` |  | Default `"callout"`. |
| `x` | number | yes | Range 0–1. |
| `y` | number | yes | Range 0–1. |
| `w` | number |  | Range 0–1. |
| `h` | number |  | Range 0–1. |
| `text` | string |  |  |
| `showMessage` | boolean |  |  |
| `advancesStep` | boolean |  | Default `true`. |
| `background` | string |  |  |
| `textColor` | string |  |  |
| `borderRadius` | string |  |  |
| `textAlign` | `"left"` \| `"middle"` \| `"right"` |  | Default `"left"`. |
| `anchor` | `"top"` \| `"right"` \| `"bottom"` \| `"left"` \| `"auto"` |  | Default `"auto"`. |
| `showNavigation` | boolean |  | Default `true`. |
| `prevButton` | [prevButton](#prevbutton) |  |  |
| `nextButton` | [prevButton](#prevbutton) |  |  |

##### prevButton

| field | type | required | notes |
|---|---|---|---|
| `label` | string |  |  |
| `hidden` | boolean |  | Default `false`. |

#### annotations (type = `blur`)

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `type` | `"blur"` | yes |  |
| `x` | number | yes | Range 0–1. |
| `y` | number | yes | Range 0–1. |
| `w` | number | yes | Range 0–1. |
| `h` | number | yes | Range 0–1. |
| `intensity` | number |  | Default `8`. Range 0–20. |

#### annotations (type = `text`)

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `type` | `"text"` | yes |  |
| `x` | number | yes | Range 0–1. |
| `y` | number | yes | Range 0–1. |
| `text` | string | yes |  |
| `fontSize` | number |  | Default `16`. |
| `color` | string |  |  |

#### captions

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `text` | string | yes |  |
| `start` | number |  | Range 0–…. |
| `end` | number |  | Range 0–…. |

### steps (kind = `cover`)

| field | type | required | notes |
|---|---|---|---|
| `kind` | `"cover"` | yes |  |
| `id` | string | yes |  |
| `label` | string |  |  |
| `widgets` | [widgets (type = `headline`)](#widgets-type-headline) \| [widgets (type = `form`)](#widgets-type-form) \| [widgets (type = `embed`)](#widgets-type-embed) \| [widgets (type = `custom`)](#widgets-type-custom)[] | yes |  |
| `background` | [background](#background) |  |  |
| `backgroundImage` | [backgroundImage](#backgroundimage) |  |  |
| `backgroundDim` | number |  | Range 0–1. |
| `script` | string |  |  |
| `voiceover` | [voiceover](#voiceover) |  |  |
| `duration` | number |  |  |
| `advance` | [advance](#advance) |  | Default `{"trigger":"click"}`. |

#### widgets (type = `headline`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"headline"` | yes |  |
| `id` | string | yes |  |
| `logo` | [logo](#logo) |  |  |
| `image` | [image](#image) |  |  |
| `title` | string | yes |  |
| `titleColor` | string |  |  |
| `description` | string |  |  |
| `descriptionColor` | string |  |  |
| `textAlign` | `"left"` \| `"middle"` \| `"right"` |  |  |
| `cta` | [cta](#cta) |  |  |
| `secondaryCta` | [cta](#cta) |  |  |

##### logo

| field | type | required | notes |
|---|---|---|---|
| `src` | string | yes |  |
| `alt` | string |  |  |
| `height` | integer |  |  |

##### image

| field | type | required | notes |
|---|---|---|---|
| `src` | string | yes |  |
| `alt` | string |  |  |
| `naturalWidth` | number |  |  |
| `naturalHeight` | number |  |  |
| `position` | `"left"` \| `"right"` \| `"top"` |  | Default `"right"`. |
| `layout` | `"standard"` \| `"hero"` |  | Default `"hero"`. |

##### cta

| field | type | required | notes |
|---|---|---|---|
| `label` | string | yes |  |
| `action` | [action (type = `next`)](#action-type-next) \| [action (type = `prev`)](#action-type-prev) \| [action (type = `step`)](#action-type-step) \| [action (type = `chapter`)](#action-type-chapter) \| [action (type = `url`)](#action-type-url) \| [action (type = `restart`)](#action-type-restart) |  | Default `{"type":"next"}`. |
| `animation` | `"none"` \| `"shimmer"` |  | Default `"shimmer"`. |
| `background` | string |  |  |
| `textColor` | string |  |  |

##### action (type = `next`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"next"` | yes |  |

##### action (type = `prev`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"prev"` | yes |  |

##### action (type = `step`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"step"` | yes |  |
| `stepId` | string | yes |  |

##### action (type = `chapter`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"chapter"` | yes |  |
| `chapterId` | string | yes |  |

##### action (type = `url`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"url"` | yes |  |
| `href` | string | yes |  |
| `target` | `"_self"` \| `"_blank"` |  | Default `"_blank"`. |

##### action (type = `restart`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"restart"` | yes |  |

#### widgets (type = `form`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"form"` | yes |  |
| `id` | string | yes |  |
| `logo` | [logo](#logo) |  |  |
| `image` | [image](#image) |  |  |
| `title` | string |  |  |
| `description` | string |  |  |
| `fields` | [fields](#fields)[] | yes |  |
| `submit` | [submit](#submit) |  | Default `{"label":"Submit","action":{"type":"next"},"animation":"shimmer"}`. |
| `submitTo` | string |  |  |

##### fields

| field | type | required | notes |
|---|---|---|---|
| `id` | string | yes |  |
| `label` | string | yes |  |
| `type` | `"text"` \| `"dropdown"` |  | Default `"text"`. |
| `placeholder` | string |  |  |
| `required` | boolean |  | Default `false`. |
| `options` | [options](#options)[] |  |  |

##### options

| field | type | required | notes |
|---|---|---|---|
| `value` | string | yes |  |
| `label` | string | yes |  |

##### submit

| field | type | required | notes |
|---|---|---|---|
| `label` | string | yes |  |
| `action` | [action (type = `next`)](#action-type-next) \| [action (type = `prev`)](#action-type-prev) \| [action (type = `step`)](#action-type-step) \| [action (type = `chapter`)](#action-type-chapter) \| [action (type = `url`)](#action-type-url) \| [action (type = `restart`)](#action-type-restart) |  | Default `{"type":"next"}`. |
| `animation` | `"none"` \| `"shimmer"` |  | Default `"shimmer"`. |
| `background` | string |  |  |
| `textColor` | string |  |  |

#### widgets (type = `embed`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"embed"` | yes |  |
| `id` | string | yes |  |
| `src` | string | yes |  |
| `iframeTitle` | string |  |  |
| `sandbox` | string |  | Default `"allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"`. |
| `allow` | string |  | Default `"camera; microphone; fullscreen; payment; clipboard-write"`. |

#### widgets (type = `custom`)

| field | type | required | notes |
|---|---|---|---|
| `type` | `"custom"` | yes |  |
| `id` | string | yes |  |
| `name` | string | yes |  |
| `data` | object |  |  |

#### background

| field | type | required | notes |
|---|---|---|---|
| `type` | `"color"` \| `"image"` \| `"glassmorphism"` | yes |  |
| `color` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `from` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `to` | string |  | Pattern `^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$`. |
| `src` | string |  |  |
| `alt` | string |  |  |
| `blur` | number |  | Range 0–48. |
| `intensity` | number |  | Range -5–48. |

#### backgroundImage

| field | type | required | notes |
|---|---|---|---|
| `src` | string | yes |  |
| `alt` | string |  |  |

#### advance

| field | type | required | notes |
|---|---|---|---|
| `trigger` | `"auto"` \| `"click"` |  | Default `"click"`. |

> `annotations[]` and `widgets[]` also accept any object whose `type` is not one
> of the variants above; the player skips those (forward compatibility).
