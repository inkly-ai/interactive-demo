import { z } from 'zod';
import { StepSchema } from './step';
import { DemoBrandSchema } from './brand';
import { ThemeTokensSchema } from './tokens';
import {
  DEMO_ID_PATTERN,
  generateDemoId,
  isValidDemoId,
  stableDemoIdFromKey,
} from './demo-id';

const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'must be a hex color like #5b3df5',
  });

/**
 * Chapter — a named grouping of step ids used for nav metadata.
 *
 * @example
 * ```json
 * {
 *   "id": "intro",
 *   "title": "Get started",
 *   "stepIds": ["cover", "step-1"]
 * }
 * ```
 */
export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  stepIds: z.array(z.string()).min(1),
});

/**
 * Player chrome toggles. Lives at the top of the demo config so authors
 * can pick the look of the embed without touching layout code.
 *
 * - `hideHeader` / `hideControls` skip rendering those chrome pieces in
 *   the default layout.
 * - `controls` is the tri-state successor to the `hideControls` boolean:
 *   `'full'` (segmented progress + play/pause/mute/step/fullscreen),
 *   `'minimal'` (prev/next + share + fullscreen, plus mute only when the
 *   step carries a voiceover — and unlike `full`, it also renders on
 *   cover screens), or `'hidden'`. When unset the renderer falls back to
 *   the legacy boolean (`hideControls ? 'hidden' : 'full'`), so existing
 *   configs keep working untouched.
 * - `mobileFooterMessage` gates the small-viewport behavior where the
 *   in-stage hotspot label/callout/area-message is hidden and a footer
 *   bar with step nav takes its place. Defaults to `true` since most
 *   demos want this on mobile; flip to `false` to keep messages
 *   in-stage at every viewport size.
 *
 * @example
 * ```json
 * {
 *   "hideHeader": false,
 *   "hideControls": false,
 *   "mobileFooterMessage": true,
 *   "autoplay": false
 * }
 * ```
 */
export const ChromeSchema = z.object({
  hideHeader: z.boolean().default(false),
  hideControls: z.boolean().default(false),
  /**
   * Tri-state player-controls mode. Optional so it can layer over the
   * legacy `hideControls` boolean without a migration: the renderer reads
   * `controls ?? (hideControls ? 'hidden' : 'full')`. The editor writes
   * this field (and keeps `hideControls` in sync for any legacy reader).
   */
  controls: z.enum(['full', 'minimal', 'hidden']).optional(),
  mobileFooterMessage: z.boolean().default(true),
  /**
   * Default OFF. When OFF the player parks at the end of every step and
   * waits for the viewer to click Next — videos freeze on their last
   * frame, image steps hold indefinitely. When ON the engine honors
   * each step's own `advance.trigger`, so `auto` steps roll forward
   * once their effective duration elapses.
   */
  autoplay: z.boolean().default(false),
  /**
   * Shows the small "Made with interactive-demo" link in the player's
   * bottom-right corner. Default ON; set to `false` to hide it.
   */
  branding: z.boolean().default(true),
});

/**
 * Optional explicit aspect ratio for the player frame. When set, this
 * wins over the auto-detected ratio from the first content step's natural
 * dimensions.
 * Use it when the demo has no content steps, or to lock every step to a
 * single presentation ratio.
 */
export const AspectRatioSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export const DemoBackgroundTypeSchema = z.enum(['none', 'color', 'image']);

/**
 * Full-page canvas background behind the player. `type` is the product
 * enum:
 *
 * - `none` uses the default dotted gray canvas.
 * - `color` uses either `color` for a flat fill or `from`/`to` for a
 *   gradient.
 * - `image` uses an arbitrary wallpaper source. `blur` optionally softens
 *   the wallpaper behind the player, in pixels.
 */
export const DemoBackgroundSchema = z
  .object({
    type: DemoBackgroundTypeSchema,
    color: HexColorSchema.optional(),
    from: HexColorSchema.optional(),
    to: HexColorSchema.optional(),
    src: z.string().min(1).optional(),
    alt: z.string().optional(),
    blur: z.number().min(0).max(48).optional(),
  })
  .superRefine((background, ctx) => {
    if (background.type === 'color') {
      const hasSolid = !!background.color;
      const hasGradient = !!background.from && !!background.to;
      if (!hasSolid && !hasGradient) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['color'],
          message: 'color backgrounds require color or from/to',
        });
      }
      if ((!!background.from) !== (!!background.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: background.from ? ['to'] : ['from'],
          message: 'gradient backgrounds require both from and to',
        });
      }
    }
    if (background.type === 'image' && !background.src) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['src'],
        message: 'image backgrounds require src',
      });
    }
  });

/**
 * Top-level demo config. Splash / cover screens are ordinary
 * `kind: 'cover'` steps inside `steps[]` (a widget grid). Closing
 * screens are the same: a final cover step whose CTA action is
 * `restart` (replay) or `url` (learn more), optionally grouped under
 * its own chapter for nav metadata.
 *
 * @example
 * ```json
 * {
 *   "id": "my-demo",
 *   "version": 1,
 *   "title": "Onboarding tour",
 *   "steps": [
 *     {
 *       "kind": "content",
 *       "id": "step-1",
 *       "background": {
 *         "type": "image",
 *         "src": "/screens/dashboard.png",
 *         "naturalWidth": 1440,
 *         "naturalHeight": 900
 *       },
 *       "annotations": []
 *     }
 *   ]
 * }
 * ```
 */
export const DemoSchema = z
  .object({
    /**
     * Stable, opaque per-demo identity (see `demo-id.ts`). Required and
     * format-validated: `DemoSchema.parse` THROWS on a missing or
     * malformed id. Configs predating this field must be passed through
     * {@link healDemoConfig} first, which mints one before validating.
     */
    id: z.string().regex(DEMO_ID_PATTERN, {
      message: 'must be a 12-character URL-safe demo id (see generateDemoId)',
    }),
    /**
     * Demo config schema version. Widened from `z.literal(1)` to accept any
     * positive integer so a future v2 demo PARSES rather than hard-failing
     * `safeParse` (which would blank the player). Current v1 still validates
     * exactly as before; the inferred type is now `number` rather than the
     * `1` literal, but no consumer requires the literal.
     */
    version: z.number().int().min(1),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    /**
     * Legacy solid-color canvas setting. New authors should use
     * `background`; this remains accepted so older demos keep rendering.
     */
    backgroundColor: HexColorSchema.optional(),
    background: DemoBackgroundSchema.optional(),
    /**
     * Per-demo theme override. `preset` picks the theme preset for this
     * demo. `tokens` overrides individual tokens after the preset defaults
     * have been applied. `brand` sets the brand identity (`logo`, `name`,
     * `logoHref`) shown in the player header.
     */
    theme: z
      .object({
        preset: z.string().min(1).optional(),
        tokens: ThemeTokensSchema.optional(),
        brand: DemoBrandSchema.optional(),
      })
      .optional(),
    chrome: ChromeSchema.default({
      hideHeader: false,
      hideControls: false,
      mobileFooterMessage: true,
      autoplay: false,
      branding: true,
    }),
    aspectRatio: AspectRatioSchema.optional(),
    chapters: z.array(ChapterSchema).default([]),
    steps: z.array(StepSchema).min(1),
  })
  // Forward-compat: preserve unknown top-level fields on parse rather than
  // silently stripping them, so demos persisted by a newer authoring surface
  // round-trip through an older runtime without data loss. Applied only at
  // this top-level object layer; leaf schemas keep their strict validation.
  .passthrough()
  .superRefine((demo, ctx) => {
    const stepIds = new Set(demo.steps.map((step) => step.id));
    const chapterIds = new Set(demo.chapters.map((c) => c.id));

    demo.chapters.forEach((chapter, index) => {
      chapter.stepIds.forEach((stepId) => {
        if (!stepIds.has(stepId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['chapters', index, 'stepIds'],
            message: `Chapter "${chapter.id}" references unknown step "${stepId}"`,
          });
        }
      });
    });

    // Walk cover steps' headline-widget CTAs for step / chapter actions
    // that don't resolve. Catches typos at parseDemo() instead of
    // letting them no-op at click time.
    demo.steps.forEach((step, stepIndex) => {
      if (step.kind !== 'cover') return;
      step.widgets.forEach((widget, widgetIndex) => {
        if (widget.type !== 'headline') return;
        (['cta', 'secondaryCta'] as const).forEach((field) => {
          const action = widget[field]?.action;
          if (!action) return;
          if (action.type === 'step' && !stepIds.has(action.stepId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'steps',
                stepIndex,
                'widgets',
                widgetIndex,
                field,
                'action',
                'stepId',
              ],
              message: `Widget "${widget.id}" CTA targets unknown step "${action.stepId}"`,
            });
          }
          if (action.type === 'chapter' && !chapterIds.has(action.chapterId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'steps',
                stepIndex,
                'widgets',
                widgetIndex,
                field,
                'action',
                'chapterId',
              ],
              message: `Widget "${widget.id}" CTA targets unknown chapter "${action.chapterId}"`,
            });
          }
        });
      });
    });
  });

export function parseDemo(input: unknown): Demo {
  return DemoSchema.parse(input);
}

/**
 * Heal-before-parse entry point for `demo.config.json`.
 *
 * Because {@link DemoSchema} now throws on a missing or malformed `id`,
 * every surface that loads a demo config (the CLI's `dev`, `validate` and
 * `build`, the editor) routes the raw JSON through here first.
 *
 * - If `id` is absent or fails {@link isValidDemoId}, a fresh id is minted
 *   via {@link generateDemoId} and `changed: true` is returned.
 * - Otherwise the existing id is kept and `changed: false` is returned.
 *
 * The (possibly patched) object is then strict-validated through
 * `DemoSchema`, so `config` is always fully valid. `changed` tells the
 * caller whether the file should be written back + committed.
 *
 * Only the `id` is healed here; any other schema violation still throws —
 * the caller is responsible for surfacing those. The input is not mutated.
 *
 * @example
 * ```ts
 * const { config, changed } = healDemoConfig(JSON.parse(raw));
 * if (changed) await writeConfig(config); // then commit
 * ```
 */
export function healDemoConfig(raw: unknown): { config: Demo; changed: boolean } {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const hasValidId = isValidDemoId(source.id);
  const candidate = hasValidId ? source : { ...source, id: generateDemoId() };
  return { config: DemoSchema.parse(candidate), changed: !hasValidId };
}

/**
 * Like {@link healDemoConfig}, but when the config has NO valid `id` the
 * minted id is DETERMINISTIC — derived from `stableKey` via
 * {@link stableDemoIdFromKey} — instead of crypto-random.
 *
 * Several read paths may heal the same on-disk config independently. With a
 * random mint, each read would produce a DIFFERENT id for an id-less demo.
 * Keying the fallback id on a value every read shares (the demo's slug) makes
 * them agree byte-for-byte and stay stable across renders.
 *
 * No write-back: this is a render-only fallback. A config that already carries
 * a valid id is returned unchanged (`changed: false`), so this is a no-op for
 * the common case and never alters real, persisted ids.
 */
export function healDemoConfigStable(
  raw: unknown,
  stableKey: string,
): { config: Demo; changed: boolean } {
  const healed = healDemoConfig(raw);
  if (!healed.changed) return healed;
  return {
    config: { ...healed.config, id: stableDemoIdFromKey(stableKey) },
    changed: true,
  };
}

/**
 * Resolve duplicate demo ids across a set of demos (typically the cause is
 * a hand-copied folder that carries its source's id).
 *
 * Entries are grouped by `id`. Within any group of more than one, the
 * entry with the EARLIEST `updatedAt` is treated as the original and keeps
 * its id; every NEWER entry is assigned a fresh {@link generateDemoId}.
 * Ties on `updatedAt` are broken by original array order (stable), so the
 * result is deterministic for a given input ordering.
 *
 * Pure: it neither reads the filesystem nor mutates its input. `updatedAt`
 * is an abstract epoch (e.g. the file's mtime). Only the entries that need re-minting are
 * returned; the caller applies the writes.
 *
 * @example
 * ```ts
 * const remints = resolveDuplicateDemoIds(demos);
 * for (const { entry, newId } of remints) await rewriteId(entry, newId);
 * ```
 */
export function resolveDuplicateDemoIds<
  T extends { id: string; updatedAt: number },
>(entries: T[]): Array<{ entry: T; newId: string }> {
  // Preserve original index so ties on `updatedAt` resolve deterministically.
  const groups = new Map<string, Array<{ entry: T; index: number }>>();
  entries.forEach((entry, index) => {
    const group = groups.get(entry.id);
    if (group) {
      group.push({ entry, index });
    } else {
      groups.set(entry.id, [{ entry, index }]);
    }
  });

  const result: Array<{ entry: T; newId: string }> = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Oldest first; tie-break on original position so the keeper is stable.
    const sorted = [...group].sort((a, b) => {
      if (a.entry.updatedAt !== b.entry.updatedAt) {
        return a.entry.updatedAt - b.entry.updatedAt;
      }
      return a.index - b.index;
    });
    // The first (oldest) entry keeps its id; everything newer is re-minted.
    const [, ...newer] = sorted;
    for (const { entry } of newer) {
      result.push({ entry, newId: generateDemoId() });
    }
  }
  return result;
}

export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Chrome = z.infer<typeof ChromeSchema>;
export type ControlsMode = 'full' | 'minimal' | 'hidden';

/**
 * Effective player-controls mode for a demo's chrome. Prefers the
 * explicit tri-state `controls` field; falls back to the legacy
 * `hideControls` boolean so pre-existing configs keep their behavior.
 */
export function resolveControlsMode(
  chrome: Partial<Pick<Chrome, 'controls' | 'hideControls'>> | null | undefined,
): ControlsMode {
  if (chrome?.controls) return chrome.controls;
  return chrome?.hideControls ? 'hidden' : 'full';
}
export type Demo = z.infer<typeof DemoSchema>;
export type DemoBackground = z.infer<typeof DemoBackgroundSchema>;
export type DemoBackgroundType = z.infer<typeof DemoBackgroundTypeSchema>;
