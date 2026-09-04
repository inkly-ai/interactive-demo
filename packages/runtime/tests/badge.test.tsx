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

describe('made-with badge', () => {
  it('renders by default', () => {
    const { container } = render(<Demo config={demo} />);
    const badge = container.querySelector('a.demo-builtwith-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Made with interactive-demo');
    expect(badge?.getAttribute('rel')).toContain('noopener');
  });

  it('is hidden by chrome.branding = false', () => {
    const { container } = render(
      <Demo config={{ ...demo, chrome: { branding: false } }} />,
    );
    expect(container.querySelector('.demo-builtwith-badge')).toBeNull();
  });
});
