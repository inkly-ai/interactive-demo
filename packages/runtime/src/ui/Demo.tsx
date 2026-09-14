import { Button } from '../primitives/Button';
import { Captions } from '../primitives/Captions';
import { Chapters } from '../primitives/Chapters';
import { useAssetUrl, useDemoPlayerContext } from '../context';
import { Controls } from '../primitives/Controls';
import { Header } from '../primitives/Header';
import { MobileFooter } from '../primitives/MobileFooter';
import { useEffect, useState } from 'react';
import { joinBaseUrl, Root, type RootProps } from '../primitives/Root';
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

export type DemoProps = Omit<RootProps, 'children' | 'config'> & {
  /**
   * The demo. A string is the URL of its folder: `demo.config.json` is
   * fetched from there and relative media paths resolve against it. An
   * object is the config itself (an imported JSON, or one built in code);
   * relative media paths then need `baseUrl`.
   */
  src?: string | unknown;
  /** The config object. Same as an object `src`; kept for existing hosts. */
  config?: unknown;
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

type PlayerProps = Omit<DemoProps, 'src' | 'config'> & { config: unknown };

function DemoPlayer({
  components,
  size = 'md',
  layout = 'default',
  controls = 'auto',
  ...rootProps
}: PlayerProps) {
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
/**
 * Folder form: fetch the config from `<url>/demo.config.json` and play it
 * with the folder as the media base. A short placeholder shows while the
 * request is in flight; a failed request renders the standalone player's
 * error card so a wrong URL is visible on the page.
 */
function DemoFolder({ url, ...rest }: Omit<PlayerProps, 'config'> & { url: string }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; config: unknown } | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(joinBaseUrl(url, 'demo.config.json'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url || url}`);
        return (await res.json()) as unknown;
      })
      .then(
        (config) => {
          if (!cancelled) setState({ kind: 'ready', config });
        },
        (err: unknown) => {
          if (!cancelled) setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.kind === 'loading') {
    return <div className="demo-loading">Loading demo…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="demo-error" role="alert">
        <h2>Demo failed to load</h2>
        <pre>{`Could not fetch demo.config.json from ${url}\n${state.message}`}</pre>
      </div>
    );
  }
  return <DemoPlayer {...rest} config={state.config} baseUrl={rest.baseUrl ?? url} />;
}

function DemoEntry({ src, config, ...rest }: DemoProps) {
  if (typeof src === 'string') return <DemoFolder {...rest} url={src} />;
  return <DemoPlayer {...rest} config={src ?? config} />;
}

export const Demo = Object.assign(DemoEntry, {
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
