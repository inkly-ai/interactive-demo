import { Button } from '../primitives/Button';
import { Captions } from '../primitives/Captions';
import { Chapters } from '../primitives/Chapters';
import { useAssetUrl, useDemoPlayerContext } from '../context';
import { Controls } from '../primitives/Controls';
import { Header } from '../primitives/Header';
import { MobileFooter } from '../primitives/MobileFooter';
import { Root, type RootProps } from '../primitives/Root';
import { Stage, type StageProps } from '../primitives/Stage';
import { ProgressBar } from '../primitives/ProgressBar';
import { StepIndicator } from '../primitives/StepIndicator';
import { Widgets } from '../primitives/Widgets';
import { markVideoSourceReady } from '../utils/video-readiness';
import {
  demoLayouts,
  type DemoControlsVisibility,
  type DemoLayout,
  type DemoLayoutId,
  type DemoSize,
} from './layouts';

type WarmMedia = {
  kind: 'image' | 'video';
  src: string;
  posterSrc?: string;
};

type WarmSlot = {
  kind: 'image' | 'video';
  rawSrc: string;
  rawPosterSrc?: string;
};

export type DemoProps = Omit<RootProps, 'children'> & {
  components?: StageProps['components'];
  size?: DemoSize;
  /**
   * Player layout. Pass a registered id (`'default'`) or a custom render
   * function for full control of the player composition.
   */
  layout?: DemoLayoutId | DemoLayout;
  /**
   * Controls visibility. `'auto'` (default) hides the controls bar until the
   * user hovers the player or focuses an interactive child. `'always'` keeps
   * them visible.
   */
  controls?: DemoControlsVisibility;
};

function DemoPlayer({
  components,
  size = 'md',
  layout = 'default',
  controls = 'auto',
  ...rootProps
}: DemoProps) {
  const Layout = typeof layout === 'string' ? demoLayouts[layout] : layout;
  return (
    <Root {...rootProps}>
      <PlayerFrame>
        <Layout size={size} controls={controls} components={components} />
      </PlayerFrame>
    </Root>
  );
}

/**
 * Reads `chrome` from the player context (only available inside `<Root>`)
 * and forwards it to `.demo-player` as a data attribute. CSS rules that
 * are conditional on a chrome flag — e.g. the small-viewport hotspot
 * hiding that pairs with `MobileFooter` — read this attribute instead of
 * relying on JS-side feature flags so they work in static builds too.
 */
function PlayerFrame({ children }: { children: React.ReactNode }) {
  const { demo, state } = useDemoPlayerContext();
  const mobileFooterMessage = demo?.chrome?.mobileFooterMessage ?? true;

  const activeStep = demo?.steps[state.currentStepIndex];
  // Keep the outer player frame stable across navigation. Individual steps
  // may carry different media ratios, but the shell/header footprint should
  // be derived once from the declared demo ratio or the first content step.
  const firstContentStep = demo?.steps.find((s) => s.kind === 'content') ?? null;
  const sizing = demo?.aspectRatio
    ? { w: demo.aspectRatio.width, h: demo.aspectRatio.height }
    : firstContentStep
      ? {
          w: firstContentStep.background.naturalWidth,
          h: firstContentStep.background.naturalHeight,
        }
      : null;
  const frameStyle = sizing
    ? ({
        '--demo-stage-w': sizing.w,
        '--demo-stage-h': sizing.h,
      } as React.CSSProperties)
    : undefined;

  // Bounded media pool: keep the nearby step media mounted so normal
  // next/prev navigation and short seeks reuse a warm browser media stack
  // instead of mounting cold <img>/<video> elements. This intentionally
  // caps the window at previous/current/next/next+1 so large demos do not
  // create one hidden media element per step.
  const mediaSlotAt = (index: number): WarmSlot | null => {
    const step = demo?.steps[index];
    if (!step || step.kind !== 'content') return null;
    const background = step.background;
    if (background.type !== 'image' && background.type !== 'video') return null;
    return {
      kind: background.type,
      rawSrc: background.src,
      rawPosterSrc: background.type === 'video' ? background.posterSrc : undefined,
    };
  };
  const previousMedia = mediaSlotAt(state.currentStepIndex - 1);
  const currentMedia = mediaSlotAt(state.currentStepIndex);
  const nextMedia = mediaSlotAt(state.currentStepIndex + 1);
  const nextNextMedia = mediaSlotAt(state.currentStepIndex + 2);

  // Fixed hook calls keep this rules-of-hooks safe while still resolving
  // each candidate through the host's asset mapper.
  const previousMediaSrc = useAssetUrl(previousMedia?.rawSrc);
  const previousMediaPosterSrc = useAssetUrl(previousMedia?.rawPosterSrc);
  const currentMediaSrc = useAssetUrl(currentMedia?.rawSrc);
  const currentMediaPosterSrc = useAssetUrl(currentMedia?.rawPosterSrc);
  const nextMediaSrc = useAssetUrl(nextMedia?.rawSrc);
  const nextMediaPosterSrc = useAssetUrl(nextMedia?.rawPosterSrc);
  const nextNextMediaSrc = useAssetUrl(nextNextMedia?.rawSrc);
  const nextNextMediaPosterSrc = useAssetUrl(nextNextMedia?.rawPosterSrc);
  const warmCandidate = (
    slot: WarmSlot | null,
    mediaSrc: string,
    posterSrc: string,
  ): WarmMedia | null => {
    if (!slot) return null;
    return mediaSrc
      ? {
          kind: slot.kind,
          src: mediaSrc,
          posterSrc,
        }
      : null;
  };
  const warmCandidates: Array<WarmMedia | null> = [
    warmCandidate(previousMedia, previousMediaSrc, previousMediaPosterSrc),
    warmCandidate(currentMedia, currentMediaSrc, currentMediaPosterSrc),
    warmCandidate(nextMedia, nextMediaSrc, nextMediaPosterSrc),
    warmCandidate(nextNextMedia, nextNextMediaSrc, nextNextMediaPosterSrc),
  ];
  const warmMedia = warmCandidates
    .filter((item): item is WarmMedia => item != null)
    .filter(
      (item, index, values) =>
        values.findIndex((candidate) => candidate.src === item.src) === index,
    );

  return (
    <div
      className="demo-player"
      data-mobile-footer-message={mobileFooterMessage ? 'on' : 'off'}
      data-step-kind={activeStep?.kind}
      style={frameStyle}
    >
      {warmMedia.map((item) =>
        item.kind === 'video' ? (
          // `display: none` can stop Safari from preloading, so keep media
          // laid out at 1x1px and hide it offscreen. Muted + playsInline
          // allows browsers to prepare video without a user gesture.
          <video
            key={`video:${item.src}`}
            src={item.src}
            poster={item.posterSrc || undefined}
            preload="auto"
            muted
            playsInline
            onLoadedData={() => markVideoSourceReady(item.src)}
            onCanPlay={() => markVideoSourceReady(item.src)}
            aria-hidden
            tabIndex={-1}
            style={hiddenWarmMediaStyle}
          />
        ) : (
          <img
            key={`image:${item.src}`}
            src={item.src}
            alt=""
            loading="eager"
            decoding="async"
            aria-hidden
            style={hiddenWarmMediaStyle}
          />
        ),
      )}
      {warmMedia.map((item) =>
        item.kind === 'video' && item.posterSrc ? (
          <img
            key={`poster:${item.posterSrc}`}
            src={item.posterSrc}
            alt=""
            loading="eager"
            decoding="async"
            aria-hidden
            style={hiddenWarmMediaStyle}
          />
        ) : null,
      )}
      {children}
    </div>
  );
}

const hiddenWarmMediaStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  left: -9999,
  top: -9999,
};

/**
 * Public component dictionary. Cover screens are rendered by `Stage`
 * directly based on `step.kind`, so there's no `Demo.Cover` — author
 * them via `kind: 'cover'` steps in `demo.steps`. `Demo.Widgets` is
 * exposed for Layer-2 consumers that want to relocate the cover-step
 * widget slot outside `Stage`. `Demo.Button` is exposed for custom
 * widget authors who want to render an authored button with the same
 * destination model as built-in widgets.
 */
export const Demo = Object.assign(DemoPlayer, {
  Root,
  Stage,
  Button,
  Captions,
  Controls,
  Chapters,
  Header,
  MobileFooter,
  ProgressBar,
  StepIndicator,
  Widgets,
});
