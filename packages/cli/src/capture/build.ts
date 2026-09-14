/**
 * I/O-free transforms that turn captured screens into `demo.config.json`
 * step objects, click annotations and `assets.json` entry shapes.
 *
 * Kept pure so the assembly step (`output.ts`) is the only place that reads
 * or writes files.
 */

import type {
  Annotation,
  AssetEntry,
  AssetKind,
  Demo,
} from '@inkly-org/interactive-demo/schema';

// ─── ids ─────────────────────────────────────────────────────────────

/** Next `cap-NNN` asset id given the already-assigned entries. */
export function nextCaptureAssetId(existing: Pick<AssetEntry, 'id'>[]): string {
  let max = 0;
  for (const entry of existing) {
    const match = /^cap-(\d+)$/.exec(entry.id);
    if (!match?.[1]) continue;
    max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `cap-${(max + 1).toString().padStart(3, '0')}`;
}

/** 4-digit zero-padded screen id (audit log in assets.json `screens[]`). */
export function screenIdFromIndex(i: number): string {
  return String(i + 1).padStart(4, '0');
}

// ─── asset kinds & labels ────────────────────────────────────────────

export function assetKindForContentType(contentType: string | undefined): AssetKind {
  const ct = ((contentType ?? '').toLowerCase().split(';')[0] ?? '').trim();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('font/') || ct.includes('font') || ct.includes('woff')) {
    return 'font';
  }
  return 'other';
}

/**
 * Strip ARIA-role prefixes the capture heuristic sometimes leaves on a
 * click label (e.g. `button: Sign up` → `Sign up`). Returns "" for an
 * absent label, so callers can do `label ? \`Click on "${label}"\` : …`.
 */
export function cleanClickLabel(label: string | null | undefined): string {
  if (!label) return '';
  const stripped = label
    .replace(
      /^(?:tree\s*item|menu\s*item|menuitem|list\s*item|tab(?:\s*panel)?|button|link|option|region|combobox|radio|checkbox|switch|dialog|row|cell|columnheader|rowheader|navigation|article|banner|main|complementary|contentinfo)\s*:?\s+/i,
      '',
    )
    .trim();
  // A pointer bubble shows a single short phrase. Composite cards yield
  // "Title\nDescription"; keep only the first line and hard-cap the length so
  // the annotation never wraps into a paragraph over the screenshot.
  const firstLine =
    stripped
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? stripped;
  return firstLine.replace(/\s+/g, ' ').trim().slice(0, 48);
}

// ─── click metadata (shared input shape) ─────────────────────────────

export interface CaptureClick {
  /** Normalized 0..1 viewport coordinate. */
  x: number;
  y: number;
  label?: string | null;
  tag?: string | null;
  selector?: string | null;
  elementId?: string | null;
  outerHTML?: string | null;
}

// ─── image / video step ──────────────────────────────────────────────

export interface ImageStepInput {
  stepId: string;
  kind: 'image' | 'video';
  /** Path of the main media file, relative to the demo folder (`assets/…`). */
  src: string;
  /** Resolved id of the video poster image, when kind === "video". */
  posterSrc?: string;
  naturalWidth: number;
  naturalHeight: number;
  sourceUrl?: string;
  title?: string;
  click: CaptureClick | null;
  /** Apply a click zoom/pan transform to screenshot steps. */
  autoApplyZoom?: boolean;
  /** When the last step has no click, it gets a closing callout. */
  isLast: boolean;
}

const AUTO_ZOOM = 1.35;
const AUTO_ZOOM_EDGE_ZONE = 0.35;
const CAPTURE_CLICK_MESSAGE_VARIANT = 'cursor';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function edgeAwareFocalPoint(value: number): number {
  const clamped = clamp01(value);
  if (clamped < AUTO_ZOOM_EDGE_ZONE) {
    const t = clamped / AUTO_ZOOM_EDGE_ZONE;
    return clamped * t * t;
  }
  if (clamped > 1 - AUTO_ZOOM_EDGE_ZONE) {
    return 1 - edgeAwareFocalPoint(1 - clamped);
  }
  return clamped;
}

/** Build one image/video content step. */
export function buildImageStep(input: ImageStepInput): Demo['steps'][number] {
  const { stepId, src, posterSrc, kind, isLast } = input;
  const background =
    kind === 'video'
      ? {
          type: 'video' as const,
          src,
          posterSrc,
          naturalWidth: input.naturalWidth,
          naturalHeight: input.naturalHeight,
          alt: input.title,
          sourceUrl: input.sourceUrl ?? '',
          title: input.title,
          autoplay: true,
          muted: true,
          objectFit: 'cover' as const,
        }
      : {
          type: 'image' as const,
          src,
          naturalWidth: input.naturalWidth,
          naturalHeight: input.naturalHeight,
          alt: input.title,
          sourceUrl: input.sourceUrl ?? '',
          title: input.title,
          objectFit: 'cover' as const,
        };

  const click = input.click;
  const annotations: Annotation[] = [];
  if (click) {
    const label = cleanClickLabel(click.label);
    annotations.push({
      id: `${stepId}_${CAPTURE_CLICK_MESSAGE_VARIANT}`,
      type: 'message',
      variant: CAPTURE_CLICK_MESSAGE_VARIANT,
      x: click.x,
      y: click.y,
      text: label ? `Click on "${label}"` : 'Continue',
      anchor: 'auto',
      textAlign: 'left',
      advancesStep: true,
      showNavigation: true,
    });
  } else {
    annotations.push({
      id: `${stepId}_callout`,
      type: 'message',
      variant: 'callout',
      x: 0.5,
      y: 0.5,
      text: isLast ? 'End of walkthrough' : 'Continue',
      anchor: 'auto',
      textAlign: 'left',
      advancesStep: true,
      showNavigation: true,
    });
  }

  // Skip the click zoom when the pointer is at the exact (0,0) corner: that
  // signals a synthetic/off-viewport click with no real cursor position, and
  // anchoring a 1.35x zoom there yields a jarring top-left crop.
  const hasRealPoint = !!click && !(click.x === 0 && click.y === 0);
  const transform =
    kind === 'image' && input.autoApplyZoom === true && hasRealPoint
      ? {
          zoom: AUTO_ZOOM,
          x: Number(edgeAwareFocalPoint(click!.x).toFixed(4)),
          y: Number(edgeAwareFocalPoint(click!.y).toFixed(4)),
        }
      : undefined;

  return {
    id: stepId,
    kind: 'content',
    background,
    ...(transform ? { transform } : {}),
    annotations,
    advance: { trigger: 'click' },
  };
}
