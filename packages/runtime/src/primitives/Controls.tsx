import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useDemoPlayerContext } from '../context';
import { canNavigateNext, canNavigatePrev } from '../engine';
import { ProgressBar } from './ProgressBar';
import { StepIndicator } from './StepIndicator';
import {
  CaptionsIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FullscreenIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  Volume2Icon,
  VolumeXIcon,
} from './icons';

function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const onClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    // Climb to the player root so the entire frame (header + stage +
    // controls) enters fullscreen, not just the controls strip.
    const target =
      event.currentTarget.closest<HTMLElement>('.demo-root') ??
      event.currentTarget.closest<HTMLElement>('.demo-player');
    if (target?.requestFullscreen) {
      void target.requestFullscreen();
    }
  }, []);

  return (
    <button
      type="button"
      className="demo-control-button demo-control-fullscreen cursor-pointer"
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      aria-pressed={isFullscreen}
      onClick={onClick}
    >
      <FullscreenIcon className="demo-icon" />
    </button>
  );
}

/**
 * Copy-link button. Copies the host-supplied demo URL to the
 * clipboard and flips to a checkmark for a beat. Renders nothing when the
 * host doesn't supply a `shareUrl` (e.g. an unsaved editor preview).
 */
function ShareButton() {
  const { shareUrl } = useDemoPlayerContext();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onClick = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can reject in insecure contexts or without focus;
      // fail silently rather than break the controls bar.
    }
  }, [shareUrl]);

  if (!shareUrl) return null;

  return (
    <button
      type="button"
      className="demo-control-button demo-control-share cursor-pointer"
      aria-label={copied ? 'Link copied' : 'Copy link'}
      data-copied={copied || undefined}
      onClick={onClick}
    >
      {copied ? (
        <CheckIcon className="demo-icon" />
      ) : (
        <LinkIcon className="demo-icon" />
      )}
    </button>
  );
}

function transportState(
  demo: ReturnType<typeof useDemoPlayerContext>['demo'],
  state: ReturnType<typeof useDemoPlayerContext>['state'],
): { canPrev: boolean; canNext: boolean; canReplay: boolean } {
  return {
    canPrev: canNavigatePrev(demo, state),
    canNext: canNavigateNext(demo, state),
    canReplay: state.status === 'ended',
  };
}

export type ControlsProps = {
  /**
   * `'full'` (default) renders the segmented progress bar plus the full
   * transport row. `'minimal'` renders a compact bar — prev/next on the
   * left, copy-link + fullscreen on the right (and mute only when the
   * active step carries a voiceover), with no progress segments.
   */
  variant?: 'full' | 'minimal';
};

function MinimalControls() {
  const { demo, state, controls } = useDemoPlayerContext();
  const currentStep = demo?.steps[state.currentStepIndex];
  const hasVoiceover = Boolean(currentStep?.voiceover?.src);
  const { canPrev, canNext } = transportState(demo, state);
  const playLabel =
    state.status === 'ended'
      ? 'Replay demo'
      : state.isPlaying
        ? 'Pause demo'
        : 'Play demo';

  return (
    <div
      className="demo-controls demo-controls-minimal"
      data-paused={!state.isPlaying || undefined}
    >
      <div className="demo-controls-row">
        <div className="demo-controls-group">
          <button
            type="button"
            className="demo-control-button cursor-pointer"
            aria-label="Previous step"
            onClick={controls.prev}
            disabled={!canPrev}
          >
            <ChevronLeftIcon className="demo-icon" />
          </button>
          <button
            type="button"
            className="demo-control-button demo-control-primary cursor-pointer"
            aria-label={playLabel}
            onClick={controls.toggle}
          >
            {state.status === 'ended' ? (
              <ReplayIcon className="demo-icon" />
            ) : state.isPlaying ? (
              <PauseIcon className="demo-icon" />
            ) : (
              <PlayIcon className="demo-icon" />
            )}
          </button>
          <button
            type="button"
            className="demo-control-button cursor-pointer"
            aria-label="Next step"
            onClick={controls.next}
            disabled={!canNext}
          >
            <ChevronRightIcon className="demo-icon" />
          </button>
        </div>
        <div className="demo-controls-group">
          {hasVoiceover ? (
            <button
              type="button"
              className="demo-control-button cursor-pointer"
              aria-label={state.isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={state.isMuted}
              onClick={controls.toggleMute}
            >
              {state.isMuted ? (
                <VolumeXIcon className="demo-icon" />
              ) : (
                <Volume2Icon className="demo-icon" />
              )}
            </button>
          ) : null}
          <ShareButton />
          <FullscreenButton />
        </div>
      </div>
    </div>
  );
}

export function Controls({ variant = 'full' }: ControlsProps = {}) {
  const { demo, state, controls } = useDemoPlayerContext();

  if (variant === 'minimal') {
    return <MinimalControls />;
  }

  const currentStep = demo?.steps[state.currentStepIndex];
  const ccAvailable =
    currentStep?.kind === 'content' &&
    !!currentStep.captions &&
    currentStep.captions.length > 0;
  // Hide the mute/volume button entirely when the demo has no audio on any
  // step — there's nothing to mute. Checked demo-wide (not per-step) so the
  // persistent full bar doesn't pop the button in and out as the viewer
  // moves between voiced and silent steps.
  const hasAudio = Boolean(
    demo?.steps.some((step) => Boolean(step.voiceover?.src)),
  );
  const { canPrev, canNext } = transportState(demo, state);
  const playLabel =
    state.status === 'ended'
      ? 'Replay demo'
      : state.isPlaying
        ? 'Pause demo'
        : 'Play demo';

  return (
    <div className="demo-controls" data-paused={!state.isPlaying || undefined}>
      <ProgressBar />
      <div className="demo-controls-row">
        <button
          type="button"
          className="demo-control-button cursor-pointer"
          aria-label="Previous step"
          onClick={controls.prev}
          disabled={!canPrev}
        >
          <ChevronLeftIcon className="demo-icon" />
        </button>
        <button
          type="button"
          className="demo-control-button demo-control-primary cursor-pointer"
          aria-label={playLabel}
          onClick={controls.toggle}
        >
          {state.status === 'ended' ? (
            <ReplayIcon className="demo-icon" />
          ) : state.isPlaying ? (
            <PauseIcon className="demo-icon" />
          ) : (
            <PlayIcon className="demo-icon" />
          )}
        </button>
        {hasAudio ? (
          <button
            type="button"
            className="demo-control-button cursor-pointer"
            aria-label={state.isMuted ? 'Unmute' : 'Mute'}
            aria-pressed={state.isMuted}
            onClick={controls.toggleMute}
          >
            {state.isMuted ? (
              <VolumeXIcon className="demo-icon" />
            ) : (
              <Volume2Icon className="demo-icon" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="demo-control-button cursor-pointer"
          aria-label="Next step"
          onClick={controls.next}
          disabled={!canNext}
        >
          <ChevronRightIcon className="demo-icon" />
        </button>
        <StepIndicator />
        <ShareButton />
        <FullscreenButton />
        {ccAvailable ? (
          <button
            type="button"
            className="demo-control-button demo-control-cc cursor-pointer"
            aria-label={
              state.captionsEnabled ? 'Hide captions' : 'Show captions'
            }
            aria-pressed={state.captionsEnabled}
            data-active={state.captionsEnabled || undefined}
            onClick={controls.toggleCaptions}
          >
            <CaptionsIcon className="demo-icon" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
