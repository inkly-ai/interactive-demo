import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Root, Stage, type DemoConfig } from '../src';

/**
 * jsdom does no layout, so every rect is stubbed: a 1000×600 stage and a
 * label wide enough to spill past its right edge. The auto-anchor probe
 * measures the cloned label, so the stub keys off the class name.
 */
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

const STAGE_RECT: Rect = { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 };
const NARROW_STAGE_RECT: Rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
const OVERFLOWING_LABEL_RECT: Rect = { left: 900, top: 200, right: 1040, bottom: 300, width: 140, height: 100 };
const FITTING_LABEL_RECT: Rect = { left: 400, top: 200, right: 540, bottom: 300, width: 140, height: 100 };
const EMPTY_RECT: Rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

/**
 * The rects the stub hands back, swapped mid-test to stand in for the layout
 * changing under a card that is already placed.
 */
let stageRect: Rect = STAGE_RECT;
let labelRect: Rect = OVERFLOWING_LABEL_RECT;

function stubLayout(): void {
  stageRect = STAGE_RECT;
  labelRect = OVERFLOWING_LABEL_RECT;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const rect = this.classList.contains('demo-stage')
      ? stageRect
      : this.classList.contains('demo-hotspot-label')
        ? labelRect
        : EMPTY_RECT;
    return { ...rect, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect;
  });
}

/** jsdom has no ResizeObserver; this one fires when a test says so. */
const resizeCallbacks = new Set<() => void>();

class TestResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(): void {
    resizeCallbacks.add(this.callback);
  }
  unobserve(): void {
    resizeCallbacks.delete(this.callback);
  }
  disconnect(): void {
    resizeCallbacks.delete(this.callback);
  }
}

/** Longer than the hook's last entrance pass (POINTER_TRANSITION_MS + 80). */
const SETTLE_MS = 760;

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Fire every observer and let the hook's coalescing frame run. */
async function resizeStage(rect: Rect): Promise<void> {
  stageRect = rect;
  await act(async () => {
    for (const callback of [...resizeCallbacks]) callback();
    await new Promise((resolve) => setTimeout(resolve, 48));
  });
}

function demoAnchored(anchor: 'right' | 'auto', text = 'Right at the edge'): DemoConfig {
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
            text,
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
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
  });

  afterEach(() => {
    resizeCallbacks.clear();
    vi.unstubAllGlobals();
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
    stubLayout();
    labelRect = FITTING_LABEL_RECT;
    const { container } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('0px');
  });

  it('is re-measured when the stage changes size', async () => {
    stubLayout();
    const { container } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    // Let the entrance passes finish first, so a later change can only be
    // the observer's doing and not a frame that was still in flight.
    await wait(SETTLE_MS);
    expect(shiftX(container)).toBe('-48px');
    // A responsive embed reflowing to a narrower column: the same card and
    // the same copy, less room. A clamp measured against the old width now
    // leaves the card spilling out of the frame, so it has to be retaken.
    await resizeStage(NARROW_STAGE_RECT);
    expect(shiftX(container)).toBe('-248px');
  });

  it('is re-measured when the copy changes under a pointer that stayed put', () => {
    stubLayout();
    const { container, rerender } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('-48px');
    // Two steps can place the pointer at the same spot with different copy,
    // and the wrapper is keyed by position, so the instance carries over.
    labelRect = FITTING_LABEL_RECT;
    rerender(
      <Root config={demoAnchored('right', 'A shorter line')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('0px');
  });

  it('drops the shift when the stage stops being measurable', () => {
    stubLayout();
    const { container, rerender } = render(
      <Root config={demoAnchored('right')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('-48px');
    // A pop-up embed whose container is not displayed measures 0×0. The
    // probe can't run, and last step's clamp must not stand in for it.
    stageRect = EMPTY_RECT;
    rerender(
      <Root config={demoAnchored('right', 'A different line')}>
        <Stage />
      </Root>,
    );
    expect(shiftX(container)).toBe('0px');
  });
});
