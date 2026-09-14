import { describe, expect, it } from 'vitest';
import { collectMediaPaths, isRelativeMediaPath, mapMediaRefs } from '../src/media';

const config = {
  id: 'mediaTest001',
  version: 1,
  steps: [
    {
      kind: 'cover',
      id: 'c1',
      background: { type: 'image', src: 'assets/backdrop.jpg' },
      widgets: [
        { type: 'headline', id: 'h1', title: 'Hi', logo: { src: './assets/logo.svg' }, image: { src: 'https://cdn.example/hero.png' } },
      ],
    },
    {
      kind: 'content',
      id: 's1',
      background: { type: 'video', src: 'assets/screen.webm', posterSrc: 'assets/screen-poster.png', naturalWidth: 1440, naturalHeight: 900 },
      voiceover: { src: 'assets/voice.mp3' },
    },
    {
      kind: 'content',
      id: 's2',
      background: { type: 'image', src: 'assets/backdrop.jpg', naturalWidth: 1440, naturalHeight: 900 },
    },
  ],
} as unknown as Parameters<typeof collectMediaPaths>[0];

describe('media references', () => {
  it('collects every relative path once, in document order, skipping absolute URLs', () => {
    expect(collectMediaPaths(config)).toEqual([
      'assets/backdrop.jpg',
      'assets/logo.svg',
      'assets/screen.webm',
      'assets/screen-poster.png',
      'assets/voice.mp3',
    ]);
  });

  it('classifies references', () => {
    expect(isRelativeMediaPath('assets/a.png')).toBe(true);
    expect(isRelativeMediaPath('./assets/a.png')).toBe(true);
    for (const abs of ['https://x/a.png', 'data:image/png;base64,AA', '/root/a.png', '//cdn/a.png', 'asset:id', '']) {
      expect(isRelativeMediaPath(abs)).toBe(false);
    }
  });

  it('rewrites references without mutating the input', () => {
    const out = mapMediaRefs(config, (v) => (v.startsWith('assets/') || v.startsWith('./') ? `https://cdn/${v.replace(/^\.\//, '')}` : v));
    const steps = out.steps as unknown as Array<Record<string, unknown>>;
    expect((steps[1]!.background as { src: string; posterSrc: string }).src).toBe('https://cdn/assets/screen.webm');
    expect((steps[1]!.background as { posterSrc: string }).posterSrc).toBe('https://cdn/assets/screen-poster.png');
    expect((steps[1]!.voiceover as { src: string }).src).toBe('https://cdn/assets/voice.mp3');
    const widget = (steps[0]!.widgets as Array<Record<string, { src: string }>>)[0]!;
    expect(widget.logo!.src).toBe('https://cdn/assets/logo.svg');
    expect(widget.image!.src).toBe('https://cdn.example/hero.png');
    expect((config.steps[1] as { background: { src: string } }).background.src).toBe('assets/screen.webm');
  });
});
