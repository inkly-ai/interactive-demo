import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../src/schema';

async function loadTiming() {
  return import('../src/utils/timing');
}

const stillStep = (id: string) =>
  ({
    id,
    type: 'screen',
    title: id,
    image: { src: `https://cdn.example.com/${id}.png` },
    // `as unknown as` because the demo `Step` schema now uses `.passthrough()`
    // (forward-compat), whose objectOutputType no longer structurally overlaps
    // this intentionally-minimal drifted fixture for a direct `as` cast.
  }) as unknown as Step;

describe('getEffectiveStepDuration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once per fallback step id', async () => {
    const { DEFAULT_STEP_DURATION_MS, getEffectiveStepDuration } =
      await loadTiming();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getEffectiveStepDuration(stillStep('fallback-once'))).toBe(
      DEFAULT_STEP_DURATION_MS,
    );
    expect(getEffectiveStepDuration(stillStep('fallback-once'))).toBe(
      DEFAULT_STEP_DURATION_MS,
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('bounds fallback warning dedupe entries and evicts the oldest id', async () => {
    const { DEFAULT_STEP_DURATION_MS, getEffectiveStepDuration } =
      await loadTiming();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 256; i += 1) {
      getEffectiveStepDuration(stillStep(`bounded-${i}`));
    }
    expect(warn).toHaveBeenCalledTimes(256);

    getEffectiveStepDuration(stillStep('bounded-256'));
    expect(warn).toHaveBeenCalledTimes(257);

    getEffectiveStepDuration(stillStep('bounded-0'));
    expect(warn).toHaveBeenCalledTimes(258);
    expect(getEffectiveStepDuration(stillStep('bounded-257'))).toBe(
      DEFAULT_STEP_DURATION_MS,
    );

    getEffectiveStepDuration(stillStep('bounded-1'));
    expect(warn).toHaveBeenCalledTimes(260);
  });
});
