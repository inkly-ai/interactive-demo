import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Root,
  ProgressBar,
  Stage,
  AnnotationEditModeContext,
  useDemoPlayerContext,
  type AnnotationProps,
  type DemoConfig,
} from '../src';

const stageDemo = {
  id: 'demostage001',
  version: 1,
  title: 'Stage Demo',
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
        alt: 'First screen',
      },
      annotations: [
        {
          id: 'a1',
          type: 'message',
          variant: 'callout',
          x: 0.7,
          y: 0.4,
          text: 'Welcome',
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
      transform: {
        zoom: 1.5,
        x: 0.3,
        y: 0.4,
      },
      annotations: [
        {
          id: 'a2',
          type: 'message',
          variant: 'pointer',
          x: 0.3,
          y: 0.4,
          text: 'Click here',
        },
        {
          id: 'a3',
          type: 'blur',
          x: 0.6,
          y: 0.1,
          w: 0.3,
          h: 0.1,
          intensity: 8,
        },
        {
          id: 'a4',
          type: 'text',
          x: 0.5,
          y: 0.2,
          text: 'Helpful note',
        },
      ],
    },
  ],
} as const;

const videoStageDemo = {
  id: 'demovideo001',
  version: 1,
  title: 'Video Stage Demo',
  steps: [
    {
      id: 'v1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/video-1.webm',
        posterSrc: 'https://cdn.example.com/poster-1.png',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'First recording',
        autoplay: true,
        muted: true,
      },
      annotations: [],
    },
    {
      id: 'v2',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/video-2.webm',
        posterSrc: 'https://cdn.example.com/poster-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'Second recording',
        autoplay: true,
        muted: true,
      },
      annotations: [],
    },
  ],
} as const;

const videoAnnotationDemo = {
  id: 'videoann0001',
  version: 1,
  title: 'Video Annotation Demo',
  steps: [
    {
      id: 'v1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/video-annotated.webm',
        posterSrc: 'https://cdn.example.com/video-annotated.png',
        naturalWidth: 1200,
        naturalHeight: 600,
        autoplay: true,
        muted: true,
      },
      annotations: [
        {
          id: 'v1-message',
          type: 'message',
          variant: 'callout',
          x: 0.5,
          y: 0.5,
          text: 'Shown after video',
        },
      ],
    },
  ],
} as const;

const videoToImageZoomDemo = {
  id: 'videoimage01',
  version: 1,
  title: 'Video to Image Zoom Demo',
  steps: [
    {
      id: 'v1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/video-1.webm',
        naturalWidth: 1200,
        naturalHeight: 600,
        autoplay: true,
        muted: true,
      },
      annotations: [],
    },
    {
      id: 'i1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-zoom.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      transform: {
        zoom: 1.6,
        x: 0.45,
        y: 0.55,
      },
      annotations: [],
    },
  ],
} as const;

const mixedAnnotationTransitionDemo = {
  id: 'mixedann0001',
  version: 1,
  title: 'Mixed Annotation Demo',
  steps: [
    {
      id: 'p1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/mixed-1.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      transform: {
        zoom: 1.4,
        x: 0.2,
        y: 0.3,
      },
      annotations: [
        {
          id: 'p1-message',
          type: 'message',
          variant: 'pointer',
          x: 0.2,
          y: 0.3,
          text: 'Pointer message',
        },
      ],
    },
    {
      id: 'p2',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/mixed-2-pointer.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      transform: {
        zoom: 1.7,
        x: 0.72,
        y: 0.58,
      },
      annotations: [
        {
          id: 'p2-message',
          type: 'message',
          variant: 'pointer',
          x: 0.72,
          y: 0.58,
          text: 'Second pointer message',
        },
      ],
    },
    {
      id: 'c1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/mixed-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      transform: {
        zoom: 1.6,
        x: 0.75,
        y: 0.55,
      },
      annotations: [
        {
          id: 'c1-message',
          type: 'message',
          variant: 'callout',
          x: 0.75,
          y: 0.55,
          text: 'Callout message',
        },
      ],
    },
    {
      id: 'a1',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/mixed-3.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      transform: {
        zoom: 1.5,
        x: 0.45,
        y: 0.4,
      },
      annotations: [
        {
          id: 'a1-message',
          type: 'message',
          variant: 'area',
          x: 0.42,
          y: 0.35,
          w: 0.24,
          h: 0.18,
          text: 'Area message',
        },
      ],
    },
  ],
} as const;

function SeekButton({
  stepId,
  label = 'Seek',
}: {
  stepId: string;
  label?: string;
}) {
  const { controls } = useDemoPlayerContext();

  return (
    <button type="button" onClick={() => controls.seekToStep(stepId)}>
      {label}
    </button>
  );
}

function PlayerStateProbe() {
  const { state } = useDemoPlayerContext();

  return <div data-testid="is-playing">{String(state.isPlaying)}</div>;
}

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

async function advanceAnimationFrame() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16);
  });
}

describe('Stage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the background with aspect ratio variables and annotations', () => {
    render(
      <Root config={stageDemo}>
        <Stage />
      </Root>,
    );

    const stage = screen.getByRole('region', { name: 'Stage Demo' });
    expect(stage.style.getPropertyValue('--demo-stage-w')).toBe('1200');
    expect(stage.style.getPropertyValue('--demo-stage-h')).toBe('600');
    expect(screen.getByAltText('First screen')).toBeTruthy();

    const callout = screen.getByRole('button', { name: 'Welcome' });
    expect(callout.style.getPropertyValue('--x')).toBe('0.7');
    expect(callout.style.getPropertyValue('--y')).toBe('0.4');
  });

  it('advances on hotspot click and updates transform variables', () => {
    const { container } = render(
      <Root config={stageDemo}>
        <Stage />
      </Root>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Welcome' }));

    const stage = screen.getByRole('region', { name: 'Stage Demo' });
    expect(stage.style.getPropertyValue('--zoom')).toBe('1.5');
    expect(stage.style.getPropertyValue('--focal-x')).toBe('0.3');
    expect(
      screen.getAllByRole('button', { name: 'Click here' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Helpful note')).toBeTruthy();
    expect(
      container.querySelector('.demo-stage-effect-layer .demo-blur-annotation'),
    ).toBeTruthy();
    expect(
      container.querySelector('.demo-annotation-layer .demo-blur-annotation'),
    ).toBeNull();
  });

  it('holds at full size before zooming when entering an image from video', async () => {
    vi.useFakeTimers();
    installAnimationFrameMock();
    vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const result = render(
      <Root config={videoToImageZoomDemo}>
        <Stage />
        <SeekButton stepId="i1" />
      </Root>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Seek' }));

    const stage = screen.getByRole('region', {
      name: 'Video to Image Zoom Demo',
    });
    expect(stage.style.getPropertyValue('--zoom')).toBe('1');

    await advanceAnimationFrame();

    expect(stage.style.getPropertyValue('--zoom')).toBe('1.6');
    result.unmount();
  });

  it('hides video annotations again when the video is scrubbed back from the end', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve(),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    const { container } = render(
      <Root config={videoAnnotationDemo}>
        <Stage />
      </Root>,
    );

    expect(
      screen.queryByRole('button', { name: 'Shown after video' }),
    ).toBeNull();

    await waitFor(() => {
      expect(container.querySelector('video')).toBeTruthy();
    });
    const video = container.querySelector('video');
    if (!video) throw new Error('Expected video background');
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 1,
    });

    video.currentTime = 1;
    fireEvent.ended(video);

    expect(screen.getByRole('button', { name: 'Shown after video' })).toBeTruthy();

    video.currentTime = 0.2;
    fireEvent.seeked(video);

    expect(
      screen.queryByRole('button', { name: 'Shown after video' }),
    ).toBeNull();
  });

  it('syncs native video pause and play events with the player timeline', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve(),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );

    const { container } = render(
      <Root config={videoStageDemo}>
        <Stage />
        <PlayerStateProbe />
      </Root>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-playing').textContent).toBe('true');
    });
    const video = container.querySelector('video');
    if (!video) throw new Error('Expected video background');

    fireEvent.pause(video);

    expect(screen.getByTestId('is-playing').textContent).toBe('false');

    fireEvent.play(video);

    expect(screen.getByTestId('is-playing').textContent).toBe('true');
  });

  it('does not treat natural video completion as a timeline pause', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve(),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );

    const { container } = render(
      <Root config={videoStageDemo}>
        <Stage />
        <PlayerStateProbe />
      </Root>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-playing').textContent).toBe('true');
    });
    const video = container.querySelector('video');
    if (!video) throw new Error('Expected video background');
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 1,
    });
    video.currentTime = 1;

    fireEvent.pause(video);

    expect(screen.getByTestId('is-playing').textContent).toBe('true');
  });

  it('supports custom annotation renderer overrides', () => {
    const CustomMessage = vi.fn(({ annotation, onAdvance }: AnnotationProps) => (
      <button type="button" onClick={onAdvance}>
        Custom {annotation.id}
      </button>
    ));

    render(
      <Root config={stageDemo}>
        <Stage components={{ message: CustomMessage }} />
      </Root>,
    );

    // Step 1's callout (a1) renders as the custom button. Clicking it
    // advances to step 2, where the pointer (a2) also picks up the
    // custom renderer since both share the `message` type.
    fireEvent.click(screen.getByRole('button', { name: 'Custom a1' }));

    expect(screen.getByRole('button', { name: 'Custom a2' })).toBeTruthy();
    expect(CustomMessage).toHaveBeenCalled();
  });

  it('hides mixed-variant messages during annotation motion and then restores them', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <Root config={mixedAnnotationTransitionDemo}>
        <Stage />
        <SeekButton stepId="p2" label="Go pointer" />
        <SeekButton stepId="c1" label="Go callout" />
        <SeekButton stepId="a1" label="Go area" />
      </Root>,
    );

    const getStage = () =>
      screen.getByRole('region', {
        name: 'Mixed Annotation Demo',
      });
    expect(getStage().getAttribute('data-annotation-motion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Go pointer' }));

    expect(getStage().getAttribute('data-annotation-motion')).toBe('');
    expect(
      screen.getAllByRole('button', { name: 'Second pointer message' }).length,
    ).toBeGreaterThan(0);

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });

    expect(getStage().getAttribute('data-annotation-motion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Go callout' }));

    expect(getStage().getAttribute('data-annotation-motion')).toBe('');
    expect(screen.getByRole('button', { name: 'Callout message' })).toBeTruthy();

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });

    expect(getStage().getAttribute('data-annotation-motion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Go area' }));

    expect(getStage().getAttribute('data-annotation-motion')).toBe('');
    expect(
      screen.getAllByRole('button', { name: 'Area message' }).length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelector('.demo-annotation-layer .demo-hotspot-area'),
    ).toBeTruthy();

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });

    expect(getStage().getAttribute('data-annotation-motion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Go pointer' }));

    expect(getStage().getAttribute('data-annotation-motion')).toBe('');
    expect(
      screen.getAllByRole('button', { name: 'Second pointer message' }).length,
    ).toBeGreaterThan(0);

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });

    expect(getStage().getAttribute('data-annotation-motion')).toBeNull();
  });

  it('hides messages while stage zoom changes even when pointer coordinates stay the same', async () => {
    vi.useFakeTimers();
    const samePointerZoomDemo = {
      ...mixedAnnotationTransitionDemo,
      title: 'Stable Pointer Zoom Demo',
      steps: [
        {
          ...mixedAnnotationTransitionDemo.steps[0],
          id: 'z1',
          transform: { zoom: 1, x: 0.5, y: 0.5 },
          annotations: [
            {
              id: 'z-message-1',
              type: 'message',
              variant: 'pointer',
              x: 0.4,
              y: 0.35,
              text: 'Stable pointer',
            },
          ],
        },
        {
          ...mixedAnnotationTransitionDemo.steps[0],
          id: 'z2',
          transform: { zoom: 1.6, x: 0.4, y: 0.35 },
          annotations: [
            {
              id: 'z-message-2',
              type: 'message',
              variant: 'pointer',
              x: 0.4,
              y: 0.35,
              text: 'Stable pointer',
            },
          ],
        },
      ],
    } as const;

    render(
      <Root config={samePointerZoomDemo}>
        <Stage />
        <SeekButton stepId="z2" label="Zoom step" />
      </Root>,
    );

    const stage = screen.getByRole('region', {
      name: 'Stable Pointer Zoom Demo',
    });
    expect(stage.getAttribute('data-annotation-motion')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom step' }));

    expect(stage.getAttribute('data-annotation-motion')).toBe('');

    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });

    expect(stage.getAttribute('data-annotation-motion')).toBeNull();
  });

  it('marks annotation edit mode without suppressing pointer motion', async () => {
    vi.useFakeTimers();
    const config = {
      ...mixedAnnotationTransitionDemo,
      steps: [
        {
          ...mixedAnnotationTransitionDemo.steps[1],
          annotations: [
            {
              id: 'moving-pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.3,
              y: 0.4,
              text: 'Moving pointer',
            },
          ],
        },
      ],
    } as DemoConfig;
    const movedConfig = {
      ...config,
      steps: [
        {
          ...mixedAnnotationTransitionDemo.steps[1],
          annotations: [
            {
              id: 'moving-pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.7,
              y: 0.4,
              text: 'Moving pointer',
            },
          ],
        },
      ],
    } as DemoConfig;

    const { container, rerender } = render(
      <Root config={config}>
        <AnnotationEditModeContext.Provider value={true}>
          <Stage />
        </AnnotationEditModeContext.Provider>
      </Root>,
    );

    const stage = screen.getByRole('region', {
      name: 'Mixed Annotation Demo',
    });

    expect(stage.getAttribute('data-annotation-edit-mode')).toBe('');

    rerender(
      <Root config={config}>
        <AnnotationEditModeContext.Provider value={true}>
          <Stage />
        </AnnotationEditModeContext.Provider>
      </Root>,
    );
    expect(
      container.querySelector('.demo-hotspot-pointer')?.getAttribute('data-moving'),
    ).toBeNull();

    rerender(
      <Root config={movedConfig}>
        <AnnotationEditModeContext.Provider value={true}>
          <Stage />
        </AnnotationEditModeContext.Provider>
      </Root>,
    );

    expect(
      container.querySelector('.demo-hotspot-pointer')?.getAttribute('data-moving'),
    ).toBe('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(621);
    });
    expect(
      container.querySelector('.demo-hotspot-pointer')?.getAttribute('data-moving'),
    ).toBeNull();
  });

  it('does not reuse a ready video element when navigating between video steps', () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);

    render(
      <Root config={videoStageDemo}>
        <Stage />
        <SeekButton stepId="v2" />
      </Root>,
    );

    const firstVideo = screen.getByLabelText(
      'First recording',
    ) as HTMLVideoElement;
    fireEvent.loadedData(firstVideo);
    expect(firstVideo.style.opacity).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Seek' }));

    const secondVideo = screen.getByLabelText(
      'Second recording',
    ) as HTMLVideoElement;
    expect(secondVideo).not.toBe(firstVideo);
    expect(secondVideo.getAttribute('src')).toBe(
      'https://cdn.example.com/video-2.webm',
    );
    expect(secondVideo.getAttribute('poster')).toBe(
      'https://cdn.example.com/poster-2.png',
    );
    expect(secondVideo.style.opacity).toBe('0');

    fireEvent.canPlay(secondVideo);
    expect(secondVideo.style.opacity).toBe('1');

    play.mockRestore();
    pause.mockRestore();
  });

  it('rewinds the active video when its progress segment is clicked', async () => {
    vi.useFakeTimers();
    installAnimationFrameMock();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);

    render(
      <Root config={videoStageDemo}>
        <Stage />
        <ProgressBar />
      </Root>,
    );

    const firstVideo = screen.getByLabelText(
      'First recording',
    ) as HTMLVideoElement;
    firstVideo.currentTime = 0.7;

    await advanceAnimationFrame();
    await advanceAnimationFrame();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Step 1' }));

    expect(firstVideo.currentTime).toBe(0);

    play.mockRestore();
    pause.mockRestore();
  });

});
