import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseDemo } from '@inkly-org/interactive-demo/schema';
import { applyProjectTheme, brandLogoPageUrl, injectJsonScript, renderDemoPage, renderPageHeader, resolveTemplate } from '../src/page';
import { starterDemoConfig } from '../src/starter';

describe('player page template', () => {
  it('carries the page contract and nothing internal', async () => {
    const html = await readFile(resolveTemplate('demo.html'), 'utf8');
    expect(html).toContain('<link rel="stylesheet" href="./player.css" />');
    expect(html).toContain('<link rel="stylesheet" href="./player-fonts.css" />');
    expect(html).toContain('<script id="demo-config" type="application/json">null</script>');
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
</head><body><div id="root"></div></body></html>`;

  it('embeds the config and the title, with media paths left relative to the page', () => {
    const config = parseDemo({ ...(starterDemoConfig('tour', 'My </script> Tour') as object) });
    const html = renderDemoPage({ template, config });
    expect(html).toContain('<title>My &lt;/script&gt; Tour</title>');
    // A `</script>` inside the JSON must not close the tag.
    expect(html).toContain('My <\\/script> Tour');
    expect(html).toContain('"src":"assets/placeholder.png"');
    expect(html).not.toContain('demo-assets');
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


describe('page header', () => {
  const template = `<!doctype html><html><head><title>demo</title>
<script id="demo-config" type="application/json">null</script>
</head><body><!-- demo-page-header --><div id="root"></div></body></html>`;
  // The starter pins its own theme; drop it so the project-level theme is what the header sees.
  const config = parseDemo({ ...(starterDemoConfig('tour', 'My Tour') as object), theme: undefined });

  it('renders the demo title with no crumb and no buttons by default', () => {
    const html = renderDemoPage({ template, config, project: { name: 'Acme Demos' } });
    expect(html).toContain('<header class="demo-page-bar">');
    expect(html).not.toContain('demo-page-hub-name');
    expect(html).not.toContain('demo-page-slash');
    expect(html).toContain('<span class="demo-page-demo-name">My Tour</span>');
    expect(html).toContain('<span class="demo-page-cta-scope" data-theme="default"></span>');
    expect(html).not.toContain('demo-page-cta is-primary');
    expect(html).not.toContain('demo-page-brand');
    // The header sits before the player root.
    expect(html.indexOf('demo-page-bar')).toBeLessThan(html.indexOf('<div id="root">'));
  });

  it('renders the brand mark, wordmark and both call-to-action buttons when configured', () => {
    const html = renderDemoPage({
      template,
      config,
      project: {
        name: 'Acme Demos',
        brand: {
          name: 'Acme',
          logo: 'branding/logo.svg',
          logoHref: 'https://acme.example',
          cta: { label: 'Get started', href: 'https://acme.example/start' },
          secondaryCta: { label: 'Docs', href: 'https://acme.example/docs' },
        },
      },
    });
    expect(html).toContain('class="demo-page-btn demo-page-brand" aria-label="Acme" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('<img class="demo-page-brand-mark" src="./brand/logo.svg" alt="" />');
    expect(html).toContain('<span class="demo-page-brand-word">Acme</span>');
    expect(html).toContain('<span class="demo-page-divider" aria-hidden="true"></span>');
    // Secondary first, primary last, both external.
    const secondary = html.indexOf('class="demo-page-cta is-secondary"');
    const primary = html.indexOf('class="demo-page-cta is-primary"');
    expect(secondary).toBeGreaterThan(0);
    expect(primary).toBeGreaterThan(secondary);
    expect(html).toContain('<a href="https://acme.example/start" class="demo-page-cta is-primary" target="_blank" rel="noopener noreferrer">Get started</a>');
  });

  it('renders a same-origin Edit button ahead of the CTAs only when dev passes an editor link', () => {
    const withEdit = renderPageHeader({
      project: { name: 'Acme', brand: { cta: { label: 'Start', href: 'https://acme.example' } } },
      demoTitle: 'Tour',
      themeId: 'default',
      editHref: '/__demo/editor/#/tour',
    });
    expect(withEdit).toContain('<a href="/__demo/editor/#/tour" class="demo-page-cta is-secondary demo-page-edit">Edit</a>');
    expect(withEdit).not.toContain('demo-page-edit" target');
    expect(withEdit.indexOf('demo-page-edit')).toBeLessThan(withEdit.indexOf('is-primary'));

    const built = renderPageHeader({ project: { name: 'Acme' }, demoTitle: 'Tour', themeId: 'default' });
    expect(built).not.toContain('demo-page-edit');
  });

  it('keys the buttons on the effective theme and carries the primary token as the accent', () => {
    const html = renderDemoPage({
      template,
      config,
      themeId: 'mono',
      themeTokens: { primary: '#ff0000' },
      project: { name: 'Acme Demos', brand: { cta: { label: 'Go', href: 'https://acme.example' } } },
    });
    expect(html).toContain('<span class="demo-page-cta-scope" data-theme="mono" style="--demo-page-accent: #ff0000">');
  });

  it('escapes brand text and passes absolute logo URLs through', () => {
    const header = renderPageHeader({
      project: { name: 'A <b>', brand: { name: 'X & Y', logo: 'https://cdn.example/logo.png' } },
      demoTitle: '"Quoted"',
      themeId: 'default',
    });
    expect(header).not.toContain('A <b>');
    expect(header).toContain('X &amp; Y');
    expect(header).toContain('&quot;Quoted&quot;');
    expect(header).toContain('src="https://cdn.example/logo.png"');
    expect(brandLogoPageUrl({ logo: './assets/my logo.png' })).toBe('./brand/my%20logo.png');
    expect(brandLogoPageUrl({ logo: '/logo.png' })).toBe('/logo.png');
    expect(brandLogoPageUrl({})).toBeNull();
  });

  it('falls back to inserting the header before #root when the template has no placeholder', () => {
    const bare = template.replace('<!-- demo-page-header -->', '');
    const html = renderDemoPage({ template: bare, config, project: { name: 'P' } });
    expect(html).toMatch(/<header class="demo-page-bar">[\s\S]*<\/header>\n\s*<div id="root">/);
  });
});
