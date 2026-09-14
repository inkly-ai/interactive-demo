import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Demo } from '../src';

const config = {
  id: 'demoSrc00001',
  version: 1,
  steps: [
    {
      id: 's1',
      kind: 'content',
      background: { type: 'image', src: 'assets/shot.png', naturalWidth: 1200, naturalHeight: 600 },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<Demo src>', () => {
  it('fetches the config from a folder URL and resolves media against that folder', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(config), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<Demo src="/demos/onboarding" />);
    expect(container.querySelector('.demo-loading')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/demos/onboarding/assets/shot.png');
    expect(fetchMock).toHaveBeenCalledWith('/demos/onboarding/demo.config.json');
  });

  it('shows the error card when the folder has no config', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<Demo src="/demos/missing/" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not fetch demo.config.json from /demos/missing/');
    expect(alert.textContent).toContain('HTTP 404');
  });

  it('takes the config object as src, with baseUrl for relative media', () => {
    const { container } = render(<Demo src={config} baseUrl="/demos/onboarding/" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/demos/onboarding/assets/shot.png');
  });

  it('still accepts the config prop', () => {
    const { container } = render(<Demo config={config} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('assets/shot.png');
  });
});
