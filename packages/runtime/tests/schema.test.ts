import { describe, expect, it } from 'vitest';
import basicDemo from '../examples/basic-demo.json';
import fullDemo from '../examples/full-demo.json';
import {
  DEFAULT_EMBED_ALLOW,
  DEFAULT_EMBED_SANDBOX,
  DemoSchema,
  parseDemo,
} from '../src/schema';

// Authors hand-write JSON — exercises the *input* shape (pre-default).
// Using `unknown` keeps the test fixtures terse without losing the
// runtime parseDemo coverage.
type Json = unknown;

const minimalStep = {
  id: 's1',
  kind: 'content',
  background: {
    type: 'image',
    src: 'https://cdn.example.com/screen-1.png',
    naturalWidth: 1200,
    naturalHeight: 600,
  },
} as const;

const minimalDemo = {
  id: 'demoMinimal1',
  version: 1,
  steps: [minimalStep],
} as const;

function firstIssuePath(input: unknown): string {
  const result = DemoSchema.safeParse(input);
  expect(result.success).toBe(false);

  if (result.success) {
    return '';
  }

  return result.error.issues[0]?.path.join('.') ?? '';
}

function buildCoverDemo(widgets: Json[]) {
  return {
    id: 'demoCover001',
    version: 1,
    steps: [
      {
        id: 'cover',
        kind: 'cover',
        widgets,
      },
      minimalStep,
    ],
  };
}


describe('bundled examples', () => {
  it('basic-demo.json parses', () => {
    expect(DemoSchema.safeParse(basicDemo).success).toBe(true);
  });

  it('full-demo.json parses', () => {
    expect(DemoSchema.safeParse(fullDemo).success).toBe(true);
  });
});

describe('DemoSchema', () => {
  it('parses a minimal valid demo and applies schema defaults', () => {
    const parsed = parseDemo(minimalDemo);

    expect(parsed).toMatchObject({
      id: 'demoMinimal1',
      version: 1,
      chrome: {
        autoplay: false,
      },
      chapters: [],
      steps: [
        {
          id: 's1',
          kind: 'content',
          background: { type: 'image' },
          advance: { trigger: 'auto' },
          annotations: [],
        },
      ],
    });
  });

  it('parses the full example demo', () => {
    const result = DemoSchema.safeParse(fullDemo);

    expect(result.success).toBe(true);
    expect(result.success ? result.data.steps : []).toHaveLength(3);
  });

  it('accepts a demo-level background color', () => {
    const parsed = parseDemo({
      ...minimalDemo,
      backgroundColor: '#a18cd1',
    });

    expect(parsed.backgroundColor).toBe('#a18cd1');
  });

  it('rejects invalid demo-level background colors', () => {
    expect(firstIssuePath({ ...minimalDemo, backgroundColor: 'lavender' })).toBe(
      'backgroundColor',
    );
  });

  it('accepts rich demo-level backgrounds', () => {
    expect(
      parseDemo({
        ...minimalDemo,
        background: {
          type: 'none',
        },
      }).background,
    ).toMatchObject({ type: 'none' });

    expect(
      parseDemo({
        ...minimalDemo,
        background: {
          type: 'color',
          color: '#a18cd1',
        },
      }).background,
    ).toMatchObject({ type: 'color', color: '#a18cd1' });

    expect(
      parseDemo({
        ...minimalDemo,
        background: {
          type: 'color',
          from: '#a18cd1',
          to: '#fbc2eb',
        },
      }).background,
    ).toMatchObject({ type: 'color', from: '#a18cd1', to: '#fbc2eb' });

    expect(
      parseDemo({
        ...minimalDemo,
        background: {
          type: 'image',
          src: './images/wallpaper.png',
          blur: 18,
        },
      }).background,
    ).toMatchObject({ type: 'image', blur: 18 });
  });

  it('rejects invalid rich demo-level backgrounds', () => {
    expect(
      firstIssuePath({
        ...minimalDemo,
        background: { type: 'color', from: 'red', to: '#fbc2eb' },
      }),
    ).toBe('background.from');

    expect(
      firstIssuePath({
        ...minimalDemo,
        background: { type: 'image' },
      }),
    ).toBe('background.src');
  });

  it('accepts a higher future version (forward-compat) and rejects sub-1', () => {
    // `version` was widened from `z.literal(1)` to `z.number().int().min(1)`
    // so a future v2 demo parses instead of hard-failing to a blank player.
    expect(DemoSchema.safeParse({ ...minimalDemo, version: 2 }).success).toBe(
      true,
    );
    // A version below 1 (or non-integer) still fails, reported at `version`.
    expect(firstIssuePath({ ...minimalDemo, version: 0 })).toBe('version');
  });

  it('reports the path for an empty steps list', () => {
    expect(firstIssuePath({ ...minimalDemo, steps: [] })).toBe('steps');
  });

  it('rejects an empty background src', () => {
    // `src` accepts any non-empty string (relative paths, data URIs, and
    // absolute URLs all flow through); empty strings still fail.
    expect(
      firstIssuePath({
        ...minimalDemo,
        steps: [
          {
            ...minimalStep,
            background: {
              ...minimalStep.background,
              src: '',
            },
          },
        ],
      }),
    ).toBe('steps.0.background.src');
  });

  it('reports the path for an invalid annotation coordinate', () => {
    expect(
      firstIssuePath({
        ...minimalDemo,
        steps: [
          {
            ...minimalStep,
            annotations: [
              {
                id: 'a1',
                type: 'message',
                variant: 'pointer',
                x: 1.2,
                y: 0.5,
              },
            ],
          },
        ],
      }),
    ).toBe('steps.0.annotations.0.x');
  });

  it('accepts message text alignment', () => {
    const parsed = parseDemo({
      ...minimalDemo,
      steps: [
        {
          ...minimalStep,
          annotations: [
            {
              id: 'a1',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
              textAlign: 'middle',
            },
          ],
        },
      ],
    });

    const annotation =
      parsed.steps[0]?.kind === 'content'
        ? parsed.steps[0].annotations[0]
        : null;
    expect(annotation).toMatchObject({ textAlign: 'middle' });
  });

  it('defaults showMessage by pointer/cursor variant only', () => {
    const parsed = parseDemo({
      ...minimalDemo,
      steps: [
        {
          ...minimalStep,
          annotations: [
            {
              id: 'pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.3,
              y: 0.3,
            },
            {
              id: 'cursor',
              type: 'message',
              variant: 'cursor',
              x: 0.4,
              y: 0.4,
            },
            {
              id: 'callout',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
            },
            {
              id: 'area',
              type: 'message',
              variant: 'area',
              x: 0.6,
              y: 0.6,
              w: 0.2,
              h: 0.2,
            },
          ],
        },
      ],
    });

    const annotations =
      parsed.steps[0]?.kind === 'content' ? parsed.steps[0].annotations : [];
    expect(annotations[0]).toMatchObject({ showMessage: true });
    expect(annotations[1]).toMatchObject({ showMessage: false });
    expect(annotations[2]).not.toHaveProperty('showMessage');
    expect(annotations[3]).not.toHaveProperty('showMessage');
  });

  it('preserves explicit showMessage values', () => {
    const parsed = parseDemo({
      ...minimalDemo,
      steps: [
        {
          ...minimalStep,
          annotations: [
            {
              id: 'pointer',
              type: 'message',
              variant: 'pointer',
              x: 0.3,
              y: 0.3,
              showMessage: false,
            },
            {
              id: 'cursor',
              type: 'message',
              variant: 'cursor',
              x: 0.4,
              y: 0.4,
              showMessage: true,
            },
            {
              id: 'callout',
              type: 'message',
              variant: 'callout',
              x: 0.5,
              y: 0.5,
              showMessage: false,
            },
          ],
        },
      ],
    });

    const annotations =
      parsed.steps[0]?.kind === 'content' ? parsed.steps[0].annotations : [];
    expect(annotations[0]).toMatchObject({ showMessage: false });
    expect(annotations[1]).toMatchObject({ showMessage: true });
    expect(annotations[2]).toMatchObject({ showMessage: false });
  });

  it('reports the path for an invalid message text alignment', () => {
    expect(
      firstIssuePath({
        ...minimalDemo,
        steps: [
          {
            ...minimalStep,
            annotations: [
              {
                id: 'a1',
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

  it('reports the path for an unknown chapter step reference', () => {
    expect(
      firstIssuePath({
        ...minimalDemo,
        chapters: [
          {
            id: 'ch_1',
            title: 'Missing',
            stepIds: ['missing_step'],
          },
        ],
      }),
    ).toBe('chapters.0.stepIds');
  });

  it('reports the path for an invalid caption cue', () => {
    expect(
      firstIssuePath({
        ...minimalDemo,
        steps: [
          {
            ...minimalStep,
            captions: [
              {
                id: 'c1',
                start: -1,
                end: 500,
                text: 'Invalid',
              },
            ],
          },
        ],
      }),
    ).toBe('steps.0.captions.0.start');
  });
});

describe('CoverStep + Widgets', () => {
  it('parses a cover step with a headline widget and applies defaults', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hello',
          cta: { label: 'Continue', action: { type: 'next' } },
        },
      ]),
    );

    const cover = parsed.steps[0];
    expect(cover?.kind).toBe('cover');
    if (cover?.kind === 'cover') {
      expect(cover.advance).toEqual({ trigger: 'click' });
      expect(cover.widgets).toHaveLength(1);
    }
  });

  it('parses an optional headline image and defaults its position to "right"', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hello',
          image: {
            src: 'https://example.invalid/shot.png',
            naturalWidth: 1200,
            naturalHeight: 800,
          },
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'headline') {
      expect(widget.image?.position).toBe('right');
      expect(widget.image?.src).toBe('https://example.invalid/shot.png');
    }
  });

  it('accepts an optional form image with an explicit position', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'form',
          id: 'f1',
          fields: [{ id: 'email', label: 'Email', type: 'text' }],
          image: { src: 'https://example.invalid/x.png', position: 'left' },
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'form') {
      expect(widget.image?.position).toBe('left');
    }
  });

  it('rejects a cover step with more than one widget', () => {
    expect(
      firstIssuePath(
        buildCoverDemo([
          { type: 'headline', id: 'h1', title: 'A' },
          { type: 'headline', id: 'h2', title: 'B' },
        ]),
      ),
    ).toBe('steps.0.widgets');
  });

  it('preserves the removed "media" widget as an unknown forward-compatible widget', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'media',
          id: 'm1',
          src: 'https://example.invalid/shot.png',
        },
      ]),
    );
    const widget =
      parsed.steps[0]?.kind === 'cover'
        ? (parsed.steps[0].widgets[0] as unknown as {
            type: string;
            src: string;
          })
        : null;
    expect(widget).toMatchObject({
      type: 'media',
      src: 'https://example.invalid/shot.png',
    });
  });

  it('accepts cover solid, gradient, and image backgrounds', () => {
    const base = buildCoverDemo([
      {
        type: 'headline',
        id: 'h1',
        title: 'Hello',
      },
    ]);

    for (const background of [
      { type: 'color', color: '#ffffff' },
      { type: 'color', from: '#a18cd1', to: '#fbc2eb' },
      {
        type: 'image',
        src: 'https://example.invalid/bg.png',
        alt: 'Backdrop',
        blur: 12,
      },
    ]) {
      const parsed = parseDemo({
        ...base,
        steps: [{ ...base.steps[0], background }, base.steps[1]],
      });
      const cover = parsed.steps[0];
      expect(cover?.kind).toBe('cover');
      if (cover?.kind === 'cover') {
        expect(cover.background).toMatchObject(background);
      }
    }
  });

  it('defaults headline cta action to { type: "next" } when only label is provided', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hi',
          cta: { label: 'Go' },
        },
      ]),
    );

    const cover = parsed.steps[0];
    if (cover?.kind === 'cover') {
      const widget = cover.widgets[0];
      if (widget?.type === 'headline') {
        expect(widget.cta?.action).toEqual({ type: 'next' });
        expect(widget.cta?.animation).toBe('shimmer');
      }
    }
  });

  it('accepts explicit static button animation', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hi',
          cta: { label: 'Go', animation: 'none' },
        },
      ]),
    );

    const cover = parsed.steps[0];
    if (cover?.kind === 'cover') {
      const widget = cover.widgets[0];
      if (widget?.type === 'headline') {
        expect(widget.cta?.animation).toBe('none');
      }
    }
  });

  it('accepts headline widget text alignment', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hi',
          textAlign: 'right',
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'headline') {
      expect(widget.textAlign).toBe('right');
    }
  });

  it('reports the path for an invalid headline widget text alignment', () => {
    expect(
      firstIssuePath(
        buildCoverDemo([
          {
            type: 'headline',
            id: 'h1',
            title: 'Hi',
            textAlign: 'center',
          },
        ]),
      ),
    ).toBe('steps.0.widgets.0.textAlign');
  });

  it('accepts headline secondary cta and button color overrides', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'headline',
          id: 'h1',
          title: 'Hi',
          cta: {
            label: 'Start',
            background: '#111111',
            textColor: '#ffffff',
          },
          secondaryCta: {
            label: 'Learn more',
            action: { type: 'url', href: 'https://example.com' },
            background: '#eeeeee',
            textColor: '#111111',
          },
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'headline') {
      expect(widget.cta?.background).toBe('#111111');
      expect(widget.cta?.textColor).toBe('#ffffff');
      expect(widget.secondaryCta?.label).toBe('Learn more');
      expect(widget.secondaryCta?.action).toEqual({
        type: 'url',
        href: 'https://example.com',
        target: '_blank',
      });
      expect(widget.secondaryCta?.background).toBe('#eeeeee');
      expect(widget.secondaryCta?.textColor).toBe('#111111');
    }
  });

  it('rejects a cover step with an empty widgets array', () => {
    expect(firstIssuePath(buildCoverDemo([]))).toBe('steps.0.widgets');
  });

  it('parses a form widget and defaults the submit cta', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'form',
          id: 'f1',
          fields: [{ id: 'email', label: 'Email', type: 'text' }],
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'form') {
      expect(widget.submit.label).toBe('Submit');
      expect(widget.submit.action).toEqual({ type: 'next' });
      expect(widget.submit.animation).toBe('shimmer');
      expect(widget.fields[0]?.required).toBe(false);
    }
  });

  it('rejects a dropdown form field with no options', () => {
    expect(
      firstIssuePath(
        buildCoverDemo([
          {
            type: 'form',
            id: 'f1',
            fields: [{ id: 'role', label: 'Role', type: 'dropdown' }],
          },
        ]),
      ),
    ).toBe('steps.0.widgets.0.fields.0.options');
  });

  it('rejects a dropdown form field with an empty options array', () => {
    // Distinct from the "no options" case above: the field-level
    // schema declares `options` as optional, so omitting it skips the
    // `!field.options` shortcut in the superRefine; supplying `[]`
    // exercises the `length === 0` branch instead.
    expect(
      firstIssuePath(
        buildCoverDemo([
          {
            type: 'form',
            id: 'f1',
            fields: [
              {
                id: 'role',
                label: 'Role',
                type: 'dropdown',
                options: [],
              },
            ],
          },
        ]),
      ),
    ).toBe('steps.0.widgets.0.fields.0.options');
  });

  it('parses a dropdown form field with options', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'form',
          id: 'f1',
          fields: [
            {
              id: 'role',
              label: 'Role',
              type: 'dropdown',
              options: [
                { value: 'eng', label: 'Engineering' },
                { value: 'pm', label: 'Product' },
              ],
            },
          ],
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    expect(widget?.type).toBe('form');
    if (widget?.type === 'form') {
      expect(widget.fields[0]?.options).toHaveLength(2);
    }
  });

  it('parses an embed widget with third-party iframe defaults', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'embed',
          id: 'e1',
          src: 'https://example.com/embed',
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'embed') {
      expect(widget.sandbox).toBe(DEFAULT_EMBED_SANDBOX);
      expect(widget.allow).toBe(DEFAULT_EMBED_ALLOW);
    }
  });

  it('parses a custom widget with opaque data', () => {
    const parsed = parseDemo(
      buildCoverDemo([
        {
          type: 'custom',
          id: 'c1',
          name: 'pricing-table',
          data: { plans: 3 },
        },
      ]),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'custom') {
      expect(widget.name).toBe('pricing-table');
      expect(widget.data).toEqual({ plans: 3 });
    }
  });
});

describe('ButtonAction', () => {
  const buildAction = (cta: { label: string; action: Json }) =>
    buildCoverDemo([
      {
        type: 'headline',
        id: 'h1',
        title: 'Hi',
        cta,
      },
    ]);

  it('accepts all six action variants', () => {
    expect(() =>
      parseDemo(buildAction({ label: 'a', action: { type: 'next' } })),
    ).not.toThrow();
    expect(() =>
      parseDemo(buildAction({ label: 'a', action: { type: 'prev' } })),
    ).not.toThrow();
    expect(() =>
      parseDemo(buildAction({ label: 'a', action: { type: 'restart' } })),
    ).not.toThrow();
    expect(() =>
      parseDemo(
        buildAction({
          label: 'a',
          action: { type: 'step', stepId: 's1' },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      parseDemo(
        buildAction({
          label: 'a',
          action: { type: 'url', href: 'https://example.com' },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      parseDemo({
        ...buildAction({
          label: 'a',
          action: { type: 'chapter', chapterId: 'ch1' },
        }),
        chapters: [{ id: 'ch1', title: 'One', stepIds: ['s1'] }],
      }),
    ).not.toThrow();
  });

  it('defaults url target to _blank', () => {
    const parsed = parseDemo(
      buildAction({
        label: 'Learn more',
        action: { type: 'url', href: 'https://example.com' },
      }),
    );

    const widget =
      parsed.steps[0]?.kind === 'cover' ? parsed.steps[0].widgets[0] : null;
    if (widget?.type === 'headline' && widget.cta?.action.type === 'url') {
      expect(widget.cta.action.target).toBe('_blank');
    }
  });

  it('reports the path for a step-action targeting an unknown step', () => {
    expect(
      firstIssuePath(
        buildAction({
          label: 'Jump',
          action: { type: 'step', stepId: 'nope' },
        }),
      ),
    ).toBe('steps.0.widgets.0.cta.action.stepId');
  });

  it('reports the path for a chapter-action targeting an unknown chapter', () => {
    expect(
      firstIssuePath(
        buildAction({
          label: 'Jump',
          action: { type: 'chapter', chapterId: 'nope' },
        }),
      ),
    ).toBe('steps.0.widgets.0.cta.action.chapterId');
  });
});
