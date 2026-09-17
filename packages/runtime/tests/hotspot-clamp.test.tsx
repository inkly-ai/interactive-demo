import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Root, Stage, type DemoConfig } from '../src';

/**
 * jsdom does no layout, so every rect is stubbed: a 1000×600 stage and a
 * label wide enough to spill past its right edge. The auto-anchor probe
 * measures the cloned label, so the stub keys off the class name.
 */
const STAGE_RECT = { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 };
const OVERFLOWING_LABEL_RECT = { left: 900, top: 200, right: 1040, bottom: 300, width: 140, height: 100 };
const EMPTY_RECT = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

function stubLayout(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const rect = this.classList.contains('demo-stage')
      ? STAGE_RECT
      : this.classList.contains('demo-hotspot-label')
        ? OVERFLOWING_LABEL_RECT
        : EMPTY_RECT;
    return { ...rect, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect;
  });
}

function demoAnchored(anchor: 'right' | 'auto'): DemoConfig {
  return {
    id: 'clampdemo001',
    version: 1,
    title: 'Clamp',
    steps: [
      {
        id: 's1',
        kind: 'content',
        duration: 1000,
        background: {
          type: 'image',
          src: 'https://cdn.example.com/screen.png',
          naturalWidth: 1000,
          naturalHeight: 600,
          alt: 'Screen',
        },
        annotations: [
          {
            id: 'a1',
            type: 'message',
            variant: 'pointer',
            anchor,
            x: 0.95,
            y: 0.4,
            text: 'Right at the edge',
          },
        ],
      },
    ],
  } as DemoConfig;
}

function shiftX(container: HTMLElement): string | undefined {
  const point = container.querySelector<HTMLElement>('.demo-hotspot-pointer');
  return point?.style.getPropertyValue('--hotspot-label-shift-x');
}

describe('a hotspot card near the stage edge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is pulled back inside when the author anchored it', () => {
    stubLayout();
    const { container } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    // The label runs to 1040 against a right bound of 1000 − 8px margin.
    expect(shiftX(container)).toBe('-48px');
    // The authored side is kept: clamping moves the card, never flips it.
    expect(
      container.querySelector('.demo-hotspot-pointer')?.className,
    ).toContain('demo-hotspot-anchor-right');
  });

  it('is still pulled back inside when it resolves its own side', () => {
    stubLayout();
    const { container } = render(
      <Root config={demoAnchored('auto')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('-48px');
  });

  it('is left alone when it already fits', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const rect = this.classList.contains('demo-stage')
        ? STAGE_RECT
        : this.classList.contains('demo-hotspot-label')
          ? { left: 400, top: 200, right: 540, bottom: 300, width: 140, height: 100 }
          : EMPTY_RECT;
      return { ...rect, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect;
    });
    const { container } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('0px');
  });
});
