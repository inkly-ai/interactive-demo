import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { resolveControlsMode } from '../schema';
import { useDemoPlayerContext } from '../context';
import { canNavigateNext, canNavigatePrev } from '../engine';
import { Captions } from '../primitives/Captions';
import { Controls } from '../primitives/Controls';
import { Header } from '../primitives/Header';
import { MobileFooter } from '../primitives/MobileFooter';
import { Stage, type StageProps } from '../primitives/Stage';

export type DemoSize = 'sm' | 'md' | 'lg';

/**
 * `auto` (default): controls bar fades in when the user hovers the player or
 * focuses an interactive child. Hidden otherwise.
 * `always`: controls stay visible at all times.
 */
export type DemoControlsVisibility = 'auto' | 'always';

export type DemoLayoutProps = {
  size: DemoSize;
  controls: DemoControlsVisibility;
  components?: StageProps['components'];
};

export type DemoLayout = (props: DemoLayoutProps) => ReactNode;

export type DemoLayoutId = 'default';

function PlayerShell({
  size,
  controls: controlsVisibility,
  children,
}: {
  size: DemoSize;
  controls: DemoControlsVisibility;
  children: ReactNode;
}) {
  const { demo, controls, state } = useDemoPlayerContext();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const keyboardActiveRef = useRef(false);

  // Aspect-ratio stays stable across navigation. Priority:
  //   1. Author-declared `demo.aspectRatio` (explicit escape hatch).
  //   2. First content step's natural dimensions.
  //   3. CSS default of 16:9 when neither is present.
  const firstContentStep = demo?.steps.find((s) => s.kind === 'content') ?? null;
  const sizing = demo?.aspectRatio
    ? { w: demo.aspectRatio.width, h: demo.aspectRatio.height }
    : firstContentStep
      ? {
          w: firstContentStep.background.naturalWidth,
          h: firstContentStep.background.naturalHeight,
        }
      : null;
  const shellStyle = sizing
    ? ({
        '--demo-stage-w': sizing.w,
        '--demo-stage-h': sizing.h,
      } as CSSProperties)
    : undefined;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target;
      if (isTextEditingTarget(target)) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (canNavigatePrev(demo, state)) {
            controls.prev();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (canNavigateNext(demo, state)) {
            controls.next();
          }
          break;
        case ' ':
          if (event.target instanceof HTMLButtonElement) return;
          event.preventDefault();
          controls.toggle();
          break;
        case 'm':
        case 'M':
          controls.toggleMute();
          break;
      }
    },
    [controls, demo, state],
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    const activateIfInside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && shell.contains(target)) {
        keyboardActiveRef.current = true;
      }
    };
    const deactivateIfOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !shell.contains(target)) {
        keyboardActiveRef.current = false;
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!keyboardActiveRef.current) return;
      handleKeyDown(event);
    };

    document.addEventListener('pointerdown', activateIfInside, true);
    document.addEventListener('pointerdown', deactivateIfOutside, true);
    document.addEventListener('focusin', activateIfInside, true);
    document.addEventListener('focusin', deactivateIfOutside, true);
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', activateIfInside, true);
      document.removeEventListener('pointerdown', deactivateIfOutside, true);
      document.removeEventListener('focusin', activateIfInside, true);
      document.removeEventListener('focusin', deactivateIfOutside, true);
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !keyboardActiveRef.current) return;
    const activeElement = document.activeElement;
    if (
      activeElement === document.body ||
      activeElement === document.documentElement ||
      activeElement === null
    ) {
      shell.focus({ preventScroll: true });
    }
  }, [state.currentStepId]);

  return (
    <div
      ref={shellRef}
      className="demo-player-shell"
      data-size={size}
      data-controls={controlsVisibility}
      style={shellStyle}
      tabIndex={0}
      onFocus={() => {
        keyboardActiveRef.current = true;
      }}
    >
      {children}
    </div>
  );
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function DefaultLayout({ size, controls, components }: DemoLayoutProps) {
  const { demo } = useDemoPlayerContext();
  const chrome = demo?.chrome;
  // Defaults are baked into the schema, but `demo` is null until the
  // config parses — fall back to the same defaults here so the layout
  // doesn't briefly paint chrome that the parsed config would have
  // hidden.
  const hideHeader = chrome?.hideHeader ?? false;
  const controlsMode = resolveControlsMode(chrome);
  const mobileFooterMessage = chrome?.mobileFooterMessage ?? true;
  // The transport bar rides along on every step — cover steps included —
  // so viewers always have a forward/back + share/fullscreen affordance.
  // (Covers used to hide the `full` bar; a full-bleed embed or a cover
  // without a CTA otherwise left no way to advance.) Only `hidden`
  // suppresses it entirely.
  const renderControls = controlsMode !== 'hidden';
  return (
    <>
      {hideHeader ? null : <Header />}
      <PlayerShell size={size} controls={controls}>
        <Stage components={components} />
        <Captions />
        {renderControls ? (
          <Controls variant={controlsMode === 'minimal' ? 'minimal' : 'full'} />
        ) : null}
      </PlayerShell>
      {mobileFooterMessage ? <MobileFooter /> : null}
    </>
  );
}

export const demoLayouts: Record<DemoLayoutId, DemoLayout> = {
  default: DefaultLayout,
};
