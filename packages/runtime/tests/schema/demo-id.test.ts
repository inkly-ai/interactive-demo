import { describe, expect, it } from 'vitest';

import {
  DEMO_ID_LENGTH,
  DEMO_ID_PATTERN,
  DemoSchema,
  generateDemoId,
  healDemoConfig,
  healDemoConfigStable,
  isValidDemoId,
  resolveDuplicateDemoIds,
  stableDemoIdFromKey,
} from '../../src/schema';

/** A minimal step so demos validate against the full DemoSchema. */
const step = {
  kind: 'content' as const,
  id: 'step-1',
  background: {
    type: 'image' as const,
    src: '/screen.png',
    naturalWidth: 1440,
    naturalHeight: 900,
  },
};

describe('generateDemoId', () => {
  it('produces a fixed-length, URL-safe id', () => {
    for (let i = 0; i < 100; i += 1) {
      const id = generateDemoId();
      expect(id).toHaveLength(DEMO_ID_LENGTH);
      expect(id).toMatch(DEMO_ID_PATTERN);
      // URL-safe: no slash, plus, equals, or whitespace.
      expect(id).not.toMatch(/[/+=\s]/);
    }
  });

  it('is collision-resistant across many calls', () => {
    const ids = new Set<string>();
    const COUNT = 10_000;
    for (let i = 0; i < COUNT; i += 1) ids.add(generateDemoId());
    expect(ids.size).toBe(COUNT);
  });
});

describe('isValidDemoId', () => {
  it('accepts a freshly generated id', () => {
    expect(isValidDemoId(generateDemoId())).toBe(true);
  });

  it('accepts a well-formed 12-char URL-safe id', () => {
    expect(isValidDemoId('abc-DEF_012x')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidDemoId('short')).toBe(false);
    expect(isValidDemoId('thisIsTooLong13')).toBe(false);
    expect(isValidDemoId('')).toBe(false);
  });

  it('rejects out-of-alphabet characters', () => {
    expect(isValidDemoId('abcdef/ghij1')).toBe(false); // slash
    expect(isValidDemoId('abcdef+ghij1')).toBe(false); // plus
    expect(isValidDemoId('abcdef ghij1')).toBe(false); // space
    expect(isValidDemoId('abcdef.ghij1')).toBe(false); // dot
  });

  it('rejects non-string input', () => {
    expect(isValidDemoId(undefined)).toBe(false);
    expect(isValidDemoId(null)).toBe(false);
    expect(isValidDemoId(123456789012)).toBe(false);
    expect(isValidDemoId({ id: 'abc-DEF_012x' })).toBe(false);
  });
});

describe('DemoSchema id validation', () => {
  it('accepts a demo with a valid id', () => {
    const id = generateDemoId();
    const demo = DemoSchema.parse({ id, version: 1, steps: [step] });
    expect(demo.id).toBe(id);
  });

  it('throws when id is missing', () => {
    expect(() => DemoSchema.parse({ version: 1, steps: [step] })).toThrow();
  });

  it('throws when id is malformed', () => {
    expect(() =>
      DemoSchema.parse({ id: 'too-short', version: 1, steps: [step] }),
    ).toThrow();
    expect(() =>
      DemoSchema.parse({ id: 'has/slash012', version: 1, steps: [step] }),
    ).toThrow();
  });
});

describe('healDemoConfig', () => {
  it('mints a fresh id when missing (changed: true)', () => {
    const { config, changed } = healDemoConfig({ version: 1, steps: [step] });
    expect(changed).toBe(true);
    expect(isValidDemoId(config.id)).toBe(true);
  });

  it('mints a fresh id when the existing id is malformed (changed: true)', () => {
    const { config, changed } = healDemoConfig({
      id: 'BAD',
      version: 1,
      steps: [step],
    });
    expect(changed).toBe(true);
    expect(isValidDemoId(config.id)).toBe(true);
    expect(config.id).not.toBe('BAD');
  });

  it('preserves a valid id (changed: false)', () => {
    const id = generateDemoId();
    const { config, changed } = healDemoConfig({
      id,
      version: 1,
      steps: [step],
    });
    expect(changed).toBe(false);
    expect(config.id).toBe(id);
  });

  it('does not mutate its input', () => {
    const raw = { version: 1, steps: [step] };
    healDemoConfig(raw);
    expect('id' in raw).toBe(false);
  });

  it('still throws on non-id schema violations', () => {
    // Valid id but no steps — heal does not paper over other errors.
    expect(() =>
      healDemoConfig({ id: generateDemoId(), version: 1, steps: [] }),
    ).toThrow();
  });

  it('treats non-object input as id-less and heals it', () => {
    // No steps, so it still throws — but it reaches DemoSchema (not a
    // type crash), proving the guard handled the bad input.
    expect(() => healDemoConfig(null)).toThrow();
    expect(() => healDemoConfig('nope')).toThrow();
  });
});

describe('stableDemoIdFromKey', () => {
  it('produces a valid, fixed-length, URL-safe id', () => {
    for (const key of ['getting-started', 'starter-demo', 'a', '', 'x'.repeat(200)]) {
      const id = stableDemoIdFromKey(key);
      expect(id).toHaveLength(DEMO_ID_LENGTH);
      expect(id).toMatch(DEMO_ID_PATTERN);
      expect(isValidDemoId(id)).toBe(true);
    }
  });

  it('is deterministic — the same key always yields the same id', () => {
    expect(stableDemoIdFromKey('getting-started')).toBe(
      stableDemoIdFromKey('getting-started'),
    );
  });

  it('maps distinct keys to distinct ids', () => {
    expect(stableDemoIdFromKey('starter-demo')).not.toBe(
      stableDemoIdFromKey('getting-started'),
    );
  });
});

describe('healDemoConfigStable', () => {
  it('heals an id-less config to the deterministic slug-keyed id', () => {
    const { config, changed } = healDemoConfigStable(
      { version: 1, steps: [step] },
      'starter-demo',
    );
    expect(changed).toBe(true);
    expect(config.id).toBe(stableDemoIdFromKey('starter-demo'));
  });

  it('yields the same id across independent calls for the same slug', () => {
    const a = healDemoConfigStable({ version: 1, steps: [step] }, 'starter-demo');
    const b = healDemoConfigStable({ version: 1, steps: [step] }, 'starter-demo');
    expect(a.config.id).toBe(b.config.id);
  });

  it('preserves a valid id (changed: false, no slug-keying)', () => {
    const id = generateDemoId();
    const { config, changed } = healDemoConfigStable(
      { id, version: 1, steps: [step] },
      'starter-demo',
    );
    expect(changed).toBe(false);
    expect(config.id).toBe(id);
  });
});

describe('resolveDuplicateDemoIds', () => {
  it('keeps the oldest and re-mints newer entries in a 3-way collision', () => {
    const entries = [
      { id: 'dup000000001', updatedAt: 300, name: 'newest' },
      { id: 'dup000000001', updatedAt: 100, name: 'oldest' },
      { id: 'dup000000001', updatedAt: 200, name: 'middle' },
    ];

    const result = resolveDuplicateDemoIds(entries);

    // Two of the three need re-minting (everything but the oldest).
    expect(result).toHaveLength(2);
    const reminted = new Set(result.map((r) => r.entry.name));
    expect(reminted).toEqual(new Set(['newest', 'middle']));
    // The oldest is never returned (it keeps its id).
    expect(reminted.has('oldest')).toBe(false);
    // Every new id is valid and distinct from the original + each other.
    const newIds = result.map((r) => r.newId);
    for (const newId of newIds) {
      expect(isValidDemoId(newId)).toBe(true);
      expect(newId).not.toBe('dup000000001');
    }
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it('returns [] when all ids are unique', () => {
    const entries = [
      { id: generateDemoId(), updatedAt: 1 },
      { id: generateDemoId(), updatedAt: 2 },
      { id: generateDemoId(), updatedAt: 3 },
    ];
    expect(resolveDuplicateDemoIds(entries)).toEqual([]);
  });

  it('handles multiple independent collision groups', () => {
    const entries = [
      { id: 'aaaaaaaaaaaa', updatedAt: 10, name: 'a-old' },
      { id: 'aaaaaaaaaaaa', updatedAt: 20, name: 'a-new' },
      { id: 'bbbbbbbbbbbb', updatedAt: 5, name: 'b-old' },
      { id: 'bbbbbbbbbbbb', updatedAt: 7, name: 'b-new' },
      { id: 'cccccccccccc', updatedAt: 1, name: 'c-solo' },
    ];

    const result = resolveDuplicateDemoIds(entries);
    expect(new Set(result.map((r) => r.entry.name))).toEqual(
      new Set(['a-new', 'b-new']),
    );
  });

  it('breaks updatedAt ties by array order (earliest position keeps)', () => {
    const entries = [
      { id: 'tie000000001', updatedAt: 50, name: 'first' },
      { id: 'tie000000001', updatedAt: 50, name: 'second' },
    ];

    const result = resolveDuplicateDemoIds(entries);
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.entry.name)).toEqual(['second']);
  });
});
