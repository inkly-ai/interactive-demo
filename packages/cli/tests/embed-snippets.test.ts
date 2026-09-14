import { describe, expect, it } from 'vitest';

import {
  buildEmbedSnippetData,
  buildInlineIframe,
  buildPopupLoader,
  formatEmbedSnippet,
} from '../src/publish/embed-snippets';

const URL = 'https://demos.example/p/abc123';
const ORIGIN = 'https://demos.example';

describe('embed snippets', () => {
  it('inline iframe loads the viewer in embed=inline mode', () => {
    const html = buildInlineIframe(URL);
    expect(html).toContain('<iframe');
    expect(html).toContain('src="https://demos.example/p/abc123?embed=inline"');
    expect(html).toContain('allowfullscreen');
  });

  it('inline iframe appends embed=inline without clobbering an existing query', () => {
    // `&` is HTML-escaped inside the src attribute.
    expect(buildInlineIframe(`${URL}?foo=1`)).toContain('?foo=1&amp;embed=inline');
  });

  it('popup loader points at embed.js on the given origin and pre-declares the global', () => {
    const loader = buildPopupLoader(`${ORIGIN}/`);
    expect(loader).toContain('src="https://demos.example/embed.js"');
    expect(loader).toContain('window.InteractiveDemo');
  });

  it('formats popup mode with a loader and a button for every framework', () => {
    const out = formatEmbedSnippet({ mode: 'popup', url: URL, origin: ORIGIN, label: 'Demo' });
    expect(out).toContain('/embed.js');
    for (const fw of ['HTML', 'React', 'Next.js', 'Vue', 'Svelte']) {
      expect(out).toContain(`${fw}:`);
    }
    expect(out).toContain('onclick="InteractiveDemo.open(\'https://demos.example/p/abc123\')"');
    expect(out).toContain('onClick={() => InteractiveDemo.open("https://demos.example/p/abc123")}');
  });

  it('json data carries only the iframe for inline, loader+triggers for popup', () => {
    expect(buildEmbedSnippetData({ mode: 'inline', url: URL, origin: ORIGIN, label: 'x' })).toEqual({
      iframe: expect.stringContaining('<iframe'),
    });
    const popup = buildEmbedSnippetData({ mode: 'popup', url: URL, origin: ORIGIN, label: 'x' });
    expect(popup.loader).toContain('/embed.js');
    expect(Object.keys(popup.triggers as object)).toEqual([
      'html',
      'react',
      'next',
      'vue',
      'svelte',
    ]);
  });
});
