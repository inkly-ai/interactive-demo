import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Demo } from '../src';

const mixedMediaDemo = {
  id: 'keyboard0001',
  version: 1,
  title: 'Keyboard Demo',
  steps: [
    {
      id: 'image-before',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/before.png',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'Before image',
      },
      annotations: [],
    },
    {
      id: 'video-step',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/clip.webm',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'Recorded clip',
        autoplay: true,
        muted: true,
      },
      annotations: [],
    },
    {
      id: 'image-after',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/after.png',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'After image',
      },
      annotations: [],
    },
  ],
} as const;

const singleVideoDemo = {
  id: 'keyboard0002',
  version: 1,
  title: 'Single Video Demo',
  steps: [
    {
      id: 'only-video',
      kind: 'content',
      duration: 1000,
      background: {
        type: 'video',
        src: 'https://cdn.example.com/only.webm',
        naturalWidth: 1200,
        naturalHeight: 600,
        alt: 'Only video',
        autoplay: true,
        muted: true,
      },
      annotations: [],
    },
  ],
} as const;

describe('player keyboard shortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps arrow navigation working after entering a video step', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve(),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );

    const { container } = render(<Demo config={mixedMediaDemo} />);
    const shell = container.querySelector<HTMLElement>('.demo-player-shell');
    expect(shell).not.toBeNull();

    fireEvent.focus(shell!);
    expect(activeStageMediaLabel()).toBe('Before image');

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(activeStageMediaLabel()).toBe('Recorded clip');

    shell!.blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(activeStageMediaLabel()).toBe('After image');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(activeStageMediaLabel()).toBe('Recorded clip');
  });

  it('ignores arrow navigation when a single video step has no neighbor', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve(),
    );
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);

    const { container } = render(<Demo config={singleVideoDemo} />);
    const shell = container.querySelector<HTMLElement>('.demo-player-shell');
    expect(shell).not.toBeNull();

    fireEvent.focus(shell!);
    expect(activeStageMediaLabel('Single Video Demo')).toBe('Only video');

    pause.mockClear();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(activeStageMediaLabel('Single Video Demo')).toBe('Only video');
    expect(pause).not.toHaveBeenCalled();
  });
});

function activeStageMediaLabel(name = 'Keyboard Demo') {
  const stage = screen.getByRole('region', { name });
  const media = stage.querySelector<HTMLImageElement | HTMLVideoElement>(
    '.demo-stage-image',
  );
  return media?.getAttribute('alt') ?? media?.getAttribute('aria-label');
}
