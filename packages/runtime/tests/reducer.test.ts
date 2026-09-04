import { describe, expect, it, vi } from 'vitest';
import { parseDemo } from '../src/schema';
import {
  createInitialPlayerState,
  playerReducer,
  type Action,
  type PlayerState,
} from '../src/engine';
import { getEffectiveStepDuration } from '../src/utils/timing';

const demo = parseDemo({
  id: 'demoEngine01',
  version: 1,
  chrome: {
    autoplay: true,
  },
  chapters: [
    {
      id: 'chapter_two',
      title: 'Second chapter',
      stepIds: ['s2'],
    },
  ],
  steps: [
    {
      id: 's1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-1.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
    {
      id: 's2',
      kind: 'content',
      duration: 2000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      advance: {
        trigger: 'click',
      },
    },
    {
      id: 's3',
      kind: 'content',
      voiceover: {
        src: 'https://cdn.example.com/vo-3.mp3',
        duration: 3000,
      },
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-3.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
  ],
});

function reduce(state: PlayerState, action: Action): PlayerState {
  return playerReducer(state, action, { demo });
}

describe('playerReducer', () => {
  it('creates idle state at the first step', () => {
    expect(createInitialPlayerState(demo)).toMatchObject({
      currentStepId: 's1',
      currentStepIndex: 0,
      isPlaying: false,
      stepProgress: 0,
      stepElapsedMs: 0,
      audioCurrentTime: 0,
      status: 'idle',
    });
  });

  it('plays, ticks, and auto-advances at effective duration', () => {
    let state = reduce(createInitialPlayerState(demo), { type: 'PLAY' });

    state = reduce(state, { type: 'TICK', deltaMs: 400 });
    expect(state).toMatchObject({
      currentStepId: 's1',
      stepElapsedMs: 400,
      stepProgress: 0.4,
      status: 'playing',
    });

    state = reduce(state, { type: 'TICK', deltaMs: 700 });
    expect(state).toMatchObject({
      currentStepId: 's2',
      currentStepIndex: 1,
      stepElapsedMs: 0,
      stepProgress: 0,
      isPlaying: true,
    });
  });

  it('does not advance a click-triggered step on tick', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'SEEK_STEP',
      stepId: 's2',
    });
    state = reduce(state, { type: 'PLAY' });
    state = reduce(state, { type: 'TICK', deltaMs: 3000 });

    expect(state).toMatchObject({
      currentStepId: 's2',
      stepProgress: 1,
      stepElapsedMs: 2000,
      isPlaying: true,
    });
  });

  it('ignores ticks that leave a parked step unchanged', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'SEEK_STEP',
      stepId: 's2',
    });
    state = reduce(state, { type: 'PLAY' });
    state = reduce(state, { type: 'TICK', deltaMs: 3000 });
    const parkedState = state;

    expect(reduce(state, { type: 'TICK', deltaMs: 16 })).toBe(parkedState);
  });

  it('ignores ticks while paused', () => {
    let state = reduce(createInitialPlayerState(demo), { type: 'PLAY' });
    state = reduce(state, { type: 'PAUSE' });
    const pausedState = state;

    expect(reduce(state, { type: 'TICK', deltaMs: 1000 })).toBe(pausedState);
  });

  it('supports next, previous, hotspot advance, and ended status', () => {
    let state = reduce(createInitialPlayerState(demo), { type: 'NEXT' });
    expect(state.currentStepId).toBe('s2');

    state = reduce(state, { type: 'PREV' });
    expect(state.currentStepId).toBe('s1');

    state = reduce(state, { type: 'HOTSPOT_ADVANCE' });
    expect(state.currentStepId).toBe('s2');

    state = reduce(state, { type: 'NEXT' });
    state = reduce(state, { type: 'NEXT' });
    expect(state).toMatchObject({
      currentStepId: 's3',
      stepProgress: 1,
      isPlaying: false,
      status: 'ended',
    });
  });

  it('treats previous at the first step as a no-op', () => {
    const playingState = reduce(createInitialPlayerState(demo), { type: 'PLAY' });

    expect(reduce(playingState, { type: 'PREV' })).toBe(playingState);
  });

  it('supports seek by step and chapter', () => {
    let state = createInitialPlayerState(demo);

    state = reduce(state, { type: 'SEEK_STEP', stepId: 's3' });
    expect(state.currentStepId).toBe('s3');

    state = reduce(state, { type: 'SEEK_STEP', stepId: 'missing' });
    expect(state.currentStepId).toBe('s3');

    state = reduce(state, {
      type: 'SEEK_CHAPTER',
      chapterId: 'chapter_two',
    });
    expect(state.currentStepId).toBe('s2');

    state = reduce(state, {
      type: 'SEEK_CHAPTER',
      chapterId: 'missing',
    });
    expect(state.currentStepId).toBe('s2');
  });

  it('records a replay request when seeking to the active step', () => {
    let state = createInitialPlayerState(demo);

    state = reduce(state, { type: 'SEEK_STEP', stepId: 's1' });
    expect(state.stepReplayNonce).toBe(1);

    state = reduce(state, { type: 'SEEK_STEP', stepId: 's2' });
    expect(state.stepReplayNonce).toBe(1);

    state = reduce(state, { type: 'SEEK_STEP', stepId: 's2' });
    expect(state.stepReplayNonce).toBe(2);
  });

  it('restarts from the beginning and preserves loaded audio durations', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'SEEK_STEP',
      stepId: 's3',
    });
    state = reduce(state, { type: 'AUDIO_LOADED', durationMs: 4200 });
    state = reduce(state, { type: 'RESTART' });

    expect(state).toMatchObject({
      currentStepId: 's1',
      currentStepIndex: 0,
      status: 'idle',
      audioDurations: {
        s3: 4200,
      },
    });
  });

  it('tracks audio time and loaded metadata duration for the current step', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'AUDIO_TIME',
      currentTime: 1234,
    });
    expect(state.audioCurrentTime).toBe(1234);

    state = reduce(state, { type: 'AUDIO_LOADED', durationMs: 2500 });
    expect(state.audioDurations.s1).toBe(2500);
  });

  it('ignores duplicate media metadata durations for the current step', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'AUDIO_LOADED',
      durationMs: 2500,
    });
    const audioLoadedState = state;

    expect(reduce(state, { type: 'AUDIO_LOADED', durationMs: 2500 })).toBe(
      audioLoadedState,
    );

    state = reduce(state, { type: 'VIDEO_LOADED', durationMs: 4000 });
    const videoLoadedState = state;

    expect(reduce(state, { type: 'VIDEO_LOADED', durationMs: 4000 })).toBe(
      videoLoadedState,
    );
  });

  it('uses explicit duration, voiceover duration, loaded audio duration, then fallback', () => {
    expect(getEffectiveStepDuration(demo.steps[0]!)).toBe(1000);
    expect(getEffectiveStepDuration(demo.steps[2]!)).toBe(3000);
    expect(
      getEffectiveStepDuration(
        {
          ...demo.steps[2]!,
          voiceover: {
            src: 'https://cdn.example.com/vo.mp3',
          },
        },
        { s3: 4200 },
      ),
    ).toBe(4200);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      getEffectiveStepDuration({
        ...demo.steps[2]!,
        voiceover: undefined,
      }),
    ).toBe(5000);
    warn.mockRestore();
  });

  it('restarts playback when play is dispatched after ended', () => {
    let state = reduce(createInitialPlayerState(demo), {
      type: 'SEEK_STEP',
      stepId: 's3',
    });
    state = reduce(state, { type: 'NEXT' });
    expect(state.status).toBe('ended');

    state = reduce(state, { type: 'PLAY' });
    expect(state).toMatchObject({
      currentStepId: 's1',
      isPlaying: true,
      status: 'playing',
    });
  });
});
