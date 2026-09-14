import type { Demo } from '@inkly-org/interactive-demo/schema';

/**
 * The media a demo config references by path. A path is relative to the
 * demo folder (`assets/shot.png`); absolute URLs and data URIs are left
 * alone. This is the single walker `publish`, `validate` and the dev
 * server use, so they can never disagree about what a demo needs.
 */

/** True for `https://…`, `data:`, `blob:`, `//…` and `/…`: not a demo-folder path. */
export function isAbsoluteMediaRef(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value.trim());
}

/** True for a path the demo folder should hold. */
export function isRelativeMediaPath(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !isAbsoluteMediaRef(value);
}

type MediaVisitor = (value: string) => string;

/**
 * Visit every media reference in a config, in document order, replacing
 * each with the visitor's return value. Returns a new config; the input is
 * not mutated. Covers content backgrounds (and video posters), cover
 * backdrops, voiceovers, and widget logos and images.
 */
export function mapMediaRefs(config: Demo, visit: MediaVisitor): Demo {
  const at = <T extends Record<string, unknown>>(obj: T | undefined, key: keyof T & string): T | undefined => {
    if (!obj) return obj;
    const value = obj[key];
    if (typeof value !== 'string' || !value) return obj;
    return { ...obj, [key]: visit(value) };
  };
  return {
    ...config,
    steps: config.steps.map((step) => {
      // Document order: background, poster, cover backdrop, widgets, voiceover.
      if (step.kind === 'content') {
        let background = at(step.background as unknown as Record<string, unknown>, 'src');
        background = at(background, 'posterSrc');
        const voiceover = at(step.voiceover as Record<string, unknown> | undefined, 'src');
        return { ...step, background, voiceover } as typeof step;
      }
      const background = at(step.background as Record<string, unknown> | undefined, 'src');
      const backgroundImage = at(step.backgroundImage as Record<string, unknown> | undefined, 'src');
      const widgets = step.widgets.map((widget) => {
        const w = widget as unknown as Record<string, unknown>;
        return {
          ...w,
          ...(w.logo ? { logo: at(w.logo as Record<string, unknown>, 'src') } : {}),
          ...(w.image ? { image: at(w.image as Record<string, unknown>, 'src') } : {}),
        } as typeof widget;
      });
      const voiceover = at(step.voiceover as Record<string, unknown> | undefined, 'src');
      return {
        ...step,
        ...(background ? { background } : {}),
        ...(backgroundImage ? { backgroundImage } : {}),
        ...(voiceover ? { voiceover } : {}),
        widgets,
      } as typeof step;
    }),
  };
}

/** The distinct relative media paths a config references, in document order. */
export function collectMediaPaths(config: Demo): string[] {
  const seen = new Set<string>();
  mapMediaRefs(config, (value) => {
    if (isRelativeMediaPath(value)) seen.add(value.replace(/^\.\//, ''));
    return value;
  });
  return [...seen];
}
