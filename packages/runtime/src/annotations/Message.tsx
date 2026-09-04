import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { HotspotAnchor, Message as MessageAnnotation } from '../schema';
import type { AnnotationProps } from './registry';
import { useDemoPlayerContext } from '../context';
import {
  HotspotMessageCard,
  HotspotNavigationFooter,
  buildHotspotStyle,
  hotspotClassNames,
} from './hotspot-shared';
import { Markdown } from '../utils/markdown';

type Anchor = Exclude<HotspotAnchor, 'auto'>;

const POINTER_TRANSITION_MS = 620;
const POINTER_POSITION_EPSILON = 0.001;

// Simulated-cursor (Screen-Studio style) tuning. Travel duration grows
// SUB-linearly with the normalized (0–1) distance moved (duration ∝
// distance^EXP, EXP < 1). That is the key to dynamic-feeling motion: if
// duration grew linearly, every move would play at the same speed; with a
// sub-linear curve a long cross-screen jump finishes proportionally sooner,
// so it visibly travels FASTER than a short nudge. Blur grows with distance
// too, to sell that speed during the glide.
const CURSOR_TRAVEL_MIN_MS = 260;
const CURSOR_TRAVEL_MAX_MS = 1000;
const CURSOR_TRAVEL_RANGE_MS = 620;
const CURSOR_TRAVEL_EXP = 0.7;
const CURSOR_BLUR_MAX_PX = 4;
const CURSOR_BLUR_PER_UNIT_PX = 4.5;
// How long the click "press" (depress + ripple) plays before the step
// actually advances, so the gesture is visible.
const CURSOR_PRESS_MS = 170;
// In auto-advance mode, fire the click gesture once the step is this far
// through — leaves a lead before the engine advances so the press reads as
// "the cursor clicked, then we move on".
const CURSOR_AUTO_PRESS_AT = 0.88;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type CursorTravel = { ms: number; blur: number };

/** Distance-scaled travel duration + blur for a simulated-cursor glide. */
function cursorTravelFor(distance: number): CursorTravel {
  const eased = Math.pow(distance, CURSOR_TRAVEL_EXP);
  return {
    ms: clamp(
      CURSOR_TRAVEL_MIN_MS + eased * CURSOR_TRAVEL_RANGE_MS,
      CURSOR_TRAVEL_MIN_MS,
      CURSOR_TRAVEL_MAX_MS,
    ),
    blur: clamp(distance * CURSOR_BLUR_PER_UNIT_PX, 0, CURSOR_BLUR_MAX_PX),
  };
}

/**
 * Screen-Studio style cursor, rendered at the origin of its (translating)
 * track. State is read from `[data-moving]` / `[data-pressing]` on the
 * track:
 *   • moving   → arrow, motion-blurred
 *   • arrived  → pointing hand over a hollow reticle (halo ring + hollow
 *     center) that marks exactly where the hand points
 *   • hover    → reticle center fills solid + hand enlarges
 *   • pressing → hand depresses + ripple ring pings out
 * The hand is the clickable hit area (pointer-events re-enabled in CSS when
 * arrived); the rest of the glyph is decorative.
 */
function SimulatedCursor({
  onActivate,
  onHoverChange,
}: {
  onActivate: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <span
      className="demo-sim-cursor"
      onClick={onActivate}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <span className="demo-sim-cursor-dot" />
      <span className="demo-sim-cursor-ring" />
      <svg
        className="demo-sim-cursor-glyph demo-sim-cursor-arrow"
        viewBox="0 0 16 19"
        width="23"
        height="27"
      >
        <path
          d="M1 1 L1 15.5 L4.8 11.8 L7.4 17.4 L9.7 16.3 L7.1 10.8 L12.2 10.8 Z"
          fill="#fff"
          stroke="#1d1d1f"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        className="demo-sim-cursor-glyph demo-sim-cursor-hand"
        viewBox="0 0 28 28"
        width="38"
        height="38"
      >
        <path
          d="M9.5 2.2a1.7 1.7 0 0 1 1.7 1.7v6.6a1.4 1.4 0 0 1 2.8 0v0.9a1.4 1.4 0 0 1 2.7 0v1a1.4 1.4 0 0 1 2.7 0v3.2c0 3.4-2.4 6.2-6 6.2h-1.8c-2 0-3.4-0.8-4.6-2.6l-3.4-5.2a1.6 1.6 0 0 1 2.5-2l1.2 1.3V3.9a1.7 1.7 0 0 1 1.7-1.7Z"
          fill="#fff"
          stroke="#1d1d1f"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Order anchors by descending available space at the click point.
 * Used as the first pass when `anchor: 'auto'` — picks the side with
 * the most pixel headroom before we render. A subsequent measurement
 * pass (`useLayoutEffect` below) re-evaluates against the actual
 * rendered box and swaps if the heuristic guess overflows the stage.
 */
function rankAnchorsByHeadroom(x: number, y: number): Anchor[] {
  const headroom: Array<[Anchor, number]> = [
    ['bottom', 1 - y],
    ['top', y],
    ['right', 1 - x],
    ['left', x],
  ];
  // Sort by space; ties prefer vertical anchors because labels are
  // typically wider than tall and fit more easily above/below.
  headroom.sort((a, b) => {
    const diff = b[1] - a[1];
    if (diff !== 0) return diff;
    return (a[0] === 'bottom' || a[0] === 'top') ? -1 : 1;
  });
  return headroom.map(([a]) => a);
}

interface OverflowResult {
  /** Total pixels the box spills past the visible viewport on all four sides. */
  total: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function visibleBoundsFor(el: HTMLElement): Bounds {
  const win = el.ownerDocument.defaultView;
  const margin = 8;
  const viewportBounds = win
    ? {
        left: margin,
        right: Math.max(margin, win.innerWidth - margin),
        top: margin,
        bottom: Math.max(margin, win.innerHeight - margin),
      }
    : null;
  const stageRect =
    el.closest<HTMLElement>('.demo-stage')?.getBoundingClientRect() ??
    el.parentElement?.getBoundingClientRect();

  if (!stageRect) {
    return viewportBounds ?? { left: 0, right: 0, top: 0, bottom: 0 };
  }

  const stageBounds = {
    left: stageRect.left + margin,
    right: Math.max(stageRect.left + margin, stageRect.right - margin),
    top: stageRect.top + margin,
    bottom: Math.max(stageRect.top + margin, stageRect.bottom - margin),
  };

  if (!viewportBounds) return stageBounds;

  return {
    left: Math.max(stageBounds.left, viewportBounds.left),
    right: Math.min(stageBounds.right, viewportBounds.right),
    top: Math.max(stageBounds.top, viewportBounds.top),
    bottom: Math.min(stageBounds.bottom, viewportBounds.bottom),
  };
}

function measureOverflow(
  boxRect: DOMRect,
  bounds: Bounds,
): OverflowResult {
  const left = Math.max(0, bounds.left - boxRect.left);
  const right = Math.max(0, boxRect.right - bounds.right);
  const top = Math.max(0, bounds.top - boxRect.top);
  const bottom = Math.max(0, boxRect.bottom - bounds.bottom);
  return { total: left + right + top + bottom, left, right, top, bottom };
}

interface ResolvedAnchor {
  anchor: Anchor;
  shiftX: number;
  shiftY: number;
  settling: boolean;
  /**
   * False until the auto-anchor probe has run its final, post-entrance pass.
   * The label is held hidden while false so it appears once at its resolved
   * side instead of sliding there from the coordinate-only initial guess.
   */
  ready: boolean;
}

function offsetForOverflow(overflow: OverflowResult): Pick<ResolvedAnchor, 'shiftX' | 'shiftY'> {
  return {
    shiftX: overflow.left > 0 ? overflow.left : overflow.right > 0 ? -overflow.right : 0,
    shiftY: overflow.top > 0 ? overflow.top : overflow.bottom > 0 ? -overflow.bottom : 0,
  };
}

/**
 * After first paint, measure the pointer container against the visible
 * iframe viewport and pick the anchor with the least overflow. Mutates
 * only via the setter so the explicit anchor → CSS rule keeps the dot
 * pinned to the click point.
 */
function useAutoAnchor(
  enabled: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  x: number,
  y: number,
  initial: Anchor,
): ResolvedAnchor {
  const [resolved, setResolved] = useState<Omit<ResolvedAnchor, 'ready'>>({
    anchor: initial,
    shiftX: 0,
    shiftY: 0,
    settling: false,
  });
  // Explicit (non-auto) anchors never re-resolve, so they're ready at once.
  const [ready, setReady] = useState(!enabled);
  const readyRef = useRef(!enabled);
  const settleFrameRef = useRef<number | null>(null);

  const markReady = useCallback(() => {
    if (!readyRef.current) {
      readyRef.current = true;
      setReady(true);
    }
  }, []);

  const applyResolved = useCallback(
    (next: Omit<ResolvedAnchor, 'settling' | 'ready'>) => {
      setResolved({ ...next, settling: true });
      if (settleFrameRef.current !== null) {
        window.cancelAnimationFrame(settleFrameRef.current);
      }
      settleFrameRef.current = window.requestAnimationFrame(() => {
        settleFrameRef.current = null;
        setResolved((current) => ({ ...current, settling: false }));
      });
    },
    [],
  );

  useLayoutEffect(() => {
    if (!enabled) {
      setResolved({ anchor: initial, shiftX: 0, shiftY: 0, settling: false });
      readyRef.current = true;
      setReady(true);
      return;
    }

    readyRef.current = false;
    setReady(false);

    const resolvePlacement = (final: boolean) => {
      const el = containerRef.current;
      const stage =
        el?.closest<HTMLElement>('.demo-stage') ?? el?.parentElement;
      const measurementHost =
        el?.closest<HTMLElement>('.demo-annotation-layer') ?? el?.parentElement;
      const stageRect = stage?.getBoundingClientRect();
      if (
        !el ||
        !stage ||
        !measurementHost ||
        !stageRect ||
        stageRect.width === 0 ||
        stageRect.height === 0
      ) {
        // Not measurable yet. On the final pass reveal anyway so the label
        // can never stay hidden forever.
        if (final) markReady();
        return;
      }
      const bounds = visibleBoundsFor(el);

      const ordered = rankAnchorsByHeadroom(x, y);
      const baseClass = el.className.replace(
        /demo-hotspot-anchor-\w+/g,
        '',
      ).trim();
      const probe = el.cloneNode(true) as HTMLElement;
      probe.setAttribute('aria-hidden', 'true');
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.transition = 'none';
      probe.style.setProperty('--hotspot-label-shift-x', '0px');
      probe.style.setProperty('--hotspot-label-shift-y', '0px');
      const probeLabel = probe.querySelector<HTMLElement>('.demo-hotspot-label');
      if (probeLabel) {
        probeLabel.style.transition = 'none';
      }
      measurementHost.appendChild(probe);

      let best: Anchor = ordered[0]!;
      let bestOverflow = Infinity;
      let bestOffset: Pick<ResolvedAnchor, 'shiftX' | 'shiftY'> = {
        shiftX: 0,
        shiftY: 0,
      };

      try {
        for (const candidate of ordered) {
          probe.className = `${baseClass} demo-hotspot-anchor-${candidate}`;
          const measured = probeLabel ?? probe;
          const boxRect = measured.getBoundingClientRect();
          const overflow = measureOverflow(boxRect, bounds);
          if (overflow.total < bestOverflow) {
            best = candidate;
            bestOverflow = overflow.total;
            bestOffset = offsetForOverflow(overflow);
          }
          if (overflow.total === 0) break;
        }
      } finally {
        probe.remove();
      }

      applyResolved({ anchor: best, ...bestOffset });
      // Reveal only after the final, post-entrance pass: by then the stage and
      // pointer transition have settled and `best` is stable, so the label
      // fades in in place rather than sliding from the initial guess.
      if (final) markReady();
    };

    resolvePlacement(false);
    const frame = window.requestAnimationFrame(() => resolvePlacement(false));
    const timer = window.setTimeout(
      () => resolvePlacement(true),
      POINTER_TRANSITION_MS + 80,
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (settleFrameRef.current !== null) {
        window.cancelAnimationFrame(settleFrameRef.current);
        settleFrameRef.current = null;
      }
    };
  }, [enabled, containerRef, x, y, initial, applyResolved, markReady]);

  return { ...resolved, ready };
}

export function Message(props: AnnotationProps<MessageAnnotation>) {
  switch (props.annotation.variant) {
    case 'pointer':
    case 'cursor':
      // `cursor` reuses the pointer layout (a point at x/y with an inline
      // label) but swaps the pulsing dot for a Screen-Studio simulated
      // cursor. PointerVariant branches on the variant internally.
      return <PointerVariant {...props} />;
    case 'callout':
      return <CalloutVariant {...props} />;
    case 'area':
      return <AreaVariant {...props} />;
  }
}

function PointerVariant({
  annotation,
  onAdvance,
}: AnnotationProps<MessageAnnotation>) {
  const { demo, internalState } = useDemoPlayerContext();
  const totalSteps = demo?.steps.length ?? 0;
  const cursorEnabled = annotation.variant === 'cursor';
  // Auto-advance mode: the engine advances on a timer (no click), so the
  // card shows without a hover and we play the click gesture ourselves near
  // the end of each step.
  const currentStep = demo?.steps[internalState.currentStepIndex];
  const autoMode =
    cursorEnabled &&
    Boolean(demo?.chrome?.autoplay) &&
    currentStep?.kind === 'content' &&
    (currentStep.advance?.trigger ?? 'auto') === 'auto';
  const showMessage =
    annotation.showMessage ?? (cursorEnabled ? false : true);
  // Cursor mode hides the step counter + prev/next footer — the cursor IS
  // the navigation affordance, so the card is just the (hover-revealed) note.
  const showNav = !cursorEnabled && annotation.showNavigation && totalSteps > 0;
  const shouldRenderLabel = cursorEnabled || showMessage;
  const hasMessage = shouldRenderLabel && (Boolean(annotation.text) || showNav);

  const [isMoving, setIsMoving] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const previousPositionRef = useRef({ x: annotation.x, y: annotation.y });
  const containerRef = useRef<HTMLDivElement>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const autoPressTimerRef = useRef<number | null>(null);
  const autoPressedStepRef = useRef<number | null>(null);

  // Hover is shared between the cursor glyph (in the track) and the card (in
  // the wrapper) — two sibling subtrees with no common element — so CSS
  // :hover can't bridge them. Drive it from state instead, with a short
  // close delay so crossing the gap to the card doesn't flicker it shut.
  const setHover = (next: boolean) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (next) {
      setIsHovered(true);
    } else {
      hoverTimerRef.current = window.setTimeout(() => setIsHovered(false), 90);
    }
  };

  // Distance moved since the last committed position drives both the CSS
  // travel duration and the blur. Computed in render (before the effect
  // below updates the ref) so the new --pointer-travel-ms is on the element
  // in the same commit that changes left/top — otherwise the glide would
  // use a stale duration.
  const travelDistance = cursorEnabled
    ? Math.hypot(
        annotation.x - previousPositionRef.current.x,
        annotation.y - previousPositionRef.current.y,
      )
    : 0;
  const travel = cursorTravelFor(travelDistance);

  useEffect(() => {
    const previous = previousPositionRef.current;
    const dx = previous.x - annotation.x;
    const dy = previous.y - annotation.y;
    if (
      Math.abs(dx) <= POINTER_POSITION_EPSILON &&
      Math.abs(dy) <= POINTER_POSITION_EPSILON
    ) {
      return;
    }

    previousPositionRef.current = { x: annotation.x, y: annotation.y };
    const movingMs = cursorEnabled
      ? cursorTravelFor(Math.hypot(dx, dy)).ms
      : POINTER_TRANSITION_MS;
    setIsMoving(true);
    const timer = window.setTimeout(() => {
      setIsMoving(false);
    }, movingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [annotation.x, annotation.y, cursorEnabled]);

  // Auto-advance: play the click gesture once per step, near the end, so the
  // hand visibly "clicks" before the engine moves on. Gated by step index via
  // a ref so the frequent stepProgress ticks fire it exactly once. Skipped
  // while traveling so the press never overlaps the glide.
  const { currentStepIndex, stepProgress, isPlaying } = internalState;
  useEffect(() => {
    if (!autoMode || !isPlaying || isMoving) return;
    if (autoPressedStepRef.current === currentStepIndex) return;
    if (stepProgress < CURSOR_AUTO_PRESS_AT) return;
    autoPressedStepRef.current = currentStepIndex;
    setIsPressing(true);
    if (autoPressTimerRef.current !== null) {
      window.clearTimeout(autoPressTimerRef.current);
    }
    autoPressTimerRef.current = window.setTimeout(() => {
      autoPressTimerRef.current = null;
      setIsPressing(false);
    }, CURSOR_PRESS_MS + 60);
  }, [autoMode, isPlaying, isMoving, currentStepIndex, stepProgress]);

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      if (autoPressTimerRef.current !== null) {
        window.clearTimeout(autoPressTimerRef.current);
      }
    },
    [],
  );

  const requestedAnchor = annotation.anchor ?? 'auto';
  const isAuto = requestedAnchor === 'auto';
  const initialAnchor: Anchor = isAuto
    ? rankAnchorsByHeadroom(annotation.x, annotation.y)[0]!
    : (requestedAnchor as Anchor);

  const resolvedAnchor = useAutoAnchor(
    isAuto,
    containerRef,
    annotation.x,
    annotation.y,
    initialAnchor,
  );

  const effectiveAnchor: Anchor = isAuto
    ? resolvedAnchor.anchor
    : (requestedAnchor as Anchor);

  const positionStyle: CSSProperties = {
    ['--x' as string]: annotation.x,
    ['--y' as string]: annotation.y,
    ['--hotspot-label-shift-x' as string]: `${isAuto ? resolvedAnchor.shiftX : 0}px`,
    ['--hotspot-label-shift-y' as string]: `${isAuto ? resolvedAnchor.shiftY : 0}px`,
  };

  // Cursor mode renders the moving glyph on a separate full-stage "track"
  // that is positioned with a GPU-composited `transform: translate(x%, y%)`
  // rather than the wrapper's `top`/`left` — that is what makes the glide
  // crisp (compositor thread) instead of paint-bound. The hit target + the
  // hover-reveal card stay on the point wrapper below.
  const trackStyle: CSSProperties = {
    ['--x' as string]: annotation.x,
    ['--y' as string]: annotation.y,
    ['--pointer-travel-ms' as string]: `${travel.ms}ms`,
    ['--cursor-blur' as string]: `${travel.blur}px`,
  };

  const style = buildHotspotStyle(annotation, positionStyle);
  const className = hotspotClassNames(
    { ...annotation, anchor: effectiveAnchor },
    'demo-annotation-point demo-hotspot-pointer',
  );

  const advance = () => {
    if (!annotation.advancesStep) return;
    // Without the cursor, advance immediately (legacy behavior). With the
    // simulated cursor, play the press gesture first, then advance.
    if (!cursorEnabled) {
      onAdvance();
      return;
    }
    if (advanceTimerRef.current !== null) return; // press already in flight
    // Clear hover immediately. Otherwise the card stays revealed through the
    // advance and flashes in at the NEXT position (the wrapper snaps there
    // before the cursor's travel pulls the hand out from under the mouse and
    // fires mouseLeave).
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(false);
    setIsPressing(true);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      setIsPressing(false);
      onAdvance();
    }, CURSOR_PRESS_MS);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    advance();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      advance();
    }
  };

  const handleLabelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    advance();
  };

  const handleLabelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      advance();
    }
  };

  const wrapper = (
    <div
      ref={containerRef}
      className={className}
      style={style}
      data-moving={isMoving ? '' : undefined}
      data-anchor-settling={resolvedAnchor.settling ? '' : undefined}
      data-anchor-pending={isAuto && !resolvedAnchor.ready ? '' : undefined}
      data-cursor={cursorEnabled ? '' : undefined}
      data-hover={cursorEnabled && isHovered ? '' : undefined}
      data-auto={autoMode ? '' : undefined}
      data-show-message={cursorEnabled && showMessage ? '' : undefined}
    >
      <button
        type="button"
        className="demo-hotspot-trigger cursor-pointer"
        aria-label={annotation.text ?? 'Hotspot'}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {cursorEnabled ? null : <span className="demo-hotspot-dot" />}
      </button>
      {hasMessage ? (
        <div
          role="button"
          tabIndex={0}
          className="demo-hotspot-label cursor-pointer"
          aria-label={annotation.text ?? 'Hotspot'}
          onClick={handleLabelClick}
          onKeyDown={handleLabelKeyDown}
          onMouseEnter={cursorEnabled ? () => setHover(true) : undefined}
          onMouseLeave={cursorEnabled ? () => setHover(false) : undefined}
        >
          {annotation.text ? (
            <div className="demo-hotspot-label-text">
              <Markdown text={annotation.text} />
            </div>
          ) : null}
          {showNav ? (
            <HotspotNavigationFooter
              prevButton={annotation.prevButton}
              nextButton={annotation.nextButton}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!cursorEnabled) return wrapper;

  // Wrapper FIRST, track second: the editor measures an annotation's
  // `firstElementChild` to compute drag bounds / selection, so the point
  // wrapper (at x/y) must lead — not the full-stage track. The track sits
  // above visually via its own z-index regardless of DOM order.
  return (
    <>
      {wrapper}
      <div
        className="demo-sim-cursor-track"
        style={trackStyle}
        data-moving={isMoving ? '' : undefined}
        data-pressing={isPressing ? '' : undefined}
        data-hover={isHovered ? '' : undefined}
        aria-hidden
      >
        <SimulatedCursor onActivate={advance} onHoverChange={setHover} />
      </div>
    </>
  );
}

function CalloutVariant({
  annotation,
  onAdvance,
}: AnnotationProps<MessageAnnotation>) {
  const positionStyle: CSSProperties = {
    ['--x' as string]: annotation.x,
    ['--y' as string]: annotation.y,
  };

  const style = buildHotspotStyle(annotation, positionStyle);
  const className = hotspotClassNames(
    annotation,
    'demo-annotation-point demo-hotspot-callout',
  );

  const advance = () => {
    if (annotation.advancesStep) {
      onAdvance();
    }
  };

  return (
    <HotspotMessageCard
      text={annotation.text}
      ariaLabel={annotation.text ?? 'Callout'}
      className={className}
      style={style}
      showNavigation={annotation.showNavigation}
      prevButton={annotation.prevButton}
      nextButton={annotation.nextButton}
      onActivate={advance}
    />
  );
}

/**
 * Pick the side of the area rectangle with the most outside room so the
 * message doesn't overlap the selected region. Used when the area's
 * anchor is left as `auto` — the shared `.demo-hotspot-anchor-auto`
 * fallback centers the message inside the rect, which defeats the point
 * of an area highlight.
 */
function pickAreaAutoAnchor(
  x: number,
  y: number,
  w: number,
  h: number,
): Anchor {
  const room: Array<[Anchor, number]> = [
    ['bottom', 1 - (y + h)],
    ['top', y],
    ['right', 1 - (x + w)],
    ['left', x],
  ];
  room.sort((a, b) => {
    const diff = b[1] - a[1];
    if (diff !== 0) return diff;
    return (a[0] === 'bottom' || a[0] === 'top') ? -1 : 1;
  });
  return room[0]![0];
}

function AreaVariant({ annotation, onAdvance }: AnnotationProps<MessageAnnotation>) {
  const w = annotation.w ?? 0.2;
  const h = annotation.h ?? 0.2;

  const regionStyle: CSSProperties = {
    ['--x' as string]: annotation.x,
    ['--y' as string]: annotation.y,
    ['--w' as string]: w,
    ['--h' as string]: h,
  };

  const style = buildHotspotStyle(annotation, regionStyle);
  const requestedAnchor = annotation.anchor ?? 'auto';
  const effectiveAnchor: Anchor =
    requestedAnchor === 'auto'
      ? pickAreaAutoAnchor(annotation.x, annotation.y, w, h)
      : (requestedAnchor as Anchor);
  const wrapperClass = hotspotClassNames(
    { ...annotation, anchor: effectiveAnchor },
    'demo-annotation-region demo-hotspot-area',
  );

  const advance = () => {
    if (annotation.advancesStep) {
      onAdvance();
    }
  };

  const handleOutlineClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    advance();
  };

  return (
    <div className={wrapperClass} style={style}>
      <button
        type="button"
        className="demo-hotspot-area-outline cursor-pointer"
        aria-label={annotation.text ?? 'Hotspot area'}
        onClick={handleOutlineClick}
      />
      <HotspotMessageCard
        text={annotation.text}
        ariaLabel={annotation.text ?? 'Hotspot area'}
        className="demo-hotspot-area-message"
        showNavigation={annotation.showNavigation}
        prevButton={annotation.prevButton}
        nextButton={annotation.nextButton}
        onActivate={advance}
      />
    </div>
  );
}
