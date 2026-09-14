import { describe, expect, it } from 'vitest';
import { parseDemo } from '@inkly-org/interactive-demo/schema';
import { playerSizeForConfig } from '../src/player-size';

function demo(extra: Record<string, unknown> = {}, background: Record<string, unknown> = {}) {
  return parseDemo({
    id: 'playerSize01',
    version: 1,
    steps: [
      { kind: 'content', id: 's1', background: { type: 'image', src: 'assets/a.png', naturalWidth: 1440, naturalHeight: 900, ...background } },
    ],
    ...extra,
  });
}

describe('playerSizeForConfig', () => {
  it('takes the ratio from the first content step and the header from the theme', () => {
    expect(playerSizeForConfig(demo())).toEqual({ aspectRatio: { width: 1440, height: 900 }, verticalChromeHeight: 52 });
    expect(playerSizeForConfig(demo({ theme: { preset: 'mono' } })).verticalChromeHeight).toBe(48);
  });

  it('prefers an explicit aspectRatio and drops the header when it is hidden', () => {
    const size = playerSizeForConfig(demo({ aspectRatio: { width: 4, height: 3 }, chrome: { hideHeader: true } }));
    expect(size).toEqual({ aspectRatio: { width: 4, height: 3 }, verticalChromeHeight: 0 });
  });
});
