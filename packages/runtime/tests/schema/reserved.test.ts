import { describe, expect, it } from 'vitest';
import { RESERVED_DEMO_SLUGS, validateDemoSlug } from '../../src/schema';

describe('RESERVED_DEMO_SLUGS', () => {
  it('contains the documented reservations', () => {
    expect(RESERVED_DEMO_SLUGS).toEqual(['__demo', 'assets', 'api', 'c']);
  });
});

describe('validateDemoSlug', () => {
  describe('rejects reserved slugs', () => {
    it.each(RESERVED_DEMO_SLUGS)('rejects %s', (slug) => {
      const result = validateDemoSlug(slug);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/reserved/i);
        expect(result.reason).toContain(`'${slug}'`);
      }
    });
  });

  describe('rejects malformed slugs', () => {
    const cases: Array<[string, string]> = [
      ['underscore prefix', '_internal'],
      ['dot prefix', '.hidden'],
      ['uppercase', 'Mydemo'],
      ['space', 'my demo'],
      ['slash', 'my/demo'],
      ['backslash', 'my\\demo'],
      ['dot inside', 'my.demo'],
      ['leading hyphen', '-foo'],
      ['trailing hyphen', 'foo-'],
      ['empty string', ''],
      ['single hyphen', '-'],
      ['tab whitespace', 'foo\tbar'],
    ];

    it.each(cases)('rejects %s (%s)', (_label, slug) => {
      const result = validateDemoSlug(slug);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('accepts well-formed slugs', () => {
    it.each(['getting-started', 'onboarding-v2', 'pricing-tour', 'a', 'a1'])(
      'accepts %s',
      (slug) => {
        expect(validateDemoSlug(slug)).toEqual({ ok: true });
      },
    );
  });

  it('rejects non-string input', () => {
    expect(validateDemoSlug(undefined as unknown as string).ok).toBe(false);
    expect(validateDemoSlug(null as unknown as string).ok).toBe(false);
    expect(validateDemoSlug(42 as unknown as string).ok).toBe(false);
  });
});
