import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseDemo } from '@inkly-org/interactive-demo/schema';
import { applyProjectTheme, injectJsonScript, renderDemoPage, resolveTemplate } from '../src/page';
import { assetDeliveryUrl, assetsForPage } from '../src/assets';
import { starterDemoConfig } from '../src/starter';

describe('player page template', () => {
  it('carries the page contract and nothing internal', async () => {
    const html = await readFile(resolveTemplate('demo.html'), 'utf8');
    expect(html).toContain('<link rel="stylesheet" href="./player.css" />');
    expect(html).toContain('<link rel="stylesheet" href="./player-fonts.css" />');
    expect(html).toContain('<script id="demo-config" type="application/json">null</script>');
    expect(html).toContain('<script id="demo-assets" type="application/json">[]</script>');
    expect(html).toContain('<div id="root">');
    expect(html).toContain('<script src="./player.js"></script>');
    for (const banned of ['importmap', 'vendor/', '/__']) {
      expect(html).not.toContain(banned);
    }
  });
});

describe('renderDemoPage', () => {
  const template = `<!doctype html><html><head><title>demo</title>
<script id="demo-config" type="application/json">null</script>
<script id="demo-assets" type="application/json">[]</script>
</head><body><div id="root"></div></body></html>`;

  it('embeds the config, the assets and the title', () => {
    const config = parseDemo({ ...(starterDemoConfig('tour', 'My </script> Tour') as object) });
    const html = renderDemoPage({
      template,
      config,
      assets: assetsForPage([
        { id: 'a', sha256: 'c'.repeat(64), kind: 'image', file: 'a.png' },
      ]),
    });
    expect(html).toContain('<title>My &lt;/script&gt; Tour</title>');
    // A `</script>` inside the JSON must not close the tag.
    expect(html).toContain('My <\\/script> Tour');
    expect(html).toContain('"publicUrl":"./assets/a.png"');
    expect(html).not.toContain('type="application/json">null</script>');
  });

  it('folds the project theme under the demo’s own settings', () => {
    const base = parseDemo(starterDemoConfig('tour'));
    const themed = applyProjectTheme(base, 'mono', { primary: '#111111', secondary: '#eeeeee' });
    expect(themed.theme?.preset).toBe('mono');
    // The demo's own token wins over the project token.
    expect(themed.theme?.tokens?.primary).toBe(base.theme?.tokens?.primary);
    expect(themed.theme?.tokens?.secondary).toBe(base.theme?.tokens?.secondary);

    const withPreset = applyProjectTheme({ ...base, theme: { preset: 'other' } }, 'mono', null);
    expect(withPreset.theme?.preset).toBe('other');

    expect(applyProjectTheme(base, undefined, undefined)).toBe(base);
  });
});

describe('injectJsonScript', () => {
  it('replaces a placeholder tag or inserts before </head>', () => {
    const withPlaceholder = injectJsonScript(
      '<head><script id="x" type="application/json">null</script></head>',
      'x',
      { a: 1 },
    );
    expect(withPlaceholder).toBe('<head><script id="x" type="application/json">{"a":1}</script></head>');
    const inserted = injectJsonScript('<head></head>', 'y', [1]);
    expect(inserted).toBe('<head><script id="y" type="application/json">[1]</script>\n</head>');
  });
});

describe('assetDeliveryUrl', () => {
  it('prefers an absolute publicUrl, else the page-relative assets path', () => {
    const base = { id: 'a', sha256: 'c'.repeat(64), kind: 'image' as const };
    expect(assetDeliveryUrl({ ...base, publicUrl: 'https://cdn.example.com/a.png', file: 'a.png' })).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(assetDeliveryUrl({ ...base, file: 'a.png' })).toBe('./assets/a.png');
    expect(assetDeliveryUrl(base)).toBeNull();
  });
});
