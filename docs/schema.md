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
| `annotations` | any[] |  | Default `[]`. |
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
| `widgets` | any[] | yes |  |
| `background` | [background](#background) |  |  |
| `backgroundImage` | [backgroundImage](#backgroundimage) |  |  |
| `backgroundDim` | number |  | Range 0–1. |
| `script` | string |  |  |
| `voiceover` | [voiceover](#voiceover) |  |  |
| `duration` | number |  |  |
| `advance` | [advance](#advance) |  | Default `{"trigger":"click"}`. |

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

> The published schema leaves `annotations[]` and `widgets[]` untyped (`items: {}`);
> their shapes are described in [authoring.md](authoring.md#steps).
