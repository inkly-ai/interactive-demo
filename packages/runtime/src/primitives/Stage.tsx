import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { builtInAnnotations, type AnnotationRendererMap } from '../annotations';
import { useAnnotationEditMode } from '../annotations/edit-mode';
import { useAssetUrl, useDemoPlayerContext } from '../context';
import type {
  Annotation,
  ContentStep,
  CoverBackground,
  CoverStep,
  Message,
} from '../schema';
import { Widgets, type WidgetComponents } from './Widgets';
import {
  isVideoSourceReady,
  markVideoSourceReady,
} from '../utils/video-readiness';

const DEFAULT_GLASS_BLUR_INTENSITY = 0;
const ANNOTATION_TRANSITION_MS = 620;

function glassBackgroundStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'glassmorphism') return undefined;
  const intensity = background.intensity ?? DEFAULT_GLASS_BLUR_INTENSITY;
  return {
    '--demo-glass-blur': `${Math.max(0, intensity)}px`,
    '--demo-glass-overlay-blur': `${Math.max(0, Math.min(6, intensity + 6))}px`,
  } as CSSProperties;
}

function coverBackgroundBlurStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'image') return undefined;
  const blur =
    typeof background.blur === 'number' && Number.isFinite(background.blur)
      ? Math.min(48, Math.max(0, background.blur))
      : 0;
  if (blur <= 0) return undefined;
  return {
    '--demo-cover-background-blur': `${blur}px`,
    '--demo-cover-background-scale': `${1 + Math.min(0.12, blur / 240)}`,
  } as CSSProperties;
}

export type StageProps = {
  components?: AnnotationRendererMap;
  /**
   * Renderer overrides for widget kinds. Forwarded to the cover step's
   * inline `<Widgets />` grid.
   */
  widgetComponents?: WidgetComponents;
  className?: string;
};

/**
 * The active step's render slot.
 * - `content` → background image + annotation layer.
 * - `cover`   → backdrop + widget grid (see `Widgets.tsx`).
 *
 * The outro step kind was removed — closing screens are just final
 * cover steps with a headline widget whose CTA action is `restart` or
 * `url`. Group them under a chapter for chapter-nav metadata.
 */
export function Stage({ components, widgetComponents, className }: StageProps) {
  const { demo, state } = useDemoPlayerContext();
  const currentStep = demo?.steps[state.currentStepIndex] ?? null;

  if (!demo || !currentStep) return null;

  const isCover = currentStep.kind === 'cover';
  // ContentStage stays mounted on every step, including covers, so the
  // held content step's media keeps its state across cover↔content
  // navigation. On a cover the held stage is inert (`coverActive`) and the
  // cover UI renders on top as an overlay.
  const heldContentStep: ContentStep | null =
    currentStep.kind === 'content'
      ? currentStep
      : (demo.steps.find((entry): entry is ContentStep => entry.kind === 'content') ??
        null);

  return (
    <>
      {heldContentStep ? (
        <ContentStage
          step={heldContentStep}
          coverActive={isCover}
          components={components}
          className={className}
        />
      ) : null}
      {isCover ? (
        <CoverStage
          step={currentStep}
          className={className}
          widgetComponents={widgetComponents}
        />
      ) : null}
    </>
  );
}

function ContentStage({
  step,
  coverActive,
  components,
  className,
}: {
  step: ContentStep;
  /**
   * True when a cover step is the active step and this ContentStage is only
   * being kept mounted. In that mode it renders no active background,
   * annotations, or autoplay so the cover overlay shows through unchanged.
   */
  coverActive: boolean;
  components?: AnnotationRendererMap;
  className?: string;
}) {
  const { demo, state, dispatch } = useDemoPlayerContext();
  const title = demo?.title;
  // Resolve the background URI through the host resolver. The runtime
  // never reads `step.background.src` directly when handing a value to
  // `<img>`/`<video>` — a relative path needs the host's base to be fetchable.
  const backgroundSrc = useAssetUrl(step.background.src);
  const videoPosterSrc = useAssetUrl(
    step.background.type === 'video' ? (step.background.posterSrc ?? null) : null,
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastVideoPlaybackStateRef = useRef<{
    stepId: string;
    elapsedMs: number;
  } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [userZoomedOut, setUserZoomedOut] = useState(false);
  // Entering a zoomed image from a video step has
  // no previous image transform to interpolate from. Hold that image at 1x for
  // the first painted frame, then release it to the authored zoom. Image→image
  // navigation skips the hold so it can interpolate directly between the two
  // authored zoom/focal positions.
  const previousStepRef = useRef<{
    stepId: string;
    backgroundType: ContentStep['background']['type'];
  } | null>(null);
  const previousAnnotationStepRef = useRef<{
    stepId: string;
    annotations: Annotation[];
  } | null>(null);
  const previousStageTransformRef = useRef<{
    stepId: string;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const imageEntranceCounterRef = useRef(0);
  const imageEntranceRef = useRef<{
    stepId: string;
    token: number;
  } | null>(null);
  const [releasedImageEntranceToken, setReleasedImageEntranceToken] = useState<
    number | null
  >(null);
  const [movingAnnotationStepId, setMovingAnnotationStepId] = useState<
    string | null
  >(null);
  const [movingStageTransformStepId, setMovingStageTransformStepId] = useState<
    string | null
  >(null);
  // Video steps hold the annotation overlay and zoom transform back
  // until the WebM has played through to its final frame, so the
  // viewer watches the recorded gesture in full before the message /
  // hotspot lands on top.
  const isVideoStep = step.background.type === 'video';
  const [videoEnded, setVideoEnded] = useState(false);
  const [readyVideoSrc, setReadyVideoSrc] = useState<string | null>(
    isVideoStep && isVideoSourceReady(backgroundSrc) ? backgroundSrc : null,
  );
  const videoReady =
    !isVideoStep ||
    (backgroundSrc.length > 0 &&
      (readyVideoSrc === backgroundSrc || isVideoSourceReady(backgroundSrc)));
  const renderers = useMemo(
    () => ({ ...builtInAnnotations, ...(components ?? {}) }),
    [components],
  );
  const annotationEditMode = useAnnotationEditMode();

  useEffect(() => {
    setUserZoomedOut(false);
    setVideoEnded(false);
    setReadyVideoSrc(
      step.background.type === 'video' && isVideoSourceReady(backgroundSrc)
        ? backgroundSrc
        : null,
    );
    // Video steps auto-start on entry so the recorded gesture rolls
    // without the viewer hitting Play first.
    // Dispatching PLAY (rather than calling the element's play() directly)
    // keeps `state.isPlaying` truthful so the pause button reflects reality
    // and the reducer's `chrome.autoplay`-gated auto-advance can still kick in.
    if (!coverActive && step.background.type === 'video' && step.background.autoplay) {
      dispatch({ type: 'PLAY' });
    }
    // step.background is identity-stable per step.id; dispatch is stable.
    // `coverActive` is included so entering a content step from a cover (when the
    // held step id is unchanged) still fires the autoplay dispatch + state reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, coverActive]);

  useEffect(() => {
    setReadyVideoSrc(
      step.background.type === 'video' && isVideoSourceReady(backgroundSrc)
        ? backgroundSrc
        : null,
    );
  }, [backgroundSrc, step.background.type]);

  const previousStep = previousStepRef.current;
  const previousAnnotationStep = previousAnnotationStepRef.current;
  const hasMessageMotionTransition =
    previousAnnotationStep !== null &&
    previousAnnotationStep.stepId !== step.id &&
    shouldHideMessageDuringAnnotationTransition(
      previousAnnotationStep.annotations,
      step.annotations,
    );
  if (
    previousAnnotationStep?.stepId !== step.id ||
    previousAnnotationStep.annotations !== step.annotations
  ) {
    previousAnnotationStepRef.current = {
      stepId: step.id,
      annotations: step.annotations,
    };
  }
  if (
    step.background.type === 'image' &&
    previousStep !== null &&
    previousStep?.backgroundType !== 'image' &&
    (imageEntranceRef.current?.stepId !== step.id ||
      imageEntranceRef.current.token === releasedImageEntranceToken)
  ) {
    imageEntranceRef.current = {
      stepId: step.id,
      token: imageEntranceCounterRef.current + 1,
    };
    imageEntranceCounterRef.current += 1;
  }

  const activeImageEntranceToken =
    imageEntranceRef.current?.stepId === step.id
      ? imageEntranceRef.current.token
      : null;
  const shouldHoldImageEntranceZoom =
    activeImageEntranceToken !== null &&
    activeImageEntranceToken !== releasedImageEntranceToken;

  // Release the entrance zoom one frame after entering an image from a
  // non-image render. `useEffect` runs after the browser has painted the
  // un-zoomed frame, and the rAF defers the flip into a fresh frame so the
  // CSS transition interpolates rather than jumping.
  useEffect(() => {
    previousStepRef.current = {
      stepId: step.id,
      backgroundType: step.background.type,
    };
    if (
      activeImageEntranceToken === null ||
      activeImageEntranceToken === releasedImageEntranceToken
    ) {
      return undefined;
    }
    const raf = requestAnimationFrame(() =>
      setReleasedImageEntranceToken(activeImageEntranceToken),
    );
    return () => cancelAnimationFrame(raf);
  }, [
    activeImageEntranceToken,
    releasedImageEntranceToken,
    step.background.type,
    step.id,
  ]);

  useEffect(() => {
    if (!hasMessageMotionTransition) return undefined;
    setMovingAnnotationStepId(step.id);
    const timer = window.setTimeout(() => {
      setMovingAnnotationStepId((current) =>
        current === step.id ? null : current,
      );
    }, ANNOTATION_TRANSITION_MS);

    return () => {
      window.clearTimeout(timer);
    };
    // This effect is intentionally keyed to step changes only. Including
    // `hasMessageMotionTransition` would clear the timer on the re-render
    // caused by `setMovingAnnotationStepId`, because that derived flag is
    // only true for the first render of a new step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const markVideoReady = useCallback(() => {
    markVideoSourceReady(backgroundSrc);
    setReadyVideoSrc(backgroundSrc || null);
  }, [backgroundSrc]);

  useEffect(() => {
    if (step.background.type !== 'video') {
      lastVideoPlaybackStateRef.current = null;
      return;
    }

    const previous = lastVideoPlaybackStateRef.current;
    const shouldRewindVideo =
      state.stepElapsedMs === 0 &&
      previous !== null &&
      (previous.stepId !== step.id || previous.elapsedMs > 0);

    if (shouldRewindVideo) {
      const video = videoRef.current;
      if (video) {
        if (video.currentTime !== 0) {
          video.currentTime = 0;
        }
        setVideoEnded(false);
        if (state.isPlaying) {
          void video.play().catch(() => {});
        }
      }
    }

    lastVideoPlaybackStateRef.current = {
      stepId: step.id,
      elapsedMs: state.stepElapsedMs,
    };
  }, [state.isPlaying, state.stepElapsedMs, step.background.type, step.id]);

  // Drive the <video> element from the reducer's play/pause state.
  // Without this, the controls strip would update `isPlaying` but the
  // video would keep playing on its own autoplay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (state.isPlaying) {
      // Replay from start if the user hit play while the video was
      // parked on its last frame (restart or seek-back). Without this
      // the overlay stays visible and play() is a no-op.
      if (video.ended) {
        video.currentTime = 0;
        setVideoEnded(false);
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [state.isPlaying, step.id]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [step.id]);

  const transform = step.transform ?? { zoom: 1, x: 0.5, y: 0.5 };
  // Annotations + zoom are gated on media playback for video steps — the
  // viewer watches the recorded gesture in full before the message or
  // hotspot lands on top.
  const mediaOverlaysActive = isVideoStep ? videoEnded : true;
  // When entering an image from video, the image sits at 1x for one
  // painted frame before the authored zoom is released. Do not carry the
  // previous step's annotation DOM through that hold frame, or pointer
  // annotations can animate from stale video-step coordinates before landing on
  // the image step's final position.
  const overlaysActive = mediaOverlaysActive && !shouldHoldImageEntranceZoom;
  const isZoomable = transform.zoom > 1 && mediaOverlaysActive;
  // Apply the authored zoom only once any image-entrance frame has painted;
  // until then — and whenever the viewer has toggled zoom off — the stage
  // rests at 1× so the transition animates into the zoom.
  const effectiveZoom =
    isZoomable && !userZoomedOut && !shouldHoldImageEntranceZoom
      ? transform.zoom
      : 1;
  const previousStageTransform = previousStageTransformRef.current;
  const currentStageTransform = {
    stepId: step.id,
    zoom: effectiveZoom,
    x: transform.x,
    y: transform.y,
  };
  const hasStageTransformTransition =
    !coverActive &&
    overlaysActive &&
    previousStageTransform !== null &&
    (previousStageTransform.stepId !== currentStageTransform.stepId ||
      Math.abs(previousStageTransform.zoom - currentStageTransform.zoom) > 0.001 ||
      Math.abs(previousStageTransform.x - currentStageTransform.x) > 0.001 ||
      Math.abs(previousStageTransform.y - currentStageTransform.y) > 0.001);
  if (
    previousStageTransform === null ||
    previousStageTransform.stepId !== currentStageTransform.stepId ||
    Math.abs(previousStageTransform.zoom - currentStageTransform.zoom) > 0.001 ||
    Math.abs(previousStageTransform.x - currentStageTransform.x) > 0.001 ||
    Math.abs(previousStageTransform.y - currentStageTransform.y) > 0.001
  ) {
    previousStageTransformRef.current = currentStageTransform;
  }
  const annotationMotionActive =
    hasMessageMotionTransition ||
    hasStageTransformTransition ||
    movingAnnotationStepId === step.id ||
    movingStageTransformStepId === step.id;

  useEffect(() => {
    if (!hasStageTransformTransition) return undefined;
    setMovingStageTransformStepId(step.id);
    const timer = window.setTimeout(() => {
      setMovingStageTransformStepId((current) =>
        current === step.id ? null : current,
      );
    }, ANNOTATION_TRANSITION_MS);

    return () => {
      window.clearTimeout(timer);
    };
    // Keep this keyed to the transform values only. The state update above
    // causes a re-render where `hasStageTransformTransition` is false; including
    // it would clean up the timer before it can restore the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveZoom, step.id, transform.x, transform.y]);

  const stageStyle = {
    '--demo-stage-w': step.background.naturalWidth,
    '--demo-stage-h': step.background.naturalHeight,
    '--zoom': effectiveZoom,
    '--focal-x': transform.x,
    '--focal-y': transform.y,
    // While a cover is showing, this stage is only kept mounted — make the
    // whole held stage inert so it can never intercept pointer events meant
    // for the cover overlay on top.
    ...(coverActive ? { pointerEvents: 'none' as const } : null),
  } as CSSProperties;

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isZoomable) return;
    if (event.defaultPrevented) return;
    setUserZoomedOut((value) => !value);
  };

  const resolvedAnnotations = step.annotations;
  const blurAnnotations = resolvedAnnotations.filter(
    (annotation) => annotation.type === 'blur',
  );
  const overlayAnnotations = resolvedAnnotations.filter(
    (annotation) => annotation.type !== 'blur',
  );
  // During the one-frame image-entrance hold (entering an image from a
  // video step) the layer is kept MOUNTED but only the
  // simulated cursor renders — so a persistent cursor glides in from the
  // previous step instead of popping. Every other annotation keeps its
  // original "appear once the entrance settles" behavior, and the layer is
  // still gated on media playback overall (cursor stays hidden while a video
  // is still playing).
  const entranceHoldActive = mediaOverlaysActive && !overlaysActive;
  const mountedOverlayAnnotations = entranceHoldActive
    ? overlayAnnotations.filter(
        (annotation) =>
          annotation.type === 'message' && annotation.variant === 'cursor',
      )
    : overlayAnnotations;
  let pointerOrdinal = 0;

  return (
    <div
      ref={stageRef}
      className={className ?? 'demo-stage'}
      data-background-type={step.background.type}
      data-annotation-motion={annotationMotionActive ? '' : undefined}
      data-annotation-edit-mode={annotationEditMode ? '' : undefined}
      style={stageStyle}
      role="region"
      aria-label={title ?? 'Demo'}
    >
      <div
        className="demo-stage-inner"
        data-zoomable={isZoomable ? '' : undefined}
        data-zoomed-out={isZoomable && userZoomedOut ? '' : undefined}
        onClick={handleStageClick}
      >
        {!coverActive &&
        (step.background.type === 'video' ? (
          <>
            {!videoReady && videoPosterSrc ? (
              <img
                key={`poster:${videoPosterSrc}`}
                className="demo-stage-image"
                src={videoPosterSrc}
                alt=""
                aria-hidden
                draggable={false}
                style={{
                  objectFit: step.background.objectFit,
                  objectPosition: step.background.objectPosition,
                  position: 'absolute',
                  inset: 0,
                  transition: 'none',
                }}
              />
            ) : null}
            <video
              key={backgroundSrc || step.id}
              ref={videoRef}
              className="demo-stage-image"
              src={backgroundSrc}
              poster={videoPosterSrc || undefined}
              aria-label={step.background.alt ?? undefined}
              autoPlay={step.background.autoplay}
              muted={step.background.muted}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const v = event.currentTarget;
                if (v.readyState >= 2) {
                  markVideoReady();
                }
                if (Number.isFinite(v.duration) && v.duration > 0) {
                  dispatch({
                    type: 'VIDEO_LOADED',
                    durationMs: v.duration * 1000,
                  });
                }
              }}
              onLoadedData={markVideoReady}
              onCanPlay={markVideoReady}
              onError={() => setReadyVideoSrc(backgroundSrc || null)}
              onEnded={() => setVideoEnded(true)}
              onPause={(event) => {
                const v = event.currentTarget;
                const isNaturalEnd =
                  v.ended ||
                  (Number.isFinite(v.duration) &&
                    v.duration > 0 &&
                    v.currentTime >= v.duration - 0.05);
                if (!isNaturalEnd) {
                  dispatch({ type: 'PAUSE' });
                }
              }}
              onSeeked={(event) => {
                const v = event.currentTarget;
                if (
                  videoEnded &&
                  Number.isFinite(v.duration) &&
                  v.duration > 0 &&
                  v.currentTime < v.duration - 0.05
                ) {
                  setVideoEnded(false);
                }
              }}
              onPlay={() => {
                if (videoEnded) setVideoEnded(false);
                dispatch({ type: 'PLAY' });
              }}
              style={{
                objectFit: step.background.objectFit,
                objectPosition: step.background.objectPosition,
                opacity: videoReady ? 1 : 0,
              }}
            />
          </>
        ) : (
          <img
            className="demo-stage-image"
            src={backgroundSrc}
            alt={step.background.alt ?? ''}
            draggable={false}
            style={{
              objectFit: step.background.objectFit,
              objectPosition: step.background.objectPosition,
            }}
          />
        ))}
        {!coverActive && overlaysActive && blurAnnotations.length > 0 ? (
          <div className="demo-stage-effect-layer" aria-hidden="true">
            {blurAnnotations.map((blurAnnotation) => {
              const Renderer = renderers[blurAnnotation.type];
              if (!Renderer) return null;
              return (
                <Renderer
                  key={blurAnnotation.id}
                  annotation={blurAnnotation}
                  onAdvance={() => dispatch({ type: 'HOTSPOT_ADVANCE' })}
                  containerSize={containerSize}
                />
              );
            })}
          </div>
        ) : null}
      </div>
      {!coverActive &&
      mediaOverlaysActive &&
      mountedOverlayAnnotations.length > 0 ? (
        <div className="demo-annotation-layer">
          {mountedOverlayAnnotations.map((resolvedAnnotation) => {
            const Renderer = renderers[resolvedAnnotation.type];
            if (!Renderer) return null;
            // `pointer` and `cursor` variants share a stable positional key
            // so the SAME element persists across steps — that persistence is
            // what lets the dot / simulated cursor animate (glide) from the
            // previous step's position to the new one instead of snapping.
            const key =
              resolvedAnnotation.type === 'message' &&
              (resolvedAnnotation.variant === 'pointer' ||
                resolvedAnnotation.variant === 'cursor')
                ? `pointer-${pointerOrdinal++}`
                : resolvedAnnotation.id;
            return (
              <Renderer
                key={key}
                annotation={resolvedAnnotation}
                onAdvance={() => dispatch({ type: 'HOTSPOT_ADVANCE' })}
                containerSize={containerSize}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function firstMessageAnnotation(annotations: Annotation[]): Message | null {
  return (
    annotations.find(
      (annotation): annotation is Message => annotation.type === 'message',
    ) ?? null
  );
}

function shouldHideMessageDuringAnnotationTransition(
  previousAnnotations: Annotation[],
  nextAnnotations: Annotation[],
) {
  const previousMessage = firstMessageAnnotation(previousAnnotations);
  const nextMessage = firstMessageAnnotation(nextAnnotations);
  if (!previousMessage || !nextMessage) return false;

  if (
    previousMessage.variant === 'pointer' &&
    nextMessage.variant === 'pointer'
  ) {
    return true;
  }

  if (previousMessage.variant === nextMessage.variant) return false;

  return (
    previousMessage.variant === 'pointer' ||
    nextMessage.variant === 'pointer' ||
    previousMessage.variant === 'area' ||
    nextMessage.variant === 'area'
  );
}

function CoverStage({
  step,
  className,
  widgetComponents,
}: {
  step: CoverStep;
  className?: string;
  widgetComponents?: WidgetComponents;
}) {
  const { attribution, demo } = useDemoPlayerContext();
  const background = step.background;
  const isGlass = background?.type === 'glassmorphism';
  const glassSrc = isGlass
    ? firstContentImageSrc(demo) ?? background.src
    : undefined;
  const backgroundImage =
    background === undefined
      ? step.backgroundImage
      : background.type === 'image' && background.src
        ? { src: background.src, alt: background.alt }
        : isGlass && glassSrc
          ? { src: glassSrc, alt: '' }
          : undefined;
  const colorBackgroundStyle = coverBackgroundStyle(background);
  const stageBackgroundStyle = backgroundImage
    ? undefined
    : colorBackgroundStyle;
  const overlayBackgroundStyle = backgroundImage
    ? colorBackgroundStyle
    : undefined;
  const glassStyle = isGlass && backgroundImage
    ? glassBackgroundStyle(background)
    : undefined;
  const backgroundBlurStyle =
    background?.type === 'image'
      ? coverBackgroundBlurStyle(background)
      : undefined;
  const renderInlineBackground = !!backgroundImage;
  // Resolve cover backgroundImage through the host resolver so
  // relative media paths render correctly. Hook
  // runs unconditionally (rules of hooks); '' is returned when the field
  // is absent, which renders as a no-op <img src="">.
  const backgroundImageSrc = useAssetUrl(backgroundImage?.src);

  // CSS class names retain the legacy `.demo-intro-*` prefix — that's
  // the styling contract themes already speak. The new widget-grid
  // structure lives inside `.demo-cover-grid` (rendered by <Widgets/>).
  return (
    <div
      className={`${className ?? 'demo-stage'} demo-intro`}
      data-has-background-image={backgroundImage ? '' : undefined}
      data-background-type={background?.type}
      data-glass={isGlass && backgroundImage ? '' : undefined}
      data-widget-type={step.widgets[0]?.type}
      style={{
        ...stageBackgroundStyle,
        ...backgroundBlurStyle,
        ...glassStyle,
      }}
    >
      {renderInlineBackground && backgroundImage ? (
        <img
          className="demo-intro-background-image"
          src={backgroundImageSrc}
          alt={backgroundImage.alt ?? ''}
          aria-hidden={backgroundImage.alt ? undefined : true}
        />
      ) : null}
      {isGlass && backgroundImage ? (
        <div className="demo-intro-glass-overlay" aria-hidden />
      ) : null}
      {overlayBackgroundStyle ? (
        <div
          className="demo-intro-background-overlay"
          style={overlayBackgroundStyle}
          aria-hidden
        />
      ) : null}
      {typeof step.backgroundDim === 'number' && step.backgroundDim > 0 ? (
        <div
          className="demo-intro-dim"
          style={{ opacity: step.backgroundDim }}
          aria-hidden
        />
      ) : null}
      <Widgets components={widgetComponents} />
      {attribution ? (
        <div className="demo-intro-attribution">{attribution}</div>
      ) : null}
    </div>
  );
}

/**
 * The first contentful image in a demo — the background asset of the
 * first content step that yields a still image. Used as the visual
 * source for `glassmorphism` cover backgrounds. Returns undefined when
 * no content step has an image/poster.
 */
function firstContentImageSrc(
  demo: { steps: ReadonlyArray<{ kind: string; background?: unknown }> } | null | undefined,
): string | undefined {
  if (!demo) return undefined;
  for (const step of demo.steps) {
    if (step.kind !== 'content') continue;
    const bg = (step as ContentStep).background;
    if (bg.type === 'image' && bg.src) return bg.src;
    if (bg.type === 'video' && bg.posterSrc) return bg.posterSrc;
  }
  return undefined;
}

function coverBackgroundStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'color') return undefined;
  if (background.from && background.to) {
    return {
      background: `linear-gradient(135deg, ${background.from}, ${background.to})`,
    };
  }
  if (background.color) {
    return { background: background.color };
  }
  return undefined;
}
