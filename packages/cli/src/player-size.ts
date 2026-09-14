import type { Demo } from '@inkly-org/interactive-demo/schema';

/**
 * How big a demo's player renders, for hosts that size an iframe to it
 * (ported from the original viewer's aspect-ratio helper).
 *
 * The ratio is, in priority order: the config's explicit `aspectRatio`,
 * the natural size of the first content step's background, else 16:9.
 * The vertical chrome is the player header the theme draws above the
 * stage, which an exact host box has to add to the ratio-derived height.
 */

export interface PlayerAspectRatio {
  width: number;
  height: number;
}

const DEFAULT_ASPECT_RATIO: PlayerAspectRatio = { width: 16, height: 9 };

function positivePair(width: unknown, height: unknown): PlayerAspectRatio | null {
  const w = Number(width);
  const h = Number(height);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  return null;
}

export function playerAspectRatioForConfig(config: Demo): PlayerAspectRatio {
  const explicit = config.aspectRatio ? positivePair(config.aspectRatio.width, config.aspectRatio.height) : null;
  if (explicit) return explicit;
  const firstContent = config.steps.find((step) => step.kind === 'content');
  if (firstContent && firstContent.kind === 'content') {
    const fromBackground = positivePair(firstContent.background.naturalWidth, firstContent.background.naturalHeight);
    if (fromBackground) return fromBackground;
  }
  return { ...DEFAULT_ASPECT_RATIO };
}

/** Height of the player header per theme preset; must track the presets' CSS. */
export function playerHeaderHeight(themeId: string | null | undefined): number {
  if (themeId === 'mono') return 48;
  return 52;
}

/** Vertical chrome above the stage: the header, unless the demo hides it. */
export function playerVerticalChromeHeightForConfig(config: Demo): number {
  if (config.chrome?.hideHeader === true) return 0;
  return playerHeaderHeight(config.theme?.preset ?? 'default');
}

export interface PlayerSize {
  aspectRatio: PlayerAspectRatio;
  verticalChromeHeight: number;
}

export function playerSizeForConfig(config: Demo): PlayerSize {
  return {
    aspectRatio: playerAspectRatioForConfig(config),
    verticalChromeHeight: playerVerticalChromeHeightForConfig(config),
  };
}
