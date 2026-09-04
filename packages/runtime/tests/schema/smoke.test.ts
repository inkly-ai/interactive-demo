import { describe, expect, it } from 'vitest';
import { DemoSchema, parseDemo } from '../../src/schema';

describe('demo-schema package surface', () => {
  it('parses a minimal valid demo', () => {
    const demo = parseDemo({
      id: 'smoke0Demo01',
      version: 1,
      steps: [
        {
          kind: 'content',
          id: 'step-1',
          background: {
            type: 'image',
            src: '/screen.png',
            naturalWidth: 1440,
            naturalHeight: 900,
          },
        },
      ],
    });

    expect(demo.id).toBe('smoke0Demo01');
    expect(demo.steps).toHaveLength(1);
  });

  it('exports DemoSchema as a Zod schema', () => {
    expect(typeof DemoSchema.parse).toBe('function');
  });

});
