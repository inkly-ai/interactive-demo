/**
 * High-fidelity miniature of a demo cover step. Renders the real
 * `.demo-player` → `.demo-intro` → `.demo-cover-grid` DOM at a fixed
 * nominal size and uses a CSS `transform: scale(...)` driven by a
 * container query to cover whatever box the parent provides.
 *
 * Used in two places (both in the Next app):
 *   - The editor's step-thumbnail strip (cover slots).
 *   - Any host card thumbnail when no content image is available.
 *
 * Lives in the package so it stays next to `Widgets.tsx` (the canonical
 * cover renderer) — that proximity is what `tests/cover-mini-parity.test.tsx`
 * enforces: every `demo-*` class the canonical produces must also appear in
 * the mini's output. Drift in either file fails the test.
 *
 * The package's global CSS (`@inkly-org/interactive-demo/styles.css`) is
 * expected to be loaded by the host, so the base `.demo-*`
 * classes are styled. The optional `themeCss` prop injects the demo's
 * scoped theme overrides so themed demos render with the right palette
 * / type. Skipping `themeCss` is a known footgun — the editor strip
 * forgot it for a while and the CTA visually drifted from the main
 * preview.
 *
 * Note: CSS class names keep the legacy `demo-intro-*` prefix — that's
 * the styling contract themes already speak.
 */

import type { CSSProperties, ReactNode } from 'react';
import type {
  CoverBackground,
  CoverStep,
  Cta,
  CustomWidget,
  EmbedWidget,
  FormWidget,
  HeadlineWidget,
  MessageTextAlign,
  ThemeTokens,
  Widget,
  WidgetImage,
} from '../schema';
import { defaultThemeTokens } from '../theme/tokens';
import {
  DEFAULT_DEMO_THEME_ID,
  demoThemeDefaultTokensFor,
} from '../themes/token-defaults';

const NOMINAL_WIDTH = 960;
const DEFAULT_GLASS_BLUR_INTENSITY = 0;

function glassBackgroundStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'glassmorphism') return undefined;
  const intensity = background.intensity ?? DEFAULT_GLASS_BLUR_INTENSITY;
  return {
    '--demo-glass-blur': `${Math.max(0, intensity)}px`,
    '--demo-glass-overlay-blur': `${Math.max(0, Math.min(6, intensity + 6))}px`,
  } as CSSProperties;
}

function coverBackgroundBlurStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'image') return undefined;
  const blur =
    typeof background.blur === 'number' && Number.isFinite(background.blur)
      ? Math.min(48, Math.max(0, background.blur))
      : 0;
  if (blur <= 0) return undefined;
  return {
    '--demo-cover-background-blur': `${blur}px`,
    '--demo-cover-background-scale': `${1 + Math.min(0.12, blur / 240)}`,
  } as CSSProperties;
}

function miniOverrides(stageW: number, stageH: number): string {
  // Derive the cover-scale denominator from the actual ratio so the mini
  // fills its (same-ratio) container exactly — a fixed 480/540 only works
  // for the two named presets and over-scales / crops anything else.
  const nominalHeight = (NOMINAL_WIDTH * stageH) / stageW;
  return `
.intro-mini-host { container-type: size; }
/*
 * The stage is pinned to the demo's nominal pixel box and made a size
 * container. This is load-bearing for more than the scale transform:
 * shared cover CSS sizes against \`cqh\` (e.g. the image frame's
 * \`max-height: 70cqh\` / \`46cqh\`). In the live player nothing in the
 * stage is a \`container-type: size\` ancestor, so those \`cqh\` fall back
 * to the small viewport (≈ the player's own height) and read as "70% of
 * the cover." The mini, though, wraps the stage in \`.intro-mini-host\`
 * (a size container, for the scale transform) — without an intervening
 * size container, every \`cqh\` inside would resolve against the tiny
 * ~130px thumbnail box and collapse the image to a sliver. Making the
 * stage itself a size container at its true ${NOMINAL_WIDTH}×${Math.round(
    nominalHeight,
  )} dimensions re-anchors all \`cqh\` to the nominal cover, generically —
 * no per-rule patching. \`cqi\` units still resolve against the inner
 * \`.demo-player\` (\`container-type: inline-size\`), exactly as live, so
 * type/spacing are untouched. The explicit height is required: a size
 * container must not derive its size from its contents, or \`contain:
 * size\` collapses it to zero.
 */
.intro-mini-host .intro-mini-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${NOMINAL_WIDTH}px;
  height: ${nominalHeight}px;
  container-type: size;
  transform-origin: center;
  transform: translate(-50%, -50%) scale(max(calc(100cqw / ${NOMINAL_WIDTH}px), calc(100cqh / ${nominalHeight}px)));
  pointer-events: none;
  user-select: none;
}
.intro-mini-host .intro-mini-stage .demo-player {
  width: 100%;
  min-width: 0;
  max-width: none;
  margin: 0;
}
.intro-mini-host .intro-mini-stage .demo-player-shell {
  aspect-ratio: ${stageW} / ${stageH};
}
.intro-mini-host .intro-mini-stage .demo-intro-cta,
.intro-mini-host .intro-mini-stage .demo-widget-submit {
  pointer-events: none;
}
.intro-mini-host .intro-mini-stage .demo-intro-background-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.intro-mini-host .intro-mini-stage .demo-intro-background-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.intro-mini-host .intro-mini-stage .demo-intro-dim {
  position: absolute;
  inset: 0;
  background: #000;
  pointer-events: none;
}
`;
}

export type CoverPreviewMiniProps = {
  cover: CoverStep;
  themeId?: string;
  themeTokens?: Partial<ThemeTokens>;
  themeCss?: string;
  className?: string;
  stageAspectRatio?: '2 / 1' | '16 / 9';
  /**
   * Explicit numeric stage ratio. Overrides `stageAspectRatio` when set,
   * letting callers match an arbitrary player aspect ratio (e.g. the
   * scrub-preview thumbnail) instead of one of the two named presets.
   */
  stageRatio?: { width: number; height: number };
  glassImageSrc?: string;
};

function themeStyle(
  themeId: string | undefined,
  t: Partial<ThemeTokens> | undefined,
): CSSProperties {
  const activeThemeId = themeId ?? DEFAULT_DEMO_THEME_ID;
  const presetTheme =
    demoThemeDefaultTokensFor(activeThemeId) ?? defaultThemeTokens;
  const tokens = {
    ...presetTheme,
    ...(t ?? {}),
  };
  return {
    '--demo-primary': tokens.primary,
    '--demo-secondary': tokens.secondary,
    '--demo-radius': tokens.radius,
    '--demo-font': tokens.font,
  } as CSSProperties;
}

/**
 * Strip common inline markdown markers so a thumbnail rendering of a
 * headline title (`Your demo in *60 seconds*.`) reads as plain text.
 * The stage rendering uses the full markdown pipeline; thumbnails
 * intentionally don't to keep their typography stable at small sizes.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

/**
 * Title-only variant of `stripInlineMarkdown` that preserves `**bold**`
 * as a real `<strong>` element so the theme rule
 * `.demo-intro-title strong { color: var(--demo-primary) }` colors the
 * bold span in the thumbnail just like it does on the live stage.
 * Italic / code / underscore are still flattened — only `<strong>`
 * carries semantic meaning we want to surface at thumbnail scale.
 */
function renderInlineTitle(text: string): ReactNode {
  // Split on `**...**`, keeping the matches so we can rebuild with
  // `<strong>` in place. The non-bold segments still get the other
  // markers stripped (italic / code / underscore) to match the stage's
  // visual stability rules at small sizes.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return (
      <span key={i}>
        {part
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/`(.+?)`/g, '$1')}
      </span>
    );
  });
}

function headlineAlignmentStyle(
  textAlign: MessageTextAlign | undefined,
): CSSProperties | undefined {
  if (!textAlign) return undefined;
  if (textAlign === 'middle') {
    return { textAlign: 'center', alignItems: 'center' };
  }
  if (textAlign === 'right') {
    return { textAlign: 'right', alignItems: 'flex-end' };
  }
  return { textAlign: 'left', alignItems: 'flex-start' };
}

function ctaStyle(cta: Cta): CSSProperties | undefined {
  if (!cta.background && !cta.textColor) return undefined;
  return {
    background: cta.background,
    color: cta.textColor,
  };
}

function coverBackgroundStyle(
  background: CoverBackground | undefined,
): CSSProperties | undefined {
  if (background?.type !== 'color') return undefined;
  if (background.from && background.to) {
    return {
      background: `linear-gradient(135deg, ${background.from}, ${background.to})`,
    };
  }
  if (background.color) {
    return { background: background.color };
  }
  return undefined;
}

/**
 * Static mirror of `WidgetImageFrame` in `Widgets.tsx`. The mini has no
 * asset resolver, so it renders `image.src` directly.
 */
function WidgetImageFrameMini({ image }: { image: WidgetImage }) {
  const hasNatural =
    typeof image.naturalWidth === 'number' &&
    typeof image.naturalHeight === 'number';
  return (
    <div
      className="demo-widget-image-frame"
      data-layout={image.layout}
      style={
        image.layout !== 'hero' && hasNatural
          ? { aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}` }
          : undefined
      }
    >
      <img
        className="demo-widget-image"
        src={image.src}
        alt=""
        width={image.naturalWidth}
        height={image.naturalHeight}
      />
    </div>
  );
}

function WidgetWithImageMini({
  image,
  children,
}: {
  image: WidgetImage | undefined;
  children: ReactNode;
}) {
  if (!image) return <>{children}</>;
  return (
    <div className="demo-widget-split" data-image-position={image.position}>
      {children}
      <WidgetImageFrameMini image={image} />
    </div>
  );
}

function HeadlineMini({ widget }: { widget: HeadlineWidget }) {
  const titleNodes = renderInlineTitle(widget.title);
  const descriptionText = widget.description
    ? stripInlineMarkdown(widget.description)
    : '';
  return (
    <div
      className="demo-widget demo-widget-headline"
      data-widget-id={widget.id}
    >
	      <WidgetWithImageMini image={widget.image}>
	        <div
	          className="demo-intro-content"
	          data-text-align={widget.textAlign}
	          style={headlineAlignmentStyle(widget.textAlign)}
	        >
	          <h2
	            className="demo-intro-title"
	            style={widget.titleColor ? { color: widget.titleColor } : undefined}
	          >
	            {titleNodes}
	          </h2>
	          {descriptionText ? (
	            <p
	              className="demo-intro-description"
	              style={
	                widget.descriptionColor
	                  ? { color: widget.descriptionColor }
	                  : undefined
	              }
	            >
	              {descriptionText}
	            </p>
	          ) : null}
	          {widget.cta || widget.secondaryCta ? (
	            <div className="demo-intro-actions">
	              {[widget.cta, widget.secondaryCta].map((cta, index) =>
	                cta ? (
	                  <span
	                    key={index}
	                    className={[
	                      'demo-button',
	                      cta.animation === 'shimmer' ? 'demo-button-shimmer' : '',
	                      'demo-intro-cta',
	                    ]
	                      .filter(Boolean)
	                      .join(' ')}
	                    style={ctaStyle(cta)}
	                    role="presentation"
	                    aria-hidden
	                  >
	                    {cta.animation === 'shimmer' ? (
	                      <span aria-hidden className="demo-button-shimmer-fx" />
	                    ) : null}
	                    <span className="demo-button-label">{cta.label}</span>
	                  </span>
	                ) : null,
	              )}
	            </div>
	          ) : null}
	        </div>
	      </WidgetWithImageMini>
    </div>
  );
}

function FormMini({ widget }: { widget: FormWidget }) {
  return (
    <div className="demo-widget demo-widget-form" data-widget-id={widget.id}>
      <WidgetWithImageMini image={widget.image}>
        <div className="demo-widget-form-content">
          {widget.title ? (
            <h3 className="demo-widget-title">{widget.title}</h3>
          ) : null}
          {widget.description ? (
            <p className="demo-widget-description">{widget.description}</p>
          ) : null}
          <div className="demo-widget-form-body">
            {widget.fields.slice(0, 3).map((field) => (
              <label key={field.id} className="demo-widget-field">
                <span className="demo-widget-field-input" aria-hidden />
              </label>
            ))}
            <span className="demo-widget-submit" aria-hidden>
              {widget.submit.label}
            </span>
          </div>
        </div>
      </WidgetWithImageMini>
    </div>
  );
}

function EmbedMini({ widget }: { widget: EmbedWidget }) {
  // Full-bleed embed. Empty embeds mirror the canonical author prompt;
  // configured embeds stay non-interactive in thumbnails instead of
  // loading a real iframe.
  return (
    <div className="demo-widget demo-widget-embed" data-widget-id={widget.id}>
      {!widget.src.trim() ? (
        <div className="demo-widget-embed-empty">
          <div className="demo-widget-embed-empty-body">
            <h3 className="demo-widget-embed-empty-title">
              Embed forms and apps
            </h3>
            <p className="demo-widget-embed-empty-text">
              Add a source URL to embed a calendar, form, or app directly in
              your demo.
            </p>
          </div>
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--demo-secondary, #f4f4f5)',
          }}
        />
      )}
    </div>
  );
}

function CustomMini({ widget }: { widget: CustomWidget }) {
  // Canonical custom widgets with no registered renderer emit only the
  // `.demo-widget.demo-widget-custom` wrapper (null body), so the mini
  // keeps its placeholder free of any other `demo-*` class.
  return (
    <div
      className="demo-widget demo-widget-custom"
      data-widget-id={widget.id}
      data-widget-name={widget.name}
      aria-hidden
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--demo-secondary, #f4f4f5)',
          color: 'var(--demo-fg, #0a0a0a)',
          opacity: 0.5,
          fontSize: 12,
        }}
      >
        custom: {widget.name}
      </span>
    </div>
  );
}

function WidgetMini({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'headline':
      return <HeadlineMini widget={widget} />;
    case 'form':
      return <FormMini widget={widget} />;
    case 'embed':
      return <EmbedMini widget={widget} />;
    case 'custom':
      return <CustomMini widget={widget} />;
  }
}

export function CoverPreviewMini({
  cover,
  themeId,
  themeTokens,
  themeCss,
  className,
  stageAspectRatio = '2 / 1',
  stageRatio,
  glassImageSrc,
}: CoverPreviewMiniProps) {
  const [stageW, stageH] =
    stageRatio && stageRatio.width > 0 && stageRatio.height > 0
      ? [stageRatio.width, stageRatio.height]
      : stageAspectRatio === '16 / 9'
        ? [16, 9]
        : [2, 1];
  const background = cover.background;
  const isGlass = background?.type === 'glassmorphism';
  const glassSrc = isGlass ? glassImageSrc ?? background.src : undefined;
  const backgroundImage =
    background === undefined
      ? cover.backgroundImage
      : background.type === 'image' && background.src
        ? { src: background.src, alt: background.alt }
        : isGlass && glassSrc
          ? { src: glassSrc, alt: '' }
          : undefined;
  const colorBackgroundStyle = coverBackgroundStyle(background);
  const stageBackgroundStyle = backgroundImage
    ? undefined
    : colorBackgroundStyle;
  const overlayBackgroundStyle = backgroundImage
    ? colorBackgroundStyle
    : undefined;
  const glassStyle = isGlass && backgroundImage
    ? glassBackgroundStyle(background)
    : undefined;
  const backgroundBlurStyle =
    background?.type === 'image'
      ? coverBackgroundBlurStyle(background)
      : undefined;
  return (
    <div
      className={`intro-mini-host ${className ?? ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: miniOverrides(stageW, stageH) }} />
      {themeCss ? (
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      ) : null}
      <div
        className="intro-mini-stage demo-root"
        data-demo-theme={themeId}
        style={themeStyle(themeId, themeTokens)}
      >
        <div className="demo-player">
          <div className="demo-player-shell">
            <div
              className="demo-stage demo-intro"
              data-widget-type={cover.widgets[0]?.type}
              data-has-background-image={backgroundImage ? '' : undefined}
              data-background-type={background?.type}
              data-glass={isGlass && backgroundImage ? '' : undefined}
              style={{
                ...stageBackgroundStyle,
                ...backgroundBlurStyle,
                ...glassStyle,
              }}
            >
              {backgroundImage ? (
                <img
                  className="demo-intro-background-image"
                  src={backgroundImage.src}
                  alt=""
                  aria-hidden
                />
              ) : null}
              {isGlass && backgroundImage ? (
                <div className="demo-intro-glass-overlay" aria-hidden />
              ) : null}
              {overlayBackgroundStyle ? (
                <div
                  className="demo-intro-background-overlay"
                  style={overlayBackgroundStyle}
                  aria-hidden
                />
              ) : null}
              {typeof cover.backgroundDim === 'number' &&
              cover.backgroundDim > 0 ? (
                <div
                  className="demo-intro-dim"
                  style={{ opacity: cover.backgroundDim }}
                  aria-hidden
                />
              ) : null}
              <div
                className="demo-cover-grid"
                data-widget-type={cover.widgets[0]?.type}
              >
                {cover.widgets[0] ? (
                  <WidgetMini widget={cover.widgets[0]} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
