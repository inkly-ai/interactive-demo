import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useAssetUrl, useDemoPlayerContext } from '../context';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  ButtonAction,
  Cta,
  CustomWidget,
  EmbedWidget,
  FormWidget,
  HeadlineWidget,
  MessageTextAlign,
  Widget,
  WidgetImage,
} from '../schema';
import {
  DEFAULT_EMBED_ALLOW,
  DEFAULT_EMBED_SANDBOX,
} from '../schema';
import { Button } from './Button';

/**
 * Inline-only markdown — strips the `<p>` wrappers `ReactMarkdown`
 * emits by default so a one-line title doesn't end up with a
 * paragraph inside an `<h2>` (invalid HTML). Headline title /
 * description are short, single-line strings; inline rendering keeps
 * the markup semantic and the typography in the parent element's
 * hands.
 */
function InlineMarkdown({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <>{children}</>,
        a: ({ href, children, ...rest }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
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

export type HeadlineWidgetProps = {
  widget: HeadlineWidget;
  stepId: string;
};

export type FormWidgetProps = {
  widget: FormWidget;
  stepId: string;
  onSubmit: (values: Record<string, string>) => void;
};

export type EmbedWidgetProps = {
  widget: EmbedWidget;
  stepId: string;
  /**
   * Ref the renderer must attach to its iframe. The default
   * `<Widgets />` slot listens for `window.message` events whose source
   * matches `iframeRef.current.contentWindow` and emits an
   * `'embed_message'` runtime event. Custom embed renderers can ignore
   * this if they don't want postMessage relay.
   */
  iframeRef?: React.Ref<HTMLIFrameElement>;
};

export type CustomWidgetProps = {
  widget: CustomWidget;
  stepId: string;
};

/**
 * Component override map for `<Demo.Widgets />` / `<Demo.Stage />`.
 * `'widget.<type>'` swaps the default renderer for a built-in widget.
 * `'widget.custom.<name>'` registers a renderer for a `custom` widget
 * with that `name` — agents can declare custom widgets in JSON, but the
 * host has to ship the component, which is the right friction.
 */
export type WidgetComponents = {
  'widget.headline'?: ComponentType<HeadlineWidgetProps>;
  'widget.form'?: ComponentType<FormWidgetProps>;
  'widget.embed'?: ComponentType<EmbedWidgetProps>;
} & {
  [K in `widget.custom.${string}`]?: ComponentType<CustomWidgetProps>;
};

export type WidgetsProps = {
  components?: WidgetComponents;
  className?: string;
};

/**
 * Cover-step widget host. Reads the active step from context and renders
 * its single widget. Returns `null` when the active step isn't a cover or
 * has no widget.
 *
 * The outer `<div className="demo-cover-grid">` carries
 * `data-widget-type` so theme CSS can special-case layouts (e.g. make an
 * `embed` widget full-bleed) without touching JS.
 */
export function Widgets({ components, className }: WidgetsProps) {
  const { demo, state } = useDemoPlayerContext();
  const step = demo?.steps[state.currentStepIndex];
  if (!step || step.kind !== 'cover') return null;
  const widget = step.widgets?.[0];
  if (!widget) return null;

  return (
    <div
      className={className ?? 'demo-cover-grid'}
      data-widget-type={widget.type}
    >
      <WidgetSlot
        widget={widget}
        stepId={step.id}
        components={components}
      />
    </div>
  );
}

function WidgetSlot({
  widget,
  stepId,
  components,
}: {
  widget: Widget;
  stepId: string;
  components?: WidgetComponents;
}) {
  const { controls, demo, emitEvent } = useDemoPlayerContext();

  let body: ReactNode = null;

  switch (widget.type) {
    case 'headline': {
      const Renderer =
        components?.['widget.headline'] ?? DefaultHeadlineWidget;
      body = <Renderer widget={widget} stepId={stepId} />;
      break;
    }
    case 'form': {
      const Renderer = components?.['widget.form'] ?? DefaultFormWidget;
      body = (
        <Renderer
          widget={widget}
          stepId={stepId}
          onSubmit={(values) => {
            // Carry each field's author-facing label alongside its value so
            // analytics stores "Email" not the opaque field id — the config
            // (and thus the label) is only reliably available here, at the
            // producer. Order follows the authored field order.
            emitEvent({
              type: 'form_submit',
              stepId,
              widgetId: widget.id,
              fields: widget.fields.map((field) => ({
                id: field.id,
                label: field.label,
                value: values[field.id] ?? '',
              })),
            });
            runButtonAction(widget.submit.action, controls, demo);
          }}
        />
      );
      break;
    }
    case 'embed': {
      const Renderer = components?.['widget.embed'] ?? DefaultEmbedWidget;
      body = (
        <EmbedSlot widget={widget} stepId={stepId} Renderer={Renderer} />
      );
      break;
    }
    case 'custom': {
      const Renderer = components?.[`widget.custom.${widget.name}`];
      // Custom widgets without a matching renderer fall through to
      // nothing — the package can't know the shape of `data`. Warn in
      // dev so authors notice missing host wiring without having to
      // dig into "why isn't my widget rendering".
      if (!Renderer && typeof console !== 'undefined') {
        console.warn(
          `[interactive-demo] No renderer registered for custom widget "${widget.name}" (id: ${widget.id}). ` +
            `Register one via <Demo components={{ "widget.custom.${widget.name}": MyComponent }} />.`,
        );
      }
      body = Renderer ? (
        <Renderer widget={widget} stepId={stepId} />
      ) : null;
      break;
    }
  }

  return (
    <div
      className={`demo-widget demo-widget-${widget.type}`}
      data-widget-id={widget.id}
      data-widget-name={widget.type === 'custom' ? widget.name : undefined}
    >
      {body}
    </div>
  );
}

/**
 * Optional positioned image embedded in a headline / form widget
 * (replaces the old standalone media widget). The `src` resolves through
 * the host asset resolver just like the widget logo.
 */
function WidgetImageFrame({ image }: { image: WidgetImage }) {
  const src = useAssetUrl(image.src);
  if (!src) return null;
  const hasNaturalSize =
    typeof image.naturalWidth === 'number' &&
    typeof image.naturalHeight === 'number';
  return (
    <div
      className="demo-widget-image-frame"
      data-layout={image.layout}
      style={
        // Hero fills its cover half and bleeds off the player edge, so an
        // aspect-ratio on the frame would fight that — only standard
        // (contained) frames take the natural aspect hint.
        image.layout !== 'hero' && hasNaturalSize
          ? {
              aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}`,
            }
          : undefined
      }
    >
      <img
        className="demo-widget-image"
        src={src}
        alt={image.alt ?? ''}
        width={image.naturalWidth}
        height={image.naturalHeight}
      />
    </div>
  );
}

/**
 * Wraps a widget's copy + optional image in a split container. With no
 * image the copy renders bare; with one, the copy and image sit in a
 * flex row/column whose arrangement is driven by `data-image-position`.
 */
function WidgetWithImage({
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
      <WidgetImageFrame image={image} />
    </div>
  );
}

function DefaultHeadlineWidget({ widget }: HeadlineWidgetProps) {
  // Emits the legacy `.demo-intro-*` class names inside the cell so
  // existing theme CSS (which targets `.demo-intro-title`, etc.) keeps
  // working without a sweep across every theme file. Title and
  // description run through the inline-markdown renderer so authors
  // can italicize accent words (`*foo*`) or add light formatting
  // without escaping into JSX.
  const alignStyle = headlineAlignmentStyle(widget.textAlign);
  // Resolve the logo URI through the host asset resolver so an
  // `asset:<id>` ref resolves the same way media backgrounds do in `Stage`.
  const logoSrc = useAssetUrl(widget.logo?.src);
  return (
    <WidgetWithImage image={widget.image}>
    <div
      className="demo-intro-content"
      data-text-align={widget.textAlign}
      style={alignStyle}
    >
      {widget.logo && logoSrc ? (
        <img
          className="demo-intro-logo"
          src={logoSrc}
          alt={widget.logo.alt ?? ''}
          style={
            widget.logo.height ? { height: widget.logo.height } : undefined
          }
        />
      ) : null}
      <h2
        className="demo-intro-title"
        style={widget.titleColor ? { color: widget.titleColor } : undefined}
      >
        <InlineMarkdown text={widget.title} />
      </h2>
      {widget.description ? (
        <p
          className="demo-intro-description"
          style={
            widget.descriptionColor
              ? { color: widget.descriptionColor }
              : undefined
          }
        >
          <InlineMarkdown text={widget.description} />
        </p>
      ) : null}
      {widget.cta || widget.secondaryCta ? (
        <div className="demo-intro-actions">
          {widget.cta ? (
            <Button
              action={widget.cta.action}
              label={widget.cta.label}
              variant={widget.cta.animation}
              className="demo-intro-cta"
              style={ctaStyle(widget.cta)}
              eventSource={{ widgetId: widget.id }}
            />
          ) : null}
          {widget.secondaryCta ? (
            <Button
              action={widget.secondaryCta.action}
              label={widget.secondaryCta.label}
              variant={widget.secondaryCta.animation}
              className="demo-intro-cta"
              style={ctaStyle(widget.secondaryCta)}
              eventSource={{ widgetId: widget.id }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
    </WidgetWithImage>
  );
}

function DefaultFormWidget({ widget, onSubmit }: FormWidgetProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  // Resolve the logo URI through the host asset resolver so an
  // `asset:<id>` ref resolves the same way the headline logo does.
  const logoSrc = useAssetUrl(widget.logo?.src);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const snapshot: Record<string, string> = {};
      for (const field of widget.fields) {
        snapshot[field.id] = values[field.id] ?? '';
      }
      onSubmit(snapshot);
    },
    [onSubmit, values, widget.fields],
  );

  return (
    <WidgetWithImage image={widget.image}>
    <div className="demo-widget-form-content">
      {widget.logo && logoSrc ? (
        <img
          className="demo-widget-logo"
          src={logoSrc}
          alt={widget.logo.alt ?? ''}
          style={
            widget.logo.height ? { height: widget.logo.height } : undefined
          }
        />
      ) : null}
      {widget.title ? (
        <h3 className="demo-widget-title">{widget.title}</h3>
      ) : null}
      {widget.description ? (
        <p className="demo-widget-description">{widget.description}</p>
      ) : null}
      <form className="demo-widget-form-body" onSubmit={handleSubmit}>
        {widget.fields.map((field) => {
          // Fall back to the field label as placeholder so authors get
          // a non-empty hint by default — matches the convention the
          // editor exposes in the form-fields inspector.
          const placeholder = field.placeholder ?? field.label;
          return (
            <label key={field.id} className="demo-widget-field">
              {field.type === 'dropdown' ? (
                <select
                  className="demo-widget-field-input"
                  aria-label={field.label}
                  required={field.required}
                  value={values[field.id] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                >
                  <option value="" disabled>
                    {placeholder}
                  </option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="demo-widget-field-input"
                  type="text"
                  aria-label={field.label}
                  required={field.required}
                  placeholder={placeholder}
                  value={values[field.id] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                />
              )}
            </label>
          );
        })}
        <button
          type="submit"
          className={[
            'demo-button',
            'demo-widget-submit',
            'cursor-pointer',
            widget.submit.animation === 'shimmer' ? 'demo-button-shimmer' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={ctaStyle(widget.submit)}
        >
          {widget.submit.animation === 'shimmer' ? (
            <span aria-hidden className="demo-button-shimmer-fx" />
          ) : null}
          <span className="demo-button-label">{widget.submit.label}</span>
        </button>
      </form>
    </div>
    </WidgetWithImage>
  );
}

/**
 * Dispatches a `ButtonAction` against the player controls. Same
 * destination model as `<Button>` — kept inline so the form submit
 * path doesn't have to re-render through `<Button>` (which would
 * suppress the native form submit event).
 */
function runButtonAction(
  action: ButtonAction,
  controls: ReturnType<typeof useDemoPlayerContext>['controls'],
  demo: ReturnType<typeof useDemoPlayerContext>['demo'],
): void {
  switch (action.type) {
    case 'next':
      controls.next();
      return;
    case 'prev':
      controls.prev();
      return;
    case 'restart':
      controls.restart();
      return;
    case 'step': {
      const exists = demo?.steps.some((s) => s.id === action.stepId);
      if (!exists) {
        if (typeof console !== 'undefined') {
          console.warn(
            `[interactive-demo] Form submit action targets unknown step "${action.stepId}".`,
          );
        }
        return;
      }
      controls.seekToStep(action.stepId);
      return;
    }
    case 'chapter': {
      const exists = demo?.chapters.some((c) => c.id === action.chapterId);
      if (!exists) {
        if (typeof console !== 'undefined') {
          console.warn(
            `[interactive-demo] Form submit action targets unknown chapter "${action.chapterId}".`,
          );
        }
        return;
      }
      controls.seekToChapter(action.chapterId);
      return;
    }
    case 'url': {
      if (typeof window === 'undefined') return;
      const target = action.target ?? '_blank';
      window.open(
        action.href,
        target,
        target === '_blank' ? 'noopener,noreferrer' : undefined,
      );
      return;
    }
  }
}

/**
 * Wires an iframe ref + a `window.message` listener so postMessage
 * traffic from the embed gets relayed to the host as an `embed_message`
 * runtime event. Custom renderers that
 * accept the `iframeRef` prop get the relay for free; ones that ignore
 * it get nothing (which is fine — they can dispatch directly).
 */
function EmbedSlot({
  widget,
  stepId,
  Renderer,
}: {
  widget: EmbedWidget;
  stepId: string;
  Renderer: ComponentType<EmbedWidgetProps>;
}) {
  const { emitEvent } = useDemoPlayerContext();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      emitEvent({
        type: 'embed_message',
        stepId,
        widgetId: widget.id,
        data: event.data,
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [emitEvent, stepId, widget.id]);

  return <Renderer widget={widget} stepId={stepId} iframeRef={iframeRef} />;
}

function DefaultEmbedWidget({ widget, iframeRef }: EmbedWidgetProps) {
  const sandbox =
    !widget.sandbox || widget.sandbox === 'allow-scripts'
      ? DEFAULT_EMBED_SANDBOX
      : widget.sandbox;
  const allow = widget.allow || DEFAULT_EMBED_ALLOW;

  // Empty `src` (a freshly added embed) renders a centered empty state
  // prompting the author to add a URL, rather than a blank iframe.
  if (!widget.src.trim()) {
    return <EmbedEmptyState />;
  }

  // Full-bleed: the iframe fills the cover, edge to edge. No title /
  // subtitle chrome and no aspect-ratio box — `.demo-widget-embed` is
  // stretched to cover the player by the package stylesheet.
  return (
    <iframe
      ref={iframeRef}
      className="demo-widget-embed-frame"
      src={widget.src}
      title={widget.iframeTitle ?? 'Embedded content'}
      sandbox={sandbox}
      allow={allow}
      loading="lazy"
    />
  );
}

/**
 * Placeholder shown when an embed widget has no `src` yet. Keeps the
 * full-bleed surface from reading as broken while the author wires up a
 * calendar / form / app URL.
 */
function EmbedEmptyState() {
  return (
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
  );
}
