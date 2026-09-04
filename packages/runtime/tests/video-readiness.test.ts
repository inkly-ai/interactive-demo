import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadVideoReadiness() {
  return import('../src/utils/video-readiness');
}

describe('video readiness cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('ignores empty sources', async () => {
    const { isVideoSourceReady, markVideoSourceReady } =
      await loadVideoReadiness();

    markVideoSourceReady(null);
    markVideoSourceReady(undefined);
    markVideoSourceReady('');

    expect(isVideoSourceReady(null)).toBe(false);
    expect(isVideoSourceReady(undefined)).toBe(false);
    expect(isVideoSourceReady('')).toBe(false);
  });

  it('keeps only the most recent bounded set of sources', async () => {
    const { isVideoSourceReady, markVideoSourceReady } =
      await loadVideoReadiness();

    for (let i = 0; i < 256; i += 1) {
      markVideoSourceReady(`https://cdn.example.com/video-${i}.mp4`);
    }

    expect(isVideoSourceReady('https://cdn.example.com/video-0.mp4')).toBe(true);

    markVideoSourceReady('https://cdn.example.com/video-256.mp4');

    expect(isVideoSourceReady('https://cdn.example.com/video-0.mp4')).toBe(false);
    expect(isVideoSourceReady('https://cdn.example.com/video-1.mp4')).toBe(true);
    expect(isVideoSourceReady('https://cdn.example.com/video-256.mp4')).toBe(true);
  });

  it('moves a re-marked source to the most recent position', async () => {
    const { isVideoSourceReady, markVideoSourceReady } =
      await loadVideoReadiness();

    for (let i = 0; i < 256; i += 1) {
      markVideoSourceReady(`https://cdn.example.com/video-${i}.mp4`);
    }
    markVideoSourceReady('https://cdn.example.com/video-1.mp4');

    for (let i = 256; i < 511; i += 1) {
      markVideoSourceReady(`https://cdn.example.com/video-${i}.mp4`);
    }

    expect(isVideoSourceReady('https://cdn.example.com/video-1.mp4')).toBe(true);
    expect(isVideoSourceReady('https://cdn.example.com/video-2.mp4')).toBe(false);
  });
});
