import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Demo, joinBaseUrl } from '../src';

function demoWith(src: string) {
  return {
    id: 'demoBase0001',
    version: 1,
    steps: [
      {
        id: 's1',
        kind: 'content',
        background: { type: 'image', src, naturalWidth: 1200, naturalHeight: 600 },
      },
    ],
  };
}

describe('baseUrl', () => {
  it('joins a relative media path onto the demo folder URL', () => {
    const { container } = render(<Demo config={demoWith('assets/shot.png')} baseUrl="/demos/onboarding" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/demos/onboarding/assets/shot.png');
  });

  it('accepts a trailing slash and a leading ./, and leaves absolute URLs alone', () => {
    expect(joinBaseUrl('https://cdn.example/demo/', './assets/a.png')).toBe('https://cdn.example/demo/assets/a.png');
    const { container } = render(
      <Demo config={demoWith('https://cdn.example/shot.png')} baseUrl="/demos/onboarding/" />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/shot.png');
  });

  it('passes a relative path through untouched when no base is given', () => {
    const { container } = render(<Demo config={demoWith('assets/shot.png')} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('assets/shot.png');
  });
});
