import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CoverPreviewMini,
  DEFAULT_EMBED_ALLOW,
  Root,
  Stage,
  type CoverStep,
} from '../src';

/**
 * Structural-parity guardrail.
 *
 * `<CoverPreviewMini>` (used in the editor thumbnail strip + /demos
 * card) re-implements every widget renderer in parallel to the
 * canonical `<Stage>` + `<Widgets>` path, because the mini is a static,
 * non-interactive miniature that runs without `DemoPlayerContext`.
 *
 * The mini is allowed to omit interactive DOM (e.g. the real `<iframe>`
 * inside an embed widget) — those omissions are listed explicitly
 * below. Any other `demo-*` class the canonical emits MUST also appear
 * in the mini's output for the same fixture, or themes will silently
 * diverge between the editor preview and its sidebar thumbnail.
 *
 * A cover holds exactly one widget, so each widget type gets its own
 * single-widget fixture below; the assertions union every fixture's
 * canonical + mini output so all renderers are exercised.
 *
 * If you add a new `demo-*` class to the canonical Widgets renderer,
 * either mirror it in `CoverPreviewMini` or add it to
 * `INTENTIONALLY_MINI_ONLY_OMISSIONS` with a one-line reason. Drift in
 * either direction fails this test. The guard also records authored
 * `data-*` contracts on shared `demo-*` elements; CSS hooks such as
 * `data-image-position="right"` are just as important as classes.
 *
 * SCOPE: this test only checks the DOM (class + data-* parity). It runs
 * in jsdom, which does no layout and does not resolve CSS — so it cannot
 * catch a mini that has perfect class parity but lays out wrong because a
 * shared rule resolves differently in the mini's container context (e.g.
 * a `cqh`/`cqi` unit binding to the mini's `container-type: size` host
 * instead of the stage). That class of bug is covered by the real-browser
 * `cover-mini-layout.pw.tsx` regression test (`npm run test:layout`).
 */

const INTENTIONALLY_MINI_ONLY_OMISSIONS = new Set([
  // Mini renders a div placeholder instead of the real <iframe>, so
  // the iframe's `.demo-widget-embed-frame` class is never emitted.
  'demo-widget-embed-frame',
]);

const FIXTURES: CoverStep[] = [
  {
    kind: 'cover',
    id: 'cover-headline',
    backgroundImage: {
      src: 'https://example.invalid/bg.jpg',
      alt: 'Lake',
    },
    backgroundDim: 0.2,
    advance: { trigger: 'click' },
    widgets: [
      {
        type: 'headline',
        id: 'h1',
        title: 'Your *demo* in 60 seconds.',
        description: 'See how to spin up a demo.',
        image: {
          src: 'https://example.invalid/shot.png',
          alt: 'Product hero',
          naturalWidth: 1200,
          naturalHeight: 800,
          position: 'right',
          layout: 'hero',
        },
        cta: {
          label: 'Get started',
          action: { type: 'next' },
          animation: 'shimmer',
        },
      },
    ],
  },
  {
    kind: 'cover',
    id: 'cover-form',
    advance: { trigger: 'click' },
    widgets: [
      {
        type: 'form',
        id: 'f1',
        title: 'Sign up',
        description: 'Drop your email.',
        image: {
          src: 'https://example.invalid/shot2.png',
          alt: 'Form art',
          naturalWidth: 1200,
          naturalHeight: 800,
          position: 'left',
          layout: 'standard',
        },
        fields: [
          { id: 'name', label: 'Name', type: 'text', required: false },
          { id: 'email', label: 'Email', type: 'text', required: true },
        ],
        submit: {
          label: 'Subscribe',
          action: { type: 'next' },
          animation: 'shimmer',
        },
      },
    ],
  },
  {
    kind: 'cover',
    id: 'cover-embed',
    advance: { trigger: 'click' },
    widgets: [
      {
        type: 'embed',
        id: 'e1',
        src: 'https://example.invalid/embed',
        sandbox: 'allow-scripts',
        allow: DEFAULT_EMBED_ALLOW,
      },
    ],
  },
  {
    kind: 'cover',
    id: 'cover-empty-embed',
    advance: { trigger: 'click' },
    widgets: [
      {
        type: 'embed',
        id: 'e2',
        src: '',
        sandbox: 'allow-scripts',
        allow: DEFAULT_EMBED_ALLOW,
      },
    ],
  },
  {
    kind: 'cover',
    id: 'cover-custom',
    advance: { trigger: 'click' },
    widgets: [
      {
        type: 'custom',
        id: 'c1',
        name: 'pricing-table',
      },
    ],
  },
];

function collectDemoClasses(root: HTMLElement): Set<string> {
  const classes = new Set<string>();
  const walk = (el: Element) => {
    el.classList.forEach((token) => {
      if (token.startsWith('demo-')) classes.add(token);
    });
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return classes;
}

function collectDemoStructuralSignature(root: HTMLElement): Set<string> {
  const signature = new Set<string>();
  const walk = (el: Element) => {
    const demoClasses = Array.from(el.classList).filter((token) =>
      token.startsWith('demo-'),
    );
    for (const cls of demoClasses) {
      signature.add(`class:${cls}`);
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-')) {
          signature.add(`${cls}:${attr.name}=${attr.value}`);
        }
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return signature;
}

/**
 * Render every fixture through both the canonical Stage and the mini,
 * and union the collected classes / structural signatures so all four
 * widget renderers are covered by a single set comparison.
 */
function renderAll() {
  const canonicalClasses = new Set<string>();
  const miniClasses = new Set<string>();
  const canonicalSignature = new Set<string>();
  const miniSignature = new Set<string>();

  for (const cover of FIXTURES) {
    const canonical = render(
      <Root
        themeId="test"
        config={{
          id: 'parityDemo01',
          version: 1,
          title: 'Parity Demo',
          steps: [cover],
        }}
      >
        <Stage />
      </Root>,
    );
    collectDemoClasses(canonical.container).forEach((c) =>
      canonicalClasses.add(c),
    );
    collectDemoStructuralSignature(canonical.container).forEach((s) =>
      canonicalSignature.add(s),
    );
    canonical.unmount();

    const mini = render(<CoverPreviewMini cover={cover} themeId="test" />);
    collectDemoClasses(mini.container).forEach((c) => miniClasses.add(c));
    collectDemoStructuralSignature(mini.container).forEach((s) =>
      miniSignature.add(s),
    );
    mini.unmount();
  }

  return { canonicalClasses, miniClasses, canonicalSignature, miniSignature };
}

describe('CoverPreviewMini ↔ canonical Stage parity', () => {
  it('renders the empty embed author prompt in thumbnails', () => {
    const emptyEmbedCover = FIXTURES.find(
      (cover) => cover.id === 'cover-empty-embed',
    );

    if (!emptyEmbedCover) {
      throw new Error('Missing empty embed cover fixture');
    }

    const mini = render(
      <CoverPreviewMini cover={emptyEmbedCover} themeId="test" />,
    );

    expect(mini.getByText('Embed forms and apps')).toBeTruthy();
    expect(
      mini.getByText(
        'Add a source URL to embed a calendar, form, or app directly in your demo.',
      ),
    ).toBeTruthy();
  });

  it('mini emits a structural superset of every demo-* class the canonical Stage emits', () => {
    const { canonicalClasses, miniClasses } = renderAll();

    const missingFromMini = [...canonicalClasses].filter(
      (cls) =>
        !miniClasses.has(cls) && !INTENTIONALLY_MINI_ONLY_OMISSIONS.has(cls),
    );

    expect(
      missingFromMini,
      `Mini is missing demo-* classes the canonical Stage emits. ` +
        `Either mirror them in CoverPreviewMini, or add them to ` +
        `INTENTIONALLY_MINI_ONLY_OMISSIONS with a reason.`,
    ).toEqual([]);
  });

  it('every entry in INTENTIONALLY_MINI_ONLY_OMISSIONS is actually emitted by canonical and absent from mini', () => {
    // If a class on the allowlist is no longer produced by canonical
    // (or starts being produced by mini), the allowlist entry is dead
    // and should be removed — otherwise it can mask a real divergence.
    const { canonicalClasses, miniClasses } = renderAll();

    for (const cls of INTENTIONALLY_MINI_ONLY_OMISSIONS) {
      expect(
        canonicalClasses.has(cls),
        `Allowlisted "${cls}" is no longer emitted by canonical Stage — remove from allowlist.`,
      ).toBe(true);
      expect(
        miniClasses.has(cls),
        `Allowlisted "${cls}" is now emitted by mini — remove from allowlist.`,
      ).toBe(false);
    }
  });

  it('mini preserves canonical data-* CSS hooks on shared demo elements', () => {
    const { canonicalSignature, miniSignature } = renderAll();

    const missingFromMini = [...canonicalSignature].filter(
      (entry) =>
        !miniSignature.has(entry) &&
        ![...INTENTIONALLY_MINI_ONLY_OMISSIONS].some((cls) =>
          entry.includes(cls),
        ),
    );

    expect(
      missingFromMini,
      `Mini is missing canonical demo structure. Mirror these classes or data attributes in CoverPreviewMini.`,
    ).toEqual([]);
  });
});
