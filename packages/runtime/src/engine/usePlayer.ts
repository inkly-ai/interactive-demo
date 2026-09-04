import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { z } from 'zod';
import { DemoSchema, type Demo } from '../schema';
import {
  createInitialPlayerState,
  playerReducer,
  canNavigateNext,
  canNavigatePrev,
  type Action,
  type PlayerState,
  type PublicPlayerState,
} from './reducer';
import type { AssetResolver } from '../context';
import { useAudio } from './useAudio';
import { useCaption } from './useCaption';
import { useTick } from './useTick';

const emptyDemoState: PublicPlayerState = {
  currentStepId: '',
  currentStepIndex: 0,
  isPlaying: false,
  isMuted: false,
  stepProgress: 0,
  stepElapsedMs: 0,
  audioCurrentTime: 0,
  status: 'idle',
  activeCaption: null,
  captionsEnabled: true,
};

const fallbackDemo: Demo = {
  id: '',
  version: 1,
  chrome: {
    hideHeader: false,
    hideControls: false,
    mobileFooterMessage: true,
    autoplay: false,
  },
  chapters: [],
  steps: [
    {
      id: '',
      kind: 'content',
      background: {
        type: 'image',
        src: 'https://example.com/blank.png',
        naturalWidth: 1,
        naturalHeight: 1,
      },
      advance: {
        trigger: 'auto',
      },
      annotations: [],
    },
  ],
};

export type PlayerControls = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekToStep: (stepId: string) => void;
  seekToChapter: (chapterId: string) => void;
  restart: () => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  toggleCaptions: () => void;
};

export type UsePlayerResult = {
  demo: Demo | null;
  state: PublicPlayerState;
  controls: PlayerControls;
  errors: z.ZodError | null;
};

export type UsePlayerControllerResult = UsePlayerResult & {
  internalState: PlayerState;
  dispatch: Dispatch<Action>;
};

type UsePlayerControllerOptions = {
  resolveAsset?: AssetResolver;
};

export function usePlayerController(
  input: unknown,
  options: UsePlayerControllerOptions = {},
): UsePlayerControllerResult {
  const parsed = useMemo(() => DemoSchema.safeParse(input), [input]);
  const demo = parsed.success ? parsed.data : null;
  const errors = parsed.success ? null : parsed.error;
  const hasMountedRef = useRef(false);
  const lastDemoIdRef = useRef<string | undefined>(demo?.id);
  const [state, dispatch] = useReducer(
    (currentState: PlayerState, action: Action) => {
      if (!demo) {
        return currentState;
      }

      return playerReducer(currentState, action, { demo });
    },
    demo,
    (initialDemo) => createInitialPlayerState(initialDemo ?? fallbackDemo),
  );

  // Only RESTART when the demo's identity actually changes (different
  // `demo.id`) — i.e., the consumer swapped to a different demo. Content
  // edits inside the same demo (annotation position, copy tweaks) keep
  // their reference fresh on every keystroke; restarting on each of those
  // would yank the player back to step 0 / intro / paused, making live
  // editing impossible.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastDemoIdRef.current = demo?.id;
      return;
    }

    if (demo && demo.id !== lastDemoIdRef.current) {
      dispatch({ type: 'RESTART' });
    }
    lastDemoIdRef.current = demo?.id;
  }, [demo]);

  useTick(state.isPlaying && state.status !== 'ended' && demo !== null, (deltaMs) => {
    dispatch({ type: 'TICK', deltaMs });
  });

  useAudio({
    demo,
    state,
    dispatch,
    resolveAsset: options.resolveAsset,
  });

  const currentStep = demo?.steps[state.currentStepIndex] ?? null;
  const activeCaption = useCaption(
    currentStep,
    state.audioCurrentTime,
    state.stepElapsedMs,
  );

  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const toggleCaptions = useCallback(
    () => setCaptionsEnabled((prev) => !prev),
    [],
  );

  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => dispatch({ type: 'PLAY' }),
      pause: () => dispatch({ type: 'PAUSE' }),
      toggle: () =>
        dispatch({ type: state.isPlaying ? 'PAUSE' : 'PLAY' }),
      next: () => {
        if (canNavigateNext(demo, state)) dispatch({ type: 'NEXT' });
      },
      prev: () => {
        if (canNavigatePrev(demo, state)) dispatch({ type: 'PREV' });
      },
      seekToStep: (stepId) => dispatch({ type: 'SEEK_STEP', stepId }),
      seekToChapter: (chapterId) =>
        dispatch({ type: 'SEEK_CHAPTER', chapterId }),
      restart: () => dispatch({ type: 'RESTART' }),
      setMuted: (muted) => dispatch({ type: 'SET_MUTED', muted }),
      toggleMute: () => dispatch({ type: 'SET_MUTED', muted: !state.isMuted }),
      setCaptionsEnabled,
      toggleCaptions,
    }),
    [
      demo,
      state.currentStepIndex,
      state.isMuted,
      state.isPlaying,
      state.status,
      toggleCaptions,
    ],
  );

  const publicState = useMemo<PublicPlayerState>(
    () => ({
      currentStepId: demo ? state.currentStepId : emptyDemoState.currentStepId,
      currentStepIndex: demo
        ? state.currentStepIndex
        : emptyDemoState.currentStepIndex,
      isPlaying: demo ? state.isPlaying : emptyDemoState.isPlaying,
      isMuted: demo ? state.isMuted : emptyDemoState.isMuted,
      stepProgress: demo ? state.stepProgress : emptyDemoState.stepProgress,
      stepElapsedMs: demo ? state.stepElapsedMs : emptyDemoState.stepElapsedMs,
      audioCurrentTime: demo
        ? state.audioCurrentTime
        : emptyDemoState.audioCurrentTime,
      status: demo ? state.status : emptyDemoState.status,
      activeCaption: demo ? activeCaption : emptyDemoState.activeCaption,
      captionsEnabled,
    }),
    [activeCaption, captionsEnabled, demo, state],
  );

  return {
    demo,
    state: publicState,
    internalState: state,
    controls,
    errors,
    dispatch,
  };
}

export function usePlayer(input: unknown): UsePlayerResult {
  const { demo, state, controls, errors } = usePlayerController(input);

  return {
    demo,
    state,
    controls,
    errors,
  };
}
