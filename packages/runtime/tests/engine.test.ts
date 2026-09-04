import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayer } from '../src/engine';

const demo = {
  id: 'demoHook0001',
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
      duration: 100,
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
      duration: 200,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
  ],
} as const;

describe('usePlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(Date.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns validation errors for invalid input', () => {
    const { result } = renderHook(() => usePlayer({ version: 1, steps: [] }));

    expect(result.current.demo).toBeNull();
    expect(result.current.errors?.issues[0]?.path.join('.')).toBe('id');
    expect(result.current.state).toMatchObject({
      currentStepId: '',
      status: 'idle',
    });
  });

  it('plays and advances with the RAF loop', async () => {
    const { result } = renderHook(() => usePlayer(demo));

    expect(result.current.state.currentStepId).toBe('s1');

    await act(async () => {
      result.current.controls.play();
    });

    expect(result.current.state.isPlaying).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(result.current.state.currentStepId).toBe('s2');
    expect(result.current.state.isPlaying).toBe(true);
  });

  it('pauses playback and stops ticking', () => {
    const { result } = renderHook(() => usePlayer(demo));

    act(() => {
      result.current.controls.play();
      vi.advanceTimersByTime(48);
      result.current.controls.pause();
    });

    const elapsed = result.current.state.stepElapsedMs;

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.stepElapsedMs).toBe(elapsed);
  });

  it('supports direct controls', () => {
    const { result } = renderHook(() => usePlayer(demo));

    act(() => {
      result.current.controls.next();
    });
    expect(result.current.state.currentStepId).toBe('s2');

    act(() => {
      result.current.controls.prev();
    });
    expect(result.current.state.currentStepId).toBe('s1');

    act(() => {
      result.current.controls.seekToStep('s2');
    });
    expect(result.current.state.currentStepId).toBe('s2');

    act(() => {
      result.current.controls.seekToChapter('chapter_two');
    });
    expect(result.current.state.currentStepId).toBe('s2');

    act(() => {
      result.current.controls.restart();
    });
    expect(result.current.state.currentStepId).toBe('s1');
  });

  it('toggles play and pause', () => {
    const { result } = renderHook(() => usePlayer(demo));

    act(() => {
      result.current.controls.toggle();
    });
    expect(result.current.state.status).toBe('playing');

    act(() => {
      result.current.controls.toggle();
    });
    expect(result.current.state.status).toBe('paused');
  });
});
