import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Captions, Root, usePlayer } from '../src';
import type { AssetEntry } from '../src';

const audioDemo = {
  id: 'demoaudio001',
  version: 1,
  chrome: {
    autoplay: true,
  },
  steps: [
    {
      id: 's1',
      kind: 'content',
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-1.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      voiceover: {
        src: 'https://cdn.example.com/vo-1.mp3',
      },
      captions: [
        {
          id: 'c1',
          start: 0,
          end: 1000,
          text: 'First cue',
        },
        {
          id: 'c2',
          start: 1000,
          end: 2500,
          text: 'Second cue',
        },
      ],
    },
    {
      id: 's2',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
  ],
} as const;

const assetAudioDemo = {
  ...audioDemo,
  steps: [
    {
      ...audioDemo.steps[0],
      voiceover: {
        src: 'asset:voiceover-step',
      },
    },
    audioDemo.steps[1],
  ],
} as const;

const audioAsset: AssetEntry = {
  id: 'voiceover-step',
  path: 'public/voiceover-step.mp3',
  uri: 'asset:legacy-voiceover-alias',
  sha256: 'a'.repeat(64),
  kind: 'audio',
  contentType: 'audio/mpeg',
  publicUrl: 'https://cdn.example.com/resolved-voiceover.mp3',
};

type MockAudio = HTMLAudioElement & {
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

let currentAudio: MockAudio;

function installAnimationFrameMock() {
  vi.stubGlobal(
    'requestAnimationFrame',
    (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(Date.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id);
  });
}

function installAudioMock(duration = 2.5) {
  vi.stubGlobal(
    'Audio',
    vi.fn(() => {
      const audio = document.createElement('audio') as MockAudio;
      Object.defineProperty(audio, 'duration', {
        configurable: true,
        value: duration,
      });
      audio.load = vi.fn();
      audio.play = vi.fn(() => Promise.resolve());
      audio.pause = vi.fn();
      currentAudio = audio;
      return audio;
    }),
  );
}

describe('audio and captions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installAnimationFrameMock();
    installAudioMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads and plays voiceover on play, then pauses on pause', () => {
    const { result } = renderHook(() => usePlayer(audioDemo));

    expect(currentAudio.src).toBe('https://cdn.example.com/vo-1.mp3');
    expect(currentAudio.load).toHaveBeenCalledOnce();

    act(() => {
      result.current.controls.play();
    });
    expect(currentAudio.play).toHaveBeenCalled();

    act(() => {
      result.current.controls.pause();
    });
    expect(currentAudio.pause).toHaveBeenCalled();
  });

  it('loads voiceover but stays parked when autoplay is disabled', () => {
    const parkedDemo = {
      ...audioDemo,
      chrome: {
        autoplay: false,
      },
    } as const;
    const { result } = renderHook(() => usePlayer(parkedDemo));

    expect(currentAudio.src).toBe('https://cdn.example.com/vo-1.mp3');
    expect(currentAudio.load).toHaveBeenCalledOnce();
    expect(currentAudio.play).not.toHaveBeenCalled();
    expect(result.current.state.isPlaying).toBe(false);

    act(() => {
      result.current.controls.play();
    });

    expect(currentAudio.play).toHaveBeenCalled();
  });

  it('uses loaded audio metadata as the step duration when duration is missing', async () => {
    const { result } = renderHook(() => usePlayer(audioDemo));

    act(() => {
      currentAudio.dispatchEvent(new Event('loadedmetadata'));
      result.current.controls.play();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });

    expect(result.current.state.currentStepId).toBe('s2');
  });

  it('updates active caption from audio timeupdate when voiceover is present', () => {
    const { result } = renderHook(() => usePlayer(audioDemo));

    act(() => {
      currentAudio.currentTime = 1.2;
      currentAudio.dispatchEvent(new Event('timeupdate'));
    });

    expect(result.current.state.audioCurrentTime).toBe(1200);
    expect(result.current.state.activeCaption?.text).toBe('Second cue');
  });

  it('renders captions through the primitive', () => {
    render(
      <Root config={audioDemo}>
        <Captions />
      </Root>,
    );

    act(() => {
      currentAudio.currentTime = 0.5;
      currentAudio.dispatchEvent(new Event('timeupdate'));
    });

    const caption = screen.getByText('First cue');
    expect(caption).toBeTruthy();
    expect(caption.getAttribute('aria-live')).toBe('polite');
  });

  it('resolves asset voiceovers through Root before loading audio', () => {
    render(
      <Root
        config={assetAudioDemo}
        assets={[audioAsset]}
        resolveAssetUrl={(entry) => entry.publicUrl ?? `asset:${entry.id}`}
      >
        <Captions />
      </Root>,
    );

    expect(currentAudio.src).toBe(audioAsset.publicUrl);
    expect(currentAudio.load).toHaveBeenCalledOnce();
  });

  it('waits for asset voiceovers to resolve instead of loading raw asset URIs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(
      <Root
        config={assetAudioDemo}
        assets={[]}
        resolveAssetUrl={(entry) => entry.publicUrl ?? `asset:${entry.id}`}
      >
        <Captions />
      </Root>,
    );

    expect(currentAudio.getAttribute('src')).toBeNull();
    expect(currentAudio.load).not.toHaveBeenCalled();

    rerender(
      <Root
        config={assetAudioDemo}
        assets={[audioAsset]}
        resolveAssetUrl={(entry) => entry.publicUrl ?? `asset:${entry.id}`}
      >
        <Captions />
      </Root>,
    );

    expect(currentAudio.src).toBe(audioAsset.publicUrl);
    expect(currentAudio.load).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it.each(['asset:public/voiceover-step.mp3', 'asset:legacy-voiceover-alias'])(
    'does not resolve asset voiceovers by manifest path or uri alias (%s)',
    (src) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(
        <Root
          config={{
            ...assetAudioDemo,
            steps: [
              {
                ...assetAudioDemo.steps[0],
                voiceover: {
                  src,
                },
              },
              assetAudioDemo.steps[1],
            ],
          }}
          assets={[audioAsset]}
          resolveAssetUrl={(entry) => entry.publicUrl ?? `asset:${entry.id}`}
        >
          <Captions />
        </Root>,
      );

      expect(currentAudio.getAttribute('src')).toBeNull();
      expect(currentAudio.load).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('id not found in assets manifest'),
      );
      warnSpy.mockRestore();
    },
  );
});
