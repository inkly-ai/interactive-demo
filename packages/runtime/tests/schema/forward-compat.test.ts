import { describe, expect, it } from 'vitest';

import { DemoSchema, parseDemo } from '../../src/schema';

const contentStep = {
  kind: 'content',
  id: 'step-1',
  background: {
    type: 'image',
    src: '/screen.png',
    naturalWidth: 1440,
    naturalHeight: 900,
  },
} as const;

const baseDemo = {
  id: 'forwardCmpt1',
  version: 1,
  steps: [contentStep],
} as const;

function firstIssuePath(input: unknown): string {
  const result = DemoSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? '' : result.error.issues[0]?.path.join('.') ?? '';
}

describe('forward-compatible demo parsing', () => {
  it('accepts future positive integer schema versions but rejects invalid versions', () => {
    expect(DemoSchema.safeParse({ ...baseDemo, version: 2 }).success).toBe(true);
    expect(firstIssuePath({ ...baseDemo, version: 0 })).toBe('version');
    expect(firstIssuePath({ ...baseDemo, version: 1.5 })).toBe('version');
    expect(firstIssuePath({ ...baseDemo, version: '1' })).toBe('version');
  });

  it('preserves unknown top-level and step-level fields', () => {
    const parsed = parseDemo({
      ...baseDemo,
      futureTopLevel: { enabled: true },
      steps: [
        {
          ...contentStep,
          futureStepField: 'kept',
        },
      ],
    }) as unknown as {
      futureTopLevel: { enabled: boolean };
      steps: Array<{ futureStepField?: string }>;
    };

    expect(parsed.futureTopLevel).toEqual({ enabled: true });
    expect(parsed.steps[0]?.futureStepField).toBe('kept');
  });

  it('accepts unknown annotation types while preserving their payload', () => {
    const parsed = parseDemo({
      ...baseDemo,
      steps: [
        {
          ...contentStep,
          annotations: [
            {
              id: 'future-annotation',
              type: 'spotlight',
              radius: 12,
              target: '#cta',
            },
          ],
        },
      ],
    }) as unknown as {
      steps: Array<{ annotations?: Array<Record<string, unknown>> }>;
    };

    expect(parsed.steps[0]?.annotations?.[0]).toEqual({
      id: 'future-annotation',
      type: 'spotlight',
      radius: 12,
      target: '#cta',
    });
  });

  it('still rejects malformed known annotation types with precise paths', () => {
    expect(
      firstIssuePath({
        ...baseDemo,
        steps: [
          {
            ...contentStep,
            annotations: [
              {
                id: 'known-message',
                type: 'message',
                variant: 'callout',
                x: 0.5,
                y: 0.5,
                textAlign: 'center',
              },
            ],
          },
        ],
      }),
    ).toBe('steps.0.annotations.0.textAlign');
  });

  it('accepts unknown cover widget types while preserving their payload', () => {
    const parsed = parseDemo({
      ...baseDemo,
      steps: [
        {
          kind: 'cover',
          id: 'cover',
          widgets: [
            {
              id: 'future-widget',
              type: 'quiz',
              question: 'Which plan?',
              choices: ['Free', 'Pro'],
            },
          ],
        },
        contentStep,
      ],
    }) as unknown as {
      steps: Array<{ widgets?: Array<Record<string, unknown>> }>;
    };

    expect(parsed.steps[0]?.widgets?.[0]).toEqual({
      id: 'future-widget',
      type: 'quiz',
      question: 'Which plan?',
      choices: ['Free', 'Pro'],
    });
  });

  it('still rejects malformed known widget types with precise paths', () => {
    expect(
      firstIssuePath({
        ...baseDemo,
        steps: [
          {
            kind: 'cover',
            id: 'cover',
            widgets: [
              {
                id: 'known-headline',
                type: 'headline',
                title: 'Hello',
                textAlign: 'center',
              },
            ],
          },
          contentStep,
        ],
      }),
    ).toBe('steps.0.widgets.0.textAlign');
  });
});
