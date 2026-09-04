import { describe, expect, it } from 'vitest';
import {
  demoThemePresetsById,
  demoThemePresets,
  extractDemoTheme,
  injectResolvedThemeIntoConfig,
  resolveDemoBrand,
  resolveDemoTheme,
} from '../src/themes';

describe('demoThemePresetsById', () => {
  it('includes the mono preset', () => {
    expect(demoThemePresetsById['mono']).toBeDefined();
  });

  it('mono has a non-empty css string', () => {
    const p = demoThemePresetsById['mono'];
    expect(p).toBeDefined();
    expect(typeof p!.css).toBe('string');
    expect((p!.css ?? '').length).toBeGreaterThan(0);
  });

  it('mono exposes the 4 token fields', () => {
    const p = demoThemePresetsById['mono'];
    expect(p).toBeDefined();
    const theme = p!.theme;
    expect(theme.primary).toBeDefined();
    expect(theme.secondary).toBeDefined();
    expect(theme.font).toBeDefined();
    expect(theme.radius).toBeDefined();
  });

  it('exports the full preset list', () => {
    expect(Array.isArray(demoThemePresets)).toBe(true);
    expect(demoThemePresets.length).toBeGreaterThan(0);
  });
});

describe('resolveDemoBrand', () => {
  it('merges only identity fields into the player brand', () => {
    const resolved = resolveDemoBrand({
      hostBrand: {
        name: 'Host Brand',
        logo: 'public/logo.svg',
        logoHref: 'https://example.com',
        favicon: 'public/favicon.svg',
        cta: { label: 'Try', href: 'https://example.com/try' },
        secondaryCta: { label: 'Docs', href: 'https://example.com/docs' },
      },
      demoBrand: {
        name: 'Demo Brand',
      },
    });

    expect(resolved).toEqual({
      name: 'Demo Brand',
      logo: 'public/logo.svg',
      logoHref: 'https://example.com',
    });
  });
});

describe('resolveDemoTheme', () => {
  it('uses mono tokens and css by default', () => {
    const resolved = resolveDemoTheme();

    expect(resolved.themeId).toBe('mono');
    expect(resolved.tokens.primary).toBe('#5b6cff');
    expect(resolved.css).toContain('[data-demo-theme="mono"]');
  });

  it('cascades preset tokens, host tokens, then demo tokens', () => {
    const resolved = resolveDemoTheme({
      host: {
        theme: 'mono',
        tokens: {
          primary: '#111111',
          secondary: '#222222',
        },
      },
      demoTheme: {
        tokens: {
          primary: '#333333',
          radius: '24px',
        },
      },
    });

    expect(resolved.tokens.primary).toBe('#333333');
    expect(resolved.tokens.secondary).toBe('#222222');
    expect(resolved.tokens.radius).toBe('24px');
    expect(resolved.tokens.font).toBe(
      demoThemePresetsById['mono']!.theme.font,
    );
  });

  it('falls back to mono when the requested preset is unknown', () => {
    const resolved = resolveDemoTheme({
      demoTheme: { preset: 'missing-theme' },
    });

    expect(resolved.themeId).toBe('mono');
    expect(resolved.tokens.primary).toBe('#5b6cff');
  });

  it('extracts and injects resolved tokens without dropping the preset', () => {
    const config = {
      id: 'demo',
      theme: {
        preset: 'mono',
        tokens: { primary: '#123456' },
      },
    };
    const resolved = resolveDemoTheme({
      demoTheme: extractDemoTheme(config),
    });

    expect(resolved.tokens.primary).toBe('#123456');
    expect(injectResolvedThemeIntoConfig(config, resolved.tokens)).toEqual({
      id: 'demo',
      theme: {
        preset: 'mono',
        tokens: {
          ...demoThemePresetsById['mono']!.theme,
          primary: '#123456',
        },
      },
    });
  });
});
