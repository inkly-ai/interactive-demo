import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const demo = {
  id: 'demoEntry001',
  version: 1,
  steps: [
    {
      id: 's1',
      kind: 'content',
      background: {
        type: 'image',
        src: 'asset:shot',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
    {
      id: 's2',
      kind: 'content',
      background: {
        type: 'image',
        src: 'https://cdn.example.com/screen-2.png',
        naturalWidth: 1200,
        naturalHeight: 600,
      },
    },
  ],
};

const assets = [{ id: 'shot', file: 'shot.png', kind: 'image', sha256: 'a'.repeat(64) }];

async function mountEntry(config: unknown, options: { search?: string } = {}) {
  document.head.innerHTML = '';
  document.body.innerHTML =
    `<script id="demo-config" type="application/json">${JSON.stringify(config)}</script>` +
    `<script id="demo-assets" type="application/json">${JSON.stringify(assets)}</script>` +
    '<div id="root"></div>';
  window.history.replaceState({}, '', options.search ?? '/');
  delete window.__demo;
  vi.resetModules();
  await act(async () => {
    await import('../src/player-entry');
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__demo;
});

describe('standalone player entry', () => {
  it('mounts the demo and exposes the window.__demo contract', async () => {
    await mountEntry(demo);
    expect(document.querySelector('.demo-player')).not.toBeNull();
    expect(window.__demo?.ready).toBe(true);
    expect(window.__demo?.complete).toBe(false);
    expect(window.__demo?.stepIds).toEqual(['s1', 's2']);
    expect(typeof window.__demo?.controls.play).toBe('function');
    expect(window.__demo?.demo.id).toBe('demoEntry001');
    // Managed assets resolve to the page-relative assets folder.
    expect(document.querySelector('img')?.getAttribute('src')).toBe('./assets/shot.png');
  });

  it('stays paused by default and plays with ?autoplay=1', async () => {
    await mountEntry(demo);
    expect(document.querySelector('.demo-controls')?.getAttribute('data-paused')).toBe('true');

    await mountEntry(demo, { search: '/?autoplay=1' });
    expect(document.querySelector('.demo-controls')?.getAttribute('data-paused')).toBeNull();
  });

  it('applies the demo-level canvas background to the root', async () => {
    await mountEntry({ ...demo, background: { type: 'color', color: '#123456' } });
    const root = document.getElementById('root')!;
    expect(root.style.background).toMatch(/#123456|rgb\(18, 52, 86\)/);

    await mountEntry({ ...demo, background: { type: 'image', src: 'asset:shot' } });
    expect(document.getElementById('root')!.style.backgroundImage).toBe('url("./assets/shot.png")');
    expect(document.getElementById('root')!.style.backgroundSize).toBe('cover');

    await mountEntry(demo);
    // The default theme's dotted canvas.
    expect(document.getElementById('root')!.style.background).toMatch(/#f5f5f5|rgb\(245, 245, 245\)/);
    expect(document.getElementById('root')!.style.backgroundImage).toContain('radial-gradient');
    expect(document.getElementById('root')!.style.backgroundSize).toBe('10px 10px');
  });

  it('marks the contract complete when the demo ends', async () => {
    await mountEntry(demo);
    await act(async () => {
      window.__demo!.controls.next();
      window.__demo!.controls.next();
    });
    expect(window.__demo?.complete).toBe(true);
  });

  it('renders the validation issues instead of an empty shell', async () => {
    await mountEntry({ id: 'demoEntry001', version: 1, steps: [{ id: 'x' }] });
    expect(document.querySelector('.demo-player')).toBeNull();
    expect(document.querySelector('.demo-error h2')?.textContent).toBe('Invalid demo config');
    expect(document.querySelector('.demo-error pre')?.textContent).toContain('steps.0');
    expect(window.__demo).toBeUndefined();
  });
});
