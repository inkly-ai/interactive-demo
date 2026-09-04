import type { Caption, Demo } from '../schema';
import {
  getEffectiveStepDuration,
  type AudioDurationMap,
  type VideoDurationMap,
} from '../utils/timing';

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'ended';

export type PlayerState = {
  currentStepId: string;
  currentStepIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  stepProgress: number;
  stepElapsedMs: number;
  stepReplayNonce: number;
  audioCurrentTime: number;
  status: PlayerStatus;
  audioDurations: AudioDurationMap;
  videoDurations: VideoDurationMap;
};

export type PublicPlayerState = Omit<
  PlayerState,
  'audioDurations' | 'videoDurations' | 'stepReplayNonce'
> & {
  activeCaption: Caption | null;
  captionsEnabled: boolean;
};

export type Action =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SEEK_STEP'; stepId: string }
  | { type: 'SEEK_CHAPTER'; chapterId: string }
  | { type: 'RESTART' }
  | { type: 'AUDIO_TIME'; currentTime: number }
  | { type: 'AUDIO_LOADED'; durationMs: number }
  | { type: 'VIDEO_LOADED'; durationMs: number }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'MEDIA_ENDED' }
  | { type: 'HOTSPOT_ADVANCE' };

export type PlayerReducerContext = {
  demo: Demo;
};

export type NavigationState = Pick<PlayerState, 'currentStepIndex' | 'status'>;

export function canNavigatePrev(
  demo: Demo | null,
  state: NavigationState,
): boolean {
  const stepCount = demo?.steps.length ?? 0;
  if (stepCount <= 1) return false;
  return state.status === 'ended' || state.currentStepIndex > 0;
}

export function canNavigateNext(
  demo: Demo | null,
  state: NavigationState,
): boolean {
  const stepCount = demo?.steps.length ?? 0;
  if (stepCount <= 1 || state.status === 'ended') return false;
  return state.currentStepIndex < stepCount - 1;
}

function getStepId(demo: Demo, index: number): string {
  return demo.steps[index]?.id ?? demo.steps[0]!.id;
}

function getCurrentStep(demo: Demo, state: PlayerState): Demo['steps'][number] {
  return demo.steps[state.currentStepIndex] ?? demo.steps[0]!;
}

function resetForStep(
  demo: Demo,
  index: number,
  state: PlayerState,
  status: PlayerStatus = state.status,
  stepReplayNonce = state.stepReplayNonce,
): PlayerState {
  const nextIndex = Math.min(Math.max(index, 0), demo.steps.length - 1);
  const isEnded = status === 'ended';

  return {
    ...state,
    currentStepIndex: nextIndex,
    currentStepId: getStepId(demo, nextIndex),
    stepProgress: 0,
    stepElapsedMs: 0,
    stepReplayNonce,
    audioCurrentTime: 0,
    isPlaying: !isEnded && state.isPlaying,
    status,
  };
}

function moveToNext(demo: Demo, state: PlayerState): PlayerState {
  if (state.currentStepIndex >= demo.steps.length - 1) {
    return {
      ...state,
      stepProgress: 1,
      isPlaying: false,
      status: 'ended',
    };
  }

  return resetForStep(demo, state.currentStepIndex + 1, state);
}

export function createInitialPlayerState(demo: Demo): PlayerState {
  return {
    currentStepId: demo.steps[0]!.id,
    currentStepIndex: 0,
    isPlaying: false,
    isMuted: false,
    stepProgress: 0,
    stepElapsedMs: 0,
    stepReplayNonce: 0,
    audioCurrentTime: 0,
    status: 'idle',
    audioDurations: {},
    videoDurations: {},
  };
}

/**
 * Steps drive playback uniformly — cover screens are just steps with
 * `kind: 'cover'`. The reducer doesn't special-case them; the same
 * `advance.trigger` / duration semantics apply to every kind. Cover
 * steps default to `advance.trigger = 'click'` so the player waits
 * for the viewer action (button / form submit) instead of
 * auto-advancing on a timer.
 */
export function playerReducer(
  state: PlayerState,
  action: Action,
  context: PlayerReducerContext,
): PlayerState {
  const { demo } = context;

  switch (action.type) {
    case 'PLAY':
      if (state.status === 'ended') {
        return {
          ...createInitialPlayerState(demo),
          isPlaying: true,
          status: 'playing',
          stepReplayNonce: state.stepReplayNonce + 1,
          isMuted: state.isMuted,
          audioDurations: state.audioDurations,
          videoDurations: state.videoDurations,
        };
      }
      return {
        ...state,
        isPlaying: true,
        status: 'playing',
      };

    case 'PAUSE':
      return {
        ...state,
        isPlaying: false,
        status: state.status === 'ended' ? 'ended' : 'paused',
      };

    case 'TICK': {
      if (!state.isPlaying || state.status === 'ended') {
        return state;
      }

      const currentStep = getCurrentStep(demo, state);
      const duration = getEffectiveStepDuration(
        currentStep,
        state.audioDurations,
        state.videoDurations,
      );
      const stepElapsedMs = Math.min(state.stepElapsedMs + action.deltaMs, duration);
      const stepProgress = duration > 0 ? Math.min(stepElapsedMs / duration, 1) : 1;
      const hasProgressChanged =
        stepElapsedMs !== state.stepElapsedMs || stepProgress !== state.stepProgress;
      const nextState = hasProgressChanged
        ? {
            ...state,
            stepElapsedMs,
            stepProgress,
          }
        : state;

      // Demo-level autoplay gates per-step auto-advance. With autoplay
      // off, every step (including `advance.trigger: 'auto'` ones) parks
      // at its end and waits for an explicit NEXT / hotspot dispatch.
      const autoplay = demo.chrome?.autoplay ?? false;
      if (
        autoplay &&
        stepElapsedMs >= duration &&
        currentStep.advance.trigger === 'auto'
      ) {
        return moveToNext(demo, nextState);
      }

      return nextState;
    }

    case 'NEXT':
    case 'HOTSPOT_ADVANCE':
      if (state.status === 'ended') {
        return state;
      }
      return moveToNext(demo, state);

    case 'MEDIA_ENDED': {
      // The active step's media played through to its real end. Advance
      // only when the demo is auto-playing
      // an auto-trigger step — otherwise the step parks at its final frame
      // exactly as the elapsed-timer path would.
      if (state.status === 'ended' || !state.isPlaying) {
        return state;
      }
      const currentStep = getCurrentStep(demo, state);
      const autoplay = demo.chrome?.autoplay ?? false;
      if (autoplay && currentStep.advance.trigger === 'auto') {
        return moveToNext(demo, state);
      }
      return state;
    }

    case 'PREV':
      if (!canNavigatePrev(demo, state)) {
        return state;
      }
      if (state.status === 'ended') {
        return resetForStep(
          demo,
          demo.steps.length - 1,
          { ...state, isPlaying: false },
          'paused',
        );
      }
      if (state.currentStepIndex === 0) {
        return resetForStep(demo, 0, { ...state, isPlaying: false }, 'idle');
      }
      return resetForStep(demo, state.currentStepIndex - 1, state);

    case 'SEEK_STEP': {
      const stepIndex = demo.steps.findIndex((step) => step.id === action.stepId);
      return stepIndex === -1
        ? state
        : resetForStep(
            demo,
            stepIndex,
            state,
            state.status,
            stepIndex === state.currentStepIndex
              ? state.stepReplayNonce + 1
              : state.stepReplayNonce,
          );
    }

    case 'SEEK_CHAPTER': {
      const chapter = demo.chapters.find((item) => item.id === action.chapterId);
      const stepId = chapter?.stepIds[0];
      const stepIndex = stepId
        ? demo.steps.findIndex((step) => step.id === stepId)
        : -1;

      return stepIndex === -1 ? state : resetForStep(demo, stepIndex, state);
    }

    case 'RESTART':
      return {
        ...createInitialPlayerState(demo),
        stepReplayNonce: state.stepReplayNonce + 1,
        isMuted: state.isMuted,
        audioDurations: state.audioDurations,
        videoDurations: state.videoDurations,
      };

    case 'SET_MUTED':
      return {
        ...state,
        isMuted: action.muted,
      };

    case 'AUDIO_TIME':
      return {
        ...state,
        audioCurrentTime: action.currentTime,
      };

    case 'AUDIO_LOADED':
      if (state.audioDurations[state.currentStepId] === action.durationMs) {
        return state;
      }
      return {
        ...state,
        audioDurations: {
          ...state.audioDurations,
          [state.currentStepId]: action.durationMs,
        },
      };

    case 'VIDEO_LOADED':
      if (state.videoDurations[state.currentStepId] === action.durationMs) {
        return state;
      }
      return {
        ...state,
        videoDurations: {
          ...state.videoDurations,
          [state.currentStepId]: action.durationMs,
        },
      };
  }
}
