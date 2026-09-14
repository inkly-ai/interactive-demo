import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Demo } from '../src';

const demo = {
  id: 'demoBadge001',
  version: 1,
  steps: [
    {
      id: 's1',
      kind: 'content',
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-1.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
  ],
};

describe('built-with badge', () => {
  it('renders by default', () => {
    const { container } = render(<Demo config={demo} />);
    const badge = container.querySelector('a.demo-builtwith-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Built with Inkly');
    expect(badge?.getAttribute('href')).toBe('https://inklyai.dev');
    const wordmark = badge?.querySelector('.demo-builtwith-badge-wordmark');
    expect(wordmark?.textContent).toBe('Inkly');
    expect(wordmark?.firstElementChild?.className).toBe('demo-builtwith-badge-dot');
    expect(badge?.getAttribute('rel')).toContain('noopener');
  });

  it('is hidden by chrome.branding = false', () => {
    const { container } = render(
      <Demo config={{ ...demo, chrome: { branding: false } }} />,
    );
    expect(container.querySelector('.demo-builtwith-badge')).toBeNull();
  });
});
