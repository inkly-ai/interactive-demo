import { describe, expect, it } from 'vitest';
import { BrandSchema, DemoBrandSchema } from '../../src/schema';

describe('BrandSchema', () => {
  it('accepts an optional wordmark name and logo destination', () => {
    const parsed = BrandSchema.parse({
      logo: '/logo.svg',
      name: 'Verve AI',
      logoHref: 'https://vervecopilot.com',
    });
    expect(parsed.name).toBe('Verve AI');
    expect(parsed.logoHref).toBe('https://vervecopilot.com');
  });

  it('allows a mailto logo destination', () => {
    const parsed = BrandSchema.parse({ logoHref: 'mailto:hi@example.com' });
    expect(parsed.logoHref).toBe('mailto:hi@example.com');
  });

  it('rejects a logoHref with an unsafe protocol', () => {
    expect(() =>
      BrandSchema.parse({ logoHref: 'javascript:alert(1)' }),
    ).toThrow();
  });

  it('rejects an empty wordmark name', () => {
    expect(() => BrandSchema.parse({ name: '' })).toThrow();
  });

  it('omits name/logoHref when absent', () => {
    const parsed = BrandSchema.parse({ logo: '/logo.svg' });
    expect(parsed.name).toBeUndefined();
    expect(parsed.logoHref).toBeUndefined();
  });

  it('keeps only identity fields on the per-demo brand', () => {
    const parsed = DemoBrandSchema.parse({
      logo: 'asset:abc',
      name: 'Acme',
      logoHref: 'https://acme.test',
      favicon: '/favicon.ico',
      cta: { label: 'Try', href: 'https://acme.test/try' },
      secondaryCta: { label: 'Docs', href: 'https://acme.test/docs' },
    });
    expect(parsed).toEqual({
      logo: 'asset:abc',
      name: 'Acme',
      logoHref: 'https://acme.test',
    });
    expect(parsed.name).toBe('Acme');
    expect(parsed.logoHref).toBe('https://acme.test');
    expect('favicon' in parsed).toBe(false);
    expect('cta' in parsed).toBe(false);
    expect('secondaryCta' in parsed).toBe(false);
  });
});
