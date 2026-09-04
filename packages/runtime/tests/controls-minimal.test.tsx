import { useEffect, useRef } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveControlsMode } from '../src/schema';
import { Demo, useDemoPlayerContext } from '../src';

function makeDemo(chrome: Record<string, unknown>) {
  return {
    id: 'demoControl1',
    version: 1,
    title: 'Controls Demo',
    chrome,
    steps: [
      {
        id: 'cover',
        kind: 'cover',
        widgets: [
          { id: 'h1', type: 'headline', title: 'Hello' },
        ],
        advance: { trigger: 'click' },
      },
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
    ],
  } as const;
}

const singleStepDemo = {
  id: 'singleStep01',
  version: 1,
  title: 'Single Step Demo',
  chrome: { controls: 'minimal', autoplay: true },
  steps: [
    {
      id: 'only',
      kind: 'content',
      duration: 100,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/only.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      annotations: [],
    },
  ],
} as const;

function EndOnMount() {
  const { dispatch } = useDemoPlayerContext();
  const hasEndedRef = useRef(false);
  useEffect(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    dispatch({ type: 'NEXT' });
  }, [dispatch]);
  return null;
}

describe('resolveControlsMode', () => {
  it('prefers the explicit tri-state field', () => {
    expect(resolveControlsMode({ controls: 'minimal' })).toBe('minimal');
    expect(resolveControlsMode({ controls: 'hidden' })).toBe('hidden');
  });

  it('falls back to the legacy hideControls boolean', () => {
    expect(resolveControlsMode({ hideControls: true })).toBe('hidden');
    expect(resolveControlsMode({ hideControls: false })).toBe('full');
    expect(resolveControlsMode(undefined)).toBe('full');
    expect(resolveControlsMode({})).toBe('full');
  });
});

describe('minimal controls', () => {
  it('renders the minimal bar (no progress segments) and a copy-link button', () => {
    render(
      <Demo
        config={makeDemo({ controls: 'minimal' })}
        shareUrl="https://app.example.com/demos/my-demo"
      />,
    );
    const controls = document.querySelector<HTMLElement>(
      '.demo-controls-minimal',
    );
    expect(controls).not.toBeNull();
    // No segmented progress bar in the minimal variant.
    expect(document.querySelector('.demo-progress')).toBeNull();
    // Prev/play/next + copy-link + fullscreen are present.
    const bar = within(controls!);
    expect(bar.getByLabelText('Previous step')).toBeTruthy();
    expect(bar.getByLabelText('Play demo')).toBeTruthy();
    expect(bar.getByLabelText('Next step')).toBeTruthy();
    expect(bar.getByLabelText('Copy link')).toBeTruthy();
    expect(bar.getByLabelText('Enter fullscreen')).toBeTruthy();
  });

  it('rides along on cover steps, like the full bar', () => {
    // Cover step is index 0 in the fixture. Both the full and the minimal
    // bar now render on cover steps so the viewer always has a transport
    // affordance (the full bar used to hide on covers).
    const { unmount } = render(
      <Demo config={makeDemo({ controls: 'full' })} />,
    );
    expect(document.querySelector('.demo-controls')).not.toBeNull();
    unmount();

    render(<Demo config={makeDemo({ controls: 'minimal' })} />);
    expect(document.querySelector('.demo-controls-minimal')).not.toBeNull();
  });

  it('hides the copy-link button when no shareUrl is supplied', () => {
    render(<Demo config={makeDemo({ controls: 'minimal' })} />);
    expect(screen.queryByLabelText('Copy link')).toBeNull();
  });

  it('omits the mute button until the step carries a voiceover', () => {
    render(<Demo config={makeDemo({ controls: 'minimal' })} />);
    // Cover fixture has no voiceover → no mute control.
    expect(screen.queryByLabelText('Mute')).toBeNull();
    expect(screen.queryByLabelText('Unmute')).toBeNull();
  });

  it('toggles the minimal primary control between play and pause', () => {
    render(<Demo config={makeDemo({ controls: 'minimal' })} />);
    const bar = within(
      document.querySelector<HTMLElement>('.demo-controls-minimal')!,
    );
    const play = bar.getByLabelText('Play demo');

    fireEvent.click(play);

    expect(bar.queryByLabelText('Play demo')).toBeNull();
    expect(bar.getByLabelText('Pause demo')).toBeTruthy();
  });

  it('disables prev on the first step and next on the last step', () => {
    render(<Demo config={makeDemo({ controls: 'minimal' })} />);
    const bar = within(
      document.querySelector<HTMLElement>('.demo-controls-minimal')!,
    );
    const prev = bar.getByLabelText('Previous step') as HTMLButtonElement;
    const next = bar.getByLabelText('Next step') as HTMLButtonElement;

    // Fixture opens on the cover (first step): backward is a dead end.
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    // Advance to the final (second) step: forward becomes the dead end.
    fireEvent.click(next);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('shows replay instead of enabling prev or next after a single-step demo ends', async () => {
    render(
      <Demo.Root config={singleStepDemo}>
        <EndOnMount />
        <Demo.Controls variant="minimal" />
      </Demo.Root>,
    );

    const bar = within(
      document.querySelector<HTMLElement>('.demo-controls-minimal')!,
    );
    const replay = await waitFor(
      () => bar.getByLabelText('Replay demo') as HTMLButtonElement,
    );
    const prev = bar.getByLabelText('Previous step') as HTMLButtonElement;
    const next = bar.getByLabelText('Next step') as HTMLButtonElement;

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    expect(replay.disabled).toBe(false);

    fireEvent.click(replay);
    expect(bar.queryByLabelText('Replay demo')).toBeNull();
  });
});
