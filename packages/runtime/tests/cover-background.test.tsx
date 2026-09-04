import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverPreviewMini, Root, Stage, type CoverStep } from '../src';

const gradientCover: CoverStep = {
  id: 'cover-gradient',
  kind: 'cover',
  advance: { trigger: 'click' },
  background: {
    type: 'color',
    from: '#5b5879',
    to: '#5f7158',
  },
  backgroundImage: {
    src: 'https://example.invalid/legacy-cover.jpg',
    alt: 'Legacy cover image',
  },
  widgets: [
    {
      type: 'headline',
      id: 'headline',
      title: 'Your demo in 60 seconds.',
    },
  ],
};

const imageCover: CoverStep = {
  id: 'cover-image',
  kind: 'cover',
  advance: { trigger: 'click' },
  background: {
    type: 'image',
    src: 'https://example.invalid/cover.jpg',
    alt: 'Cover',
    blur: 16,
  },
  widgets: [
    {
      type: 'headline',
      id: 'headline',
      title: 'Your demo in 60 seconds.',
    },
  ],
};

describe('cover background precedence', () => {
  it('renders a color gradient override instead of the legacy background image', () => {
    const { container } = render(
      <Root
        config={{
          id: 'coverbg00001',
          version: 1,
          title: 'Cover Background Demo',
          steps: [gradientCover],
        }}
      >
        <Stage />
      </Root>,
    );

    const intro = container.querySelector<HTMLElement>('.demo-intro');
    expect(intro?.style.background).toContain(
      'linear-gradient(135deg, #5b5879, #5f7158)',
    );
    expect(intro?.dataset.backgroundType).toBe('color');
    expect(intro?.hasAttribute('data-has-background-image')).toBe(false);
    expect(container.querySelector('.demo-intro-background-image')).toBeNull();
  });

  it('keeps CoverPreviewMini aligned with the canonical stage', () => {
    const { container } = render(
      <CoverPreviewMini cover={gradientCover} themeId="test" />,
    );

    const intro = container.querySelector<HTMLElement>('.demo-intro');
    expect(intro?.style.background).toContain(
      'linear-gradient(135deg, #5b5879, #5f7158)',
    );
    expect(intro?.dataset.backgroundType).toBe('color');
    expect(intro?.hasAttribute('data-has-background-image')).toBe(false);
    expect(container.querySelector('.demo-intro-background-image')).toBeNull();
  });

  it('applies image background blur on the canonical stage and mini preview', () => {
    const stage = render(
      <Root
        config={{
          id: 'coverbg00002',
          version: 1,
          title: 'Cover Background Demo',
          steps: [imageCover],
        }}
      >
        <Stage />
      </Root>,
    );

    const stageIntro =
      stage.container.querySelector<HTMLElement>('.demo-intro');
    expect(stageIntro?.style.getPropertyValue('--demo-cover-background-blur')).toBe(
      '16px',
    );

    const mini = render(<CoverPreviewMini cover={imageCover} themeId="test" />);
    const miniIntro = mini.container.querySelector<HTMLElement>('.demo-intro');
    expect(miniIntro?.style.getPropertyValue('--demo-cover-background-blur')).toBe(
      '16px',
    );
  });
});
