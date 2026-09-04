import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EMBED_ALLOW, DEFAULT_EMBED_SANDBOX, Demo } from '../src';
import fullDemo from '../examples/full-demo.json';

const integrationDemo = {
  id: 'demoIntegr01',
  version: 1,
  title: 'Integration Demo',
  chrome: {
    autoplay: true,
  },
  chapters: [
    {
      id: 'intro',
      title: 'Intro',
      stepIds: ['s1'],
    },
    {
      id: 'finish',
      title: 'Finish',
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
      annotations: [
        {
          id: 'a1',
          type: 'message',
          variant: 'pointer',
          x: 0.5,
          y: 0.5,
          text: 'Start',
        },
      ],
    },
    {
      id: 's2',
      kind: 'content',
      duration: 100,
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
      annotations: [
        {
          id: 'a2',
          type: 'text',
          x: 0.5,
          y: 0.3,
          text: 'Done',
        },
      ],
    },
  ],
} as const;

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

function installAudioMock() {
  vi.stubGlobal(
    'Audio',
    vi.fn(() => {
      const audio = document.createElement('audio');
      Object.defineProperty(audio, 'duration', {
        configurable: true,
        value: 4.2,
      });
      audio.load = vi.fn();
      audio.play = vi.fn(() => Promise.resolve());
      audio.pause = vi.fn();
      return audio;
    }),
  );
}

describe('Demo integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installAnimationFrameMock();
    installAudioMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the drop-in player and plays end-to-end', async () => {
    const onEvent = vi.fn();

    render(<Demo config={integrationDemo} onEvent={onEvent} />);

    expect(screen.getByRole('region', { name: 'Integration Demo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play demo' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play demo' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    expect(screen.getByText('Done')).toBeTruthy();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'step_view',
        demoId: 'demoIntegr01',
        stepId: 's2',
        stepIndex: 1,
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'complete',
        demoId: 'demoIntegr01',
      }),
    );
  });

  it('navigates chapters', () => {
    render(
      <Demo.Root config={integrationDemo}>
        <Demo.Stage />
        <Demo.Chapters />
      </Demo.Root>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('mounts an image-step pointer fresh after a video step', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    const videoToImagePointerDemo = {
      ...integrationDemo,
      chapters: [
        {
          id: 'walkthrough',
          title: 'Walkthrough',
          stepIds: ['video-step', 'image-step'],
        },
      ],
      steps: [
        {
          id: 'video-step',
          kind: 'content',
          duration: 100,
          background: {
            type: 'video',
            src: 'https://cdn.example.com/click.webm',
            naturalWidth: 1200,
            naturalHeight: 600,
          },
          annotations: [
            {
              id: 'video-pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.2,
              y: 0.2,
              text: 'Video pointer',
            },
          ],
        },
        {
          id: 'image-step',
          kind: 'content',
          duration: 100,
          background: {
            type: 'image',
            src: 'https://cdn.example.com/screen-2.png',
            naturalWidth: 1200,
            naturalHeight: 600,
          },
          transform: {
            zoom: 1.4,
            x: 0.5,
            y: 0.5,
          },
          annotations: [
            {
              id: 'image-pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.8,
              y: 0.8,
              text: 'Image pointer',
            },
          ],
        },
      ],
    } as const;

    const { container } = render(
      <Demo.Root config={videoToImagePointerDemo}>
        <Demo.Stage />
      </Demo.Root>,
    );

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(container.querySelector('.demo-hotspot-pointer')).toBeNull();

    fireEvent.ended(video!);
    expect(
      container.querySelector<HTMLElement>('.demo-hotspot-pointer')?.style.getPropertyValue('--y'),
    ).toBe('0.2');

    fireEvent.click(container.querySelector<HTMLElement>('.demo-hotspot-trigger')!);

    expect(
      container.querySelector<HTMLElement>('.demo-stage')?.dataset.backgroundType,
    ).toBe('image');
    expect(container.querySelector('.demo-hotspot-pointer')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(
      container.querySelector<HTMLElement>('.demo-hotspot-pointer')?.style.getPropertyValue('--y'),
    ).toBe('0.8');
  });

  it('falls back to the default theme primary when the requested preset is unknown', () => {
    const validDemo = { ...integrationDemo, id: 'demo12345678' };
    const { container } = render(
      <Demo config={validDemo} themeId="substack" />,
    );

    expect(
      container
        .querySelector<HTMLElement>('.demo-root')
        ?.style.getPropertyValue('--demo-primary'),
    ).toBe('#5b6cff');
  });

  it('cascades selected theme, host tokens, then demo tokens', () => {
    const validDemo = { ...integrationDemo, id: 'demo12345678' };
    const hostOverride = render(
      <Demo
        config={validDemo}
        themeId="substack"
        themeTokens={{ primary: '#111111' }}
      />,
    );

    expect(
      hostOverride.container
        .querySelector<HTMLElement>('.demo-root')
        ?.style.getPropertyValue('--demo-primary'),
    ).toBe('#111111');
    hostOverride.unmount();

    const demoWithPrimaryOverride = {
      ...validDemo,
      theme: {
        tokens: {
          primary: '#222222',
        },
      },
    };
    const { container } = render(
      <Demo
        config={demoWithPrimaryOverride}
        themeId="substack"
        themeTokens={{ primary: '#111111' }}
      />,
    );

    expect(
      container
        .querySelector<HTMLElement>('.demo-root')
        ?.style.getPropertyValue('--demo-primary'),
    ).toBe('#222222');
  });

  it('keeps the real player frame sized to the first content step', () => {
    const mixedAspectDemo = {
      ...integrationDemo,
      steps: [
        integrationDemo.steps[0],
        {
          ...integrationDemo.steps[1],
          background: {
            ...integrationDemo.steps[1].background,
            naturalWidth: 900,
            naturalHeight: 1200,
          },
        },
      ],
    };
    const { container } = render(<Demo config={mixedAspectDemo} />);

    const player = container.querySelector<HTMLElement>('.demo-player');
    const shell = container.querySelector<HTMLElement>('.demo-player-shell');
    expect(player?.style.getPropertyValue('--demo-stage-w')).toBe('1200');
    expect(player?.style.getPropertyValue('--demo-stage-h')).toBe('600');
    expect(shell?.style.getPropertyValue('--demo-stage-w')).toBe('1200');
    expect(shell?.style.getPropertyValue('--demo-stage-h')).toBe('600');

    const hotspot = container.querySelector<HTMLElement>(
      '.demo-hotspot-trigger',
    );
    expect(hotspot).not.toBeNull();
    fireEvent.click(hotspot!);

    expect(player?.style.getPropertyValue('--demo-stage-w')).toBe('1200');
    expect(player?.style.getPropertyValue('--demo-stage-h')).toBe('600');
    expect(shell?.style.getPropertyValue('--demo-stage-w')).toBe('1200');
    expect(shell?.style.getPropertyValue('--demo-stage-h')).toBe('600');
  });

  it('applies authored message text alignment to callout cards', () => {
    const alignedDemo = {
      ...integrationDemo,
      chapters: [],
      steps: [
        {
          ...integrationDemo.steps[0],
          annotations: [
            {
              id: 'aligned-callout',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
              text: 'Centered message',
              textAlign: 'middle',
            },
          ],
        },
      ],
    } as const;
    const { container } = render(<Demo config={alignedDemo} />);

    const callout = container.querySelector<HTMLElement>('.demo-hotspot-callout');
    expect(callout?.style.getPropertyValue('--hotspot-text-align')).toBe(
      'center',
    );
  });

  it('applies authored headline alignment to cover widgets', () => {
    const alignedCoverDemo = {
      id: 'headAlign001',
      version: 1,
      title: 'Headline Alignment',
      steps: [
        {
          id: 'cover',
          kind: 'cover',
          widgets: [
            {
              type: 'headline',
              id: 'headline',
              title: 'Right aligned',
              description: 'Aligned supporting copy',
              textAlign: 'right',
            },
          ],
        },
      ],
    } as const;

    const { container } = render(
      <Demo.Root config={alignedCoverDemo}>
        <Demo.Stage />
      </Demo.Root>,
    );

    const headline = container.querySelector<HTMLElement>(
      '.demo-widget-headline .demo-intro-content',
    );
    expect(headline?.dataset.textAlign).toBe('right');
    expect(headline?.style.textAlign).toBe('right');
    expect(headline?.style.alignItems).toBe('flex-end');
  });

  it('renders embed iframes with provider-friendly defaults', () => {
    const embedDemo = {
      id: 'embedDef0001',
      version: 1,
      title: 'Embed Defaults',
      steps: [
        {
          id: 'cover',
          kind: 'cover',
          widgets: [
            {
              type: 'embed',
              id: 'calendly',
              src: 'https://calendly.com/aileen_wu',
              sandbox: 'allow-scripts',
            },
          ],
        },
      ],
    } as const;

    const { container } = render(<Demo config={embedDemo} />);
    const frame = container.querySelector<HTMLIFrameElement>(
      '.demo-widget-embed-frame',
    );

    expect(frame?.getAttribute('src')).toBe('https://calendly.com/aileen_wu');
    expect(frame?.getAttribute('sandbox')).toBe(DEFAULT_EMBED_SANDBOX);
    expect(frame?.getAttribute('allow')).toBe(DEFAULT_EMBED_ALLOW);
  });

  it('renders the full controls bar on cover steps (embed and headline)', () => {
    const coverDemo = (
      widget: Record<string, unknown>,
    ): Record<string, unknown> => ({
      id: 'coverCtrl001',
      version: 1,
      title: 'Cover Controls',
      steps: [
        { id: 'cover', kind: 'cover', widgets: [widget] },
        {
          id: 'content',
          kind: 'content',
          background: {
            type: 'image',
            src: 'https://cdn.example.com/s.png',
            naturalWidth: 1200,
            naturalHeight: 600,
          },
        },
      ],
    });

    // The transport bar rides along on cover steps so the viewer always
    // has a way to advance — a full-bleed embed captures clicks, and a
    // headline cover may not carry a CTA.
    const embed = render(
      <Demo
        config={
          coverDemo({
            type: 'embed',
            id: 'e1',
            src: 'https://example.invalid/embed',
          }) as never
        }
      />,
    );
    expect(
      embed.container.querySelector('.demo-controls'),
    ).not.toBeNull();
    embed.unmount();

    const headline = render(
      <Demo
        config={
          coverDemo({
            type: 'headline',
            id: 'h1',
            title: 'Welcome',
            cta: { label: 'Start', action: { type: 'next' } },
          }) as never
        }
      />,
    );
    expect(
      headline.container.querySelector('.demo-controls'),
    ).not.toBeNull();
    headline.unmount();
  });

  it('renders headline secondary cta after the primary with color overrides', () => {
    const ctaDemo = {
      id: 'headCtas0001',
      version: 1,
      title: 'Headline CTAs',
      steps: [
        {
          id: 'cover',
          kind: 'cover',
          widgets: [
            {
              type: 'headline',
              id: 'headline',
              title: 'Pick a path',
              cta: {
                label: 'Start',
                action: { type: 'next' },
                background: '#111111',
                textColor: '#ffffff',
              },
              secondaryCta: {
                label: 'Docs',
                action: { type: 'url', href: 'https://example.com' },
                background: '#eeeeee',
                textColor: '#111111',
              },
            },
          ],
        },
      ],
    } as const;

    const { container } = render(
      <Demo.Root config={ctaDemo}>
        <Demo.Stage />
      </Demo.Root>,
    );

    const buttons = Array.from(
      container.querySelectorAll<HTMLElement>('.demo-intro-cta'),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Start',
      'Docs',
    ]);
    expect(buttons[0]?.style.background).toBe('rgb(17, 17, 17)');
    expect(buttons[0]?.style.color).toBe('rgb(255, 255, 255)');
    expect(buttons[1]?.style.background).toBe('rgb(238, 238, 238)');
    expect(buttons[1]?.style.color).toBe('rgb(17, 17, 17)');
  });

  it('renders a progress preview for text-only cover steps', () => {
    const demoWithFinalCover = {
      ...integrationDemo,
      chapters: [
        {
          id: 'intro',
          title: 'Intro',
          stepIds: ['s1'],
        },
        {
          id: 'finish',
          title: 'Finish',
          stepIds: ['finish-cover'],
        },
      ],
      steps: [
        integrationDemo.steps[0],
        {
          id: 'finish-cover',
          kind: 'cover',
          widgets: [
            {
              type: 'headline',
              id: 'finish-headline',
              title: 'Finish *strong*',
              cta: { label: 'Replay', action: { type: 'restart' } },
            },
          ],
        },
      ],
    };
    const { container } = render(<Demo config={demoWithFinalCover} />);

    const coverPreview = container.querySelector<HTMLElement>(
      '.demo-progress-segment[data-kind="cover"] .demo-progress-segment-preview-cover',
    );
    expect(coverPreview).not.toBeNull();
    expect(coverPreview?.textContent).toContain('Finish strong');
  });

  it('renders the full cover mini in progress previews for cover steps with an image', () => {
    const demoWithImageCover = {
      ...integrationDemo,
      chapters: [
        {
          id: 'intro',
          title: 'Intro',
          stepIds: ['s1', 'image-cover'],
        },
      ],
      steps: [
        integrationDemo.steps[0],
        {
          id: 'image-cover',
          kind: 'cover',
          widgets: [
            {
              type: 'headline',
              id: 'image-cover-headline',
              title: 'Real cover step',
              cta: { label: 'Start', action: { type: 'next' } },
              image: {
                src: '/screen.png',
                alt: 'Product screen',
                position: 'right',
                naturalWidth: 1200,
                naturalHeight: 800,
              },
            },
          ],
        },
      ],
    };
    const { container } = render(<Demo config={demoWithImageCover} />);

    const coverPreview = container.querySelector<HTMLElement>(
      '.demo-progress-segment[data-kind="cover"] .demo-progress-segment-preview-cover',
    );
    expect(coverPreview).not.toBeNull();
    expect(coverPreview?.textContent).toContain('Real cover step');
    expect(
      coverPreview?.querySelector(
        '.demo-widget-split[data-image-position="right"] .demo-widget-image',
      ),
    ).not.toBeNull();
  });

  it('renders a custom brand wordmark and click destination without player header CTAs', () => {
    const brandedDemo = {
      ...integrationDemo,
      theme: {
        brand: {
          logo: 'https://cdn.example.com/logo.svg',
          name: 'Verve AI',
          logoHref: 'https://vervecopilot.com',
        },
      },
    } as const;

    const { container } = render(<Demo config={brandedDemo} />);

    expect(container.querySelector('.demo-header-logo')).toBeNull();
    expect(container.querySelector('.demo-header-title-icon')).not.toBeNull();

    const text = container.querySelector<HTMLElement>('.demo-header-title-text');
    expect(text?.textContent).toBe('Verve AI');

    const pill = container.querySelector<HTMLAnchorElement>(
      'a.demo-header-title-pill',
    );
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('href')).toBe('https://vervecopilot.com');
    expect(pill?.getAttribute('target')).toBe('_blank');
    expect(pill?.getAttribute('rel')).toBe('noopener noreferrer');

    expect(container.querySelector('.demo-header-cta')).toBeNull();
    expect(container.textContent).not.toContain('View docs');
    expect(container.textContent).not.toContain('Try Acme');
  });

  it('renders the full example demo and advances through hotspot annotations', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    render(<Demo config={fullDemo} />);

    const stage = screen.getByRole('region', { name: 'Product Tour' });
    expect(stage).toBeTruthy();
    fireEvent.click(within(stage).getByRole('button', { name: 'Welcome' }));
    expect(screen.getAllByRole('button', { name: 'Click here' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Click here' })[0]!);
    expect(screen.getByText('All set.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
