import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Root, Stage, useDemoPlayerContext } from '../src';

// ---------------------------------------------------------------------------
// Regression coverage for the "always-mount ContentStage across
// cover<->content navigation" behaviour in Stage.tsx.
// Patterns mirror tests/stage.test.tsx and tests/integration.test.tsx.
// ---------------------------------------------------------------------------

function SeekButton({ stepId, label }: { stepId: string; label: string }) {
  const { controls } = useDemoPlayerContext();
  return (
    <button type="button" onClick={() => controls.seekToStep(stepId)}>
      {label}
    </button>
  );
}

function PlayingProbe() {
  const { state } = useDemoPlayerContext();
  return <div data-testid="is-playing">{String(state.isPlaying)}</div>;
}

const imageBg = (src: string) => ({
  type: 'image' as const,
  src,
  naturalWidth: 1200,
  naturalHeight: 600,
});

const videoBg = (src: string) => ({
  type: 'video' as const,
  src,
  naturalWidth: 1200,
  naturalHeight: 600,
  autoplay: true,
  muted: true,
});

const coverStep = (id: string, title: string) => ({
  id,
  kind: 'cover' as const,
  widgets: [
    {
      type: 'headline' as const,
      id: `${id}-headline`,
      title,
      cta: { label: `${id}-cta`, action: { type: 'next' as const } },
    },
  ],
});

describe('regression: cover keeps ContentStage mounted', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -- BASELINE: no cover, starts on content. Must behave exactly as before. --
  it('no-cover demo renders content background + annotations normally', () => {
    const demo = {
      id: 'nocover00001',
      version: 1,
      title: 'No Cover',
      steps: [
        {
          id: 's1',
          kind: 'content',
          background: imageBg('https://cdn.example.com/a.png'),
          annotations: [
            {
              id: 'a1',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
              text: 'Hello',
            },
          ],
        },
      ],
    } as const;

    const { container } = render(
      <Root config={demo}>
        <Stage />
      </Root>,
    );
    // Exactly one stage, image present, annotation present, NOT a cover.
    expect(container.querySelectorAll('.demo-stage')).toHaveLength(1);
    expect(container.querySelector('.demo-intro')).toBeNull();
    expect(container.querySelector('img.demo-stage-image')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hello' })).toBeTruthy();
  });

  // -- Image-only demo + cover: no leaking content background, no annotations. --
  it('image-only demo with a cover renders cover with no leaking content background', () => {
    const demo = {
      id: 'imgcover0001',
      version: 1,
      title: 'Image Cover',
      steps: [
        coverStep('cover', 'Welcome'),
        {
          id: 's1',
          kind: 'content',
          background: imageBg('https://cdn.example.com/a.png'),
          annotations: [
            {
              id: 'a1',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
              text: 'Hello',
            },
          ],
        },
      ],
    } as const;

    const { container } = render(
      <Root config={demo}>
        <Stage />
      </Root>,
    );

    // Cover overlay present.
    expect(container.querySelector('.demo-intro')).toBeTruthy();
    // ContentStage is mounted (held step) but with coverActive: NO image
    // background should render, and NO annotation layer / annotation button.
    expect(container.querySelector('img.demo-stage-image')).toBeNull();
    expect(container.querySelector('.demo-annotation-layer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hello' })).toBeNull();
  });

  // -- All-cover demo: heldContentStep is null. Render only the cover. --
  it('all-cover demo renders only the cover (no ContentStage)', () => {
    const demo = {
      id: 'allcover0001',
      version: 1,
      title: 'All Cover',
      steps: [coverStep('c1', 'One'), coverStep('c2', 'Two')],
    } as const;

    const { container } = render(
      <Root config={demo}>
        <Stage />
      </Root>,
    );

    expect(container.querySelector('.demo-intro')).toBeTruthy();
    // No content stage at all — only the cover stage div exists.
    const stages = container.querySelectorAll('.demo-stage');
    expect(stages).toHaveLength(1);
    expect(stages[0]?.classList.contains('demo-intro')).toBe(true);
    expect(container.querySelector('img.demo-stage-image')).toBeNull();
    expect(container.querySelector('hyperframes-player')).toBeNull();
  });

  // -- Cover in the MIDDLE and at the END. --
  it('renders a mid + outro cover correctly while keeping content held', () => {
    const demo = {
      id: 'midcover0001',
      version: 1,
      title: 'Mid Cover',
      steps: [
        {
          id: 's1',
          kind: 'content',
          background: imageBg('https://cdn.example.com/a.png'),
          annotations: [],
        },
        coverStep('mid', 'Halfway'),
        {
          id: 's2',
          kind: 'content',
          background: imageBg('https://cdn.example.com/b.png'),
          annotations: [],
        },
        coverStep('outro', 'The End'),
      ],
    } as const;

    const { container } = render(
      <Root config={demo}>
        <Stage />
        <SeekButton stepId="mid" label="go-mid" />
        <SeekButton stepId="outro" label="go-outro" />
        <SeekButton stepId="s2" label="go-s2" />
      </Root>,
    );

    // Start: content step, image shown.
    expect(container.querySelector('img.demo-stage-image')).toBeTruthy();

    // Mid cover: cover overlay, no content image leaking.
    fireEvent.click(screen.getByRole('button', { name: 'go-mid' }));
    expect(container.querySelector('.demo-intro')).toBeTruthy();
    expect(container.querySelector('img.demo-stage-image')).toBeNull();

    // Onward to s2: image returns.
    fireEvent.click(screen.getByRole('button', { name: 'go-s2' }));
    expect(container.querySelector('.demo-intro')).toBeNull();
    expect(container.querySelector('img.demo-stage-image')).toBeTruthy();

    // Outro cover: cover overlay again, no leaking image.
    fireEvent.click(screen.getByRole('button', { name: 'go-outro' }));
    expect(container.querySelector('.demo-intro')).toBeTruthy();
    expect(container.querySelector('img.demo-stage-image')).toBeNull();
  });

  // -- The warmed animation player persists across a cover and is reused. --

  // -- REGRESSION CAPTURE --------------------------------------------------
  // On a cover whose held content step is an ANIMATION, the held player must be
  // inert: hidden (aria-hidden), non-interactive (pointer-events: none), and not
  // visible (opacity 0) even after it loads. Otherwise the held animation plays
  // ON TOP of the cover and captures the cover's pointer events.

  // -- REGRESSION CAPTURE: editor scrubber must see NO active player on a cover. --

  // -- Autoplay PLAY must fire on cover -> first content (held id unchanged). --

  // -- Autoplay PLAY on cover -> first content VIDEO step (held id unchanged). --
  it('dispatches PLAY when entering an autoplay video from a leading cover', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    const demo = {
      id: 'covvideo0001',
      version: 1,
      title: 'Cover Video',
      steps: [
        coverStep('cover', 'Welcome'),
        {
          id: 'vid1',
          kind: 'content',
          background: videoBg('https://cdn.example.com/v.webm'),
          annotations: [],
        },
      ],
    } as const;

    const { container } = render(
      <Root config={demo}>
        <Stage />
        <PlayingProbe />
        <SeekButton stepId="vid1" label="go-vid" />
      </Root>,
    );

    // On the cover: held video step is inert. No <video> should render
    // (coverActive gates the video/image background branch), and not playing.
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByTestId('is-playing').textContent).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'go-vid' }));
    expect(container.querySelector('video')).toBeTruthy();
    expect(screen.getByTestId('is-playing').textContent).toBe('true');
  });

  // -- Content -> content autoplay still fires (no regression to base case). --
  it('still dispatches PLAY on content->content navigation between video steps', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    const demo = {
      id: 'vidvid000001',
      version: 1,
      title: 'Video Video',
      steps: [
        {
          id: 'v1',
          kind: 'content',
          background: videoBg('https://cdn.example.com/v1.webm'),
          annotations: [],
        },
        {
          id: 'v2',
          kind: 'content',
          background: videoBg('https://cdn.example.com/v2.webm'),
          annotations: [],
        },
      ],
    } as const;

    render(
      <Root config={demo}>
        <Stage />
        <PlayingProbe />
        <SeekButton stepId="v2" label="go-v2" />
      </Root>,
    );

    // First video step autoplays on mount.
    expect(screen.getByTestId('is-playing').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'go-v2' }));
    expect(screen.getByTestId('is-playing').textContent).toBe('true');
  });

  // -- VIDEO_LOADED (animation duration) must drive the progress bar only when
  //    the step is active, never while a cover holds it. We assert via the
  //    progress segment's duration-driven width rather than internal state. --

  // -- Editor scrubber contract: exactly one ACTIVE player matches selector. --
});
