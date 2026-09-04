import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Root, Stage } from '../src';

/**
 * `glassmorphism` cover background. The cover derives its visual from
 * the demo's first contentful image (first content step with an image
 * or video poster), renders it full-bleed via the shared
 * `.demo-intro-background-image`, flags `.demo-intro[data-glass]` (so the
 * CSS blur/scale applies), and paints a `.demo-intro-glass-overlay`
 * frosted veil over it. The image src is resolved live, so it tracks
 * whatever the first screen happens to be.
 */

const coverGlassWidget = {
  type: 'headline' as const,
  id: 'h1',
  title: 'Welcome',
};

function demoWith(firstContent: Record<string, unknown>) {
  return {
    id: 'demoGlass001',
    version: 1,
    title: 'Glass Demo',
    steps: [
      {
        id: 'cover',
        kind: 'cover',
        advance: { trigger: 'click' },
        background: { type: 'glassmorphism' },
        widgets: [coverGlassWidget],
      },
      {
        id: 'content',
        kind: 'content',
        duration: 1000,
        background: firstContent,
        annotations: [],
      },
    ],
  } as const;
}

describe('glassmorphism cover background', () => {
  it('uses the first content image and renders the frosted overlay', () => {
    const { container } = render(
      <Root
        config={demoWith({
          type: 'image',
          src: 'https://cdn.example.com/first-screen.png',
          naturalWidth: 1200,
          naturalHeight: 600,
        })}
      >
        <Stage />
      </Root>,
    );

    const intro = container.querySelector<HTMLElement>('.demo-intro');
    expect(intro).toBeTruthy();
    expect(intro?.hasAttribute('data-glass')).toBe(true);

    const bgImage = container.querySelector(
      '.demo-intro-background-image',
    ) as HTMLImageElement | null;
    expect(bgImage?.getAttribute('src')).toBe(
      'https://cdn.example.com/first-screen.png',
    );
    expect(intro?.style.getPropertyValue('--demo-glass-blur')).toBe('0px');
    expect(intro?.style.getPropertyValue('--demo-glass-overlay-blur')).toBe('6px');

    expect(container.querySelector('.demo-intro-glass-overlay')).toBeTruthy();
  });

  it('falls back to a video poster as the glass source', () => {
    const { container } = render(
      <Root
        config={demoWith({
          type: 'video',
          src: 'https://cdn.example.com/rec.webm',
          posterSrc: 'https://cdn.example.com/poster.png',
          naturalWidth: 1200,
          naturalHeight: 600,
          autoplay: true,
          muted: true,
        })}
      >
        <Stage />
      </Root>,
    );

    const bgImage = container.querySelector(
      '.demo-intro-background-image',
    ) as HTMLImageElement | null;
    expect(bgImage?.getAttribute('src')).toBe(
      'https://cdn.example.com/poster.png',
    );
    expect(container.querySelector('.demo-intro-glass-overlay')).toBeTruthy();
  });

  it('applies a custom glass blur intensity', () => {
    const config = demoWith({
      type: 'image',
      src: 'https://cdn.example.com/first-screen.png',
      naturalWidth: 1200,
      naturalHeight: 600,
    });
    const { container } = render(
      <Root
        config={{
          ...config,
          steps: [
            {
              ...config.steps[0],
              background: { type: 'glassmorphism', intensity: 5 },
            },
            config.steps[1],
          ],
        }}
      >
        <Stage />
      </Root>,
    );

    const intro = container.querySelector('.demo-intro') as HTMLElement | null;
    expect(intro?.style.getPropertyValue('--demo-glass-blur')).toBe('5px');
    expect(intro?.style.getPropertyValue('--demo-glass-overlay-blur')).toBe('6px');
  });

  it('renders no glass image (or overlay) when no content step has an image', () => {
    const { container } = render(
      <Root
        config={{
          id: 'demoGlassH01',
          version: 1,
          title: 'Glass HTML Demo',
          steps: [
            {
              id: 'cover',
              kind: 'cover',
              advance: { trigger: 'click' },
              background: { type: 'glassmorphism' },
              widgets: [coverGlassWidget],
            },
            {
              id: 'content',
              kind: 'content',
              duration: 1000,
              background: {
                type: 'video',
                src: '/content.webm',
                naturalWidth: 1200,
                naturalHeight: 600,
              },
              annotations: [],
            },
          ],
        }}
      >
        <Stage />
      </Root>,
    );

    const intro = container.querySelector('.demo-intro');
    expect(intro).toBeTruthy();
    // No image to derive → not flagged as glass, no backdrop image/overlay.
    expect(intro?.hasAttribute('data-glass')).toBe(false);
    expect(container.querySelector('.demo-intro-glass-overlay')).toBeNull();
  });
});
