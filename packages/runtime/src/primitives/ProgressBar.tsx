import { type SyntheticEvent } from 'react';
import { useDemoPlayerContext } from '../context';
import type { Step } from '../schema';
import { CoverPreviewMini } from '../ui/CoverPreviewMini';

// Most segments we render at once. Beyond this the visible set becomes a
// moving window that slides to keep the active step in view (see below).
const WINDOW_SIZE = 10;

/**
 * Renders one segment per step. Cover and content are both just steps,
 * distinguished by `step.kind`. Cover steps always use the same
 * high-fidelity cover mini as editor thumbnails; content
 * steps use their background image.
 */
export function ProgressBar() {
  const { demo, state, controls, resolveAsset } = useDemoPlayerContext();

  if (!demo) return null;

  // Keep the raw decimal — rounding to integer percent makes the active
  // segment fill jump in 1% steps which reads as a stutter on wide bars.
  const value = state.stepProgress * 100;

  const segments = demo.steps;
  const totalSegments = segments.length;

  // Stage ratio for the scrub-preview thumbnails. Mirror the player's own
  // resolution order (Demo.tsx / layouts.tsx) so the previews match the
  // frame: author-declared ratio → first content step's natural size →
  // 16:9 default.
  const firstContentStep =
    demo.steps.find((s) => s.kind === 'content') ?? null;
  const stageRatio = demo.aspectRatio
    ? { width: demo.aspectRatio.width, height: demo.aspectRatio.height }
    : firstContentStep
      ? {
          width: firstContentStep.background.naturalWidth,
          height: firstContentStep.background.naturalHeight,
        }
      : { width: 16, height: 9 };
  const activeIndex = state.currentStepIndex;

  // The visible segments form a moving window centered on the active step,
  // so the bar scrolls itself as the demo advances — no pager arrows needed.
  // The window only kicks in past WINDOW_SIZE steps; it's clamped so it never
  // scrolls past either end (you always see the true first/last segment when
  // you're near it).
  const windowStart =
    totalSegments <= WINDOW_SIZE
      ? 0
      : Math.min(
          Math.max(0, activeIndex - Math.floor(WINDOW_SIZE / 2)),
          totalSegments - WINDOW_SIZE,
        );
  const windowEnd = Math.min(windowStart + WINDOW_SIZE, totalSegments);
  const visibleSegments = segments.slice(windowStart, windowEnd);

  // Keep the scrub preview centered over its segment, but nudge it
  // horizontally so it never spills past the player's edges (it would, on
  // the first/last narrow segments — worse the more segments there are).
  // CSS can't clamp an absolutely-positioned card to a non-parent
  // boundary, so we measure on hover/focus and set `--preview-shift`.
  const positionPreview = (
    event: SyntheticEvent<HTMLButtonElement>,
  ) => {
    const segment = event.currentTarget;
    const preview = segment.querySelector<HTMLElement>(
      '.demo-progress-segment-preview',
    );
    if (!preview) return;
    // Measure against the natural centered position.
    preview.style.setProperty('--preview-shift', '0px');
    // Clamp to the visible player card (`.demo-player-shell`), NOT `.demo-root`
    // — the root extends to whatever width its parent gives it, so the shell is
    // often narrower and centered inside it. Measuring against the root let the
    // first/last preview spill past the visible card edge in wide hosts.
    const player = segment.closest<HTMLElement>('.demo-player-shell');
    if (!player) return;
    const segRect = segment.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const margin = 8;
    const halfCard = preview.offsetWidth / 2;
    const center = segRect.left + segRect.width / 2;
    let shift = 0;
    const overflowLeft = playerRect.left + margin - (center - halfCard);
    const overflowRight = center + halfCard - (playerRect.right - margin);
    if (overflowLeft > 0) shift = overflowLeft;
    else if (overflowRight > 0) shift = -overflowRight;
    preview.style.setProperty('--preview-shift', `${Math.round(shift)}px`);
  };

  const fillPercent = (step: Step, index: number) => {
    if (state.status === 'ended') return 100;
    if (index < activeIndex) return 100;
    if (index === activeIndex) return value;
    return 0;
  };

  const stripMarkdown = (value: string): string =>
    value
      .replace(/[*_~`#[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const coverLabelOf = (step: Extract<Step, { kind: 'cover' }>): string => {
    const headline = step.widgets.find((w) => w.type === 'headline');
    if (headline?.title) return stripMarkdown(headline.title);
    const titled = step.widgets.find(
      (w) => 'title' in w && typeof w.title === 'string' && w.title,
    ) as { title?: string } | undefined;
    if (titled?.title) return stripMarkdown(titled.title);
    return 'Cover';
  };

  const labelOf = (step: Step, index: number): string => {
    if (step.label) return step.label;
    if (step.kind === 'cover') return coverLabelOf(step);
    return `Step ${index + 1}`;
  };

  const previewOf = (
    step: Step,
  ):
    | { kind: 'image'; src: string; alt: string | undefined }
    | { kind: 'cover'; cover: Extract<Step, { kind: 'cover' }> }
    | null => {
    if (step.kind === 'content') {
      if (step.background.type === 'image') {
        return { kind: 'image', src: step.background.src, alt: step.background.alt };
      }
      if (step.background.type === 'video' && step.background.posterSrc) {
        return {
          kind: 'image',
          src: step.background.posterSrc,
          alt: step.background.alt,
        };
      }
      return null;
    }
    if (step.kind === 'cover') {
      return { kind: 'cover', cover: resolveCoverPreviewAssets(step) };
    }
    return null;
  };

  const resolveCoverPreviewAssets = (
    step: Extract<Step, { kind: 'cover' }>,
  ): Extract<Step, { kind: 'cover' }> => {
    const background =
      step.background?.type === 'image' && step.background.src
        ? { ...step.background, src: resolveAsset(step.background.src) }
        : step.background;
    return {
      ...step,
      background,
      backgroundImage: step.backgroundImage
        ? {
            ...step.backgroundImage,
            src: resolveAsset(step.backgroundImage.src),
          }
        : undefined,
      widgets: step.widgets.map((widget) =>
        (widget.type === 'headline' || widget.type === 'form') && widget.image
          ? {
              ...widget,
              image: { ...widget.image, src: resolveAsset(widget.image.src) },
            }
          : widget,
      ),
    };
  };

  return (
    <div
      className="demo-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label="Demo progress"
    >
      <div className="demo-progress-segments">
        {visibleSegments.map((step, offset) => {
          const index = windowStart + offset;
          const active = index === activeIndex && state.status !== 'ended';
          const fill = fillPercent(step, index);
          const label = labelOf(step, index);
          const preview = previewOf(step);

          return (
            <button
              key={step.id}
              type="button"
              className="demo-progress-segment cursor-pointer"
              aria-label={`Go to ${label}`}
              aria-current={active ? 'step' : undefined}
              data-active={active ? '' : undefined}
              data-kind={step.kind}
              onClick={() => controls.seekToStep(step.id)}
              onMouseEnter={positionPreview}
              onFocus={positionPreview}
            >
              <span className="demo-progress-segment-track">
                <span
                  className="demo-progress-segment-fill"
                  style={{ width: `${fill}%` }}
                />
              </span>
              {preview ? (
                <span
                  className="demo-progress-segment-preview"
                  aria-hidden="true"
                >
                  {preview.kind === 'image' ? (
                    <img
                      src={resolveAsset(preview.src)}
                      alt={preview.alt ?? ''}
                    />
                  ) : (
                    <span className="demo-progress-segment-preview-cover">
                      <CoverPreviewMini
                        cover={preview.cover}
                        stageRatio={stageRatio}
                      />
                    </span>
                  )}
                  <span className="demo-progress-segment-preview-label">
                    {label}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
