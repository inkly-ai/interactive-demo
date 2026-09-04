import type { CSSProperties, ReactNode } from 'react';
import { useDemoPlayerContext } from '../context';
import type { ButtonAction, ButtonAnimation } from '../schema';

export type ButtonProps = {
  /** Where the button takes the viewer. */
  action: ButtonAction;
  /** Visible label. May be a string or arbitrary node (icon + text). */
  label: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Optional aria-label override. Defaults to the string form of
   * `label` when omitted, falls back to undefined otherwise.
   */
  ariaLabel?: string;
  /**
   * Optional animation variant. `shimmer` sweeps a highlight across
   * the button.
   */
  variant?: ButtonAnimation;
  /** Optional event source metadata for the runtime `cta_click` event. */
  eventSource?: {
    widgetId?: string;
    annotationId?: string;
  };
};

function variantClassName(variant?: ButtonAnimation): string {
  if (!variant || variant === 'none') return '';
  return `demo-button-${variant}`;
}

/**
 * Renders an authored button whose destination is configured at the
 * data layer. `url` actions render as `<a>`; navigation actions
 * (`next`/`prev`/`step`/`restart`) render as `<button>` and dispatch
 * through the player controls.
 *
 * Exposed as `Demo.Button` so custom widget renderers can reuse the
 * same destination model without re-wiring `useDemoPlayerContext`.
 *
 * Step targets that don't resolve no-op silently and warn in dev — the
 * package can't fail a render over a stale id, and the host editor is
 * responsible for surfacing missing references at design time.
 */
export function Button({
  action,
  label,
  className,
  style,
  ariaLabel,
  variant,
  eventSource,
}: ButtonProps) {
  const { controls, demo, emitEvent, state } = useDemoPlayerContext();

  const composedClassName = [
    'demo-button',
    'cursor-pointer',
    variantClassName(variant),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const renderInner = () => (
    <>
      {variant === 'shimmer' ? (
        <span aria-hidden className="demo-button-shimmer-fx" />
      ) : null}
      <span className="demo-button-label">{label}</span>
    </>
  );

  if (action.type === 'url') {
    const target = action.target ?? '_blank';
    return (
      <a
        href={action.href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        className={composedClassName}
        style={style}
        aria-label={ariaLabel}
        onClick={() => {
          emitEvent({
            type: 'cta_click',
            stepId: state.currentStepId,
            widgetId: eventSource?.widgetId,
            annotationId: eventSource?.annotationId,
            action,
          });
        }}
      >
        {renderInner()}
      </a>
    );
  }

  const onClick = () => {
    emitEvent({
      type: 'cta_click',
      stepId: state.currentStepId,
      widgetId: eventSource?.widgetId,
      annotationId: eventSource?.annotationId,
      action,
    });

    switch (action.type) {
      case 'next':
        controls.next();
        break;
      case 'prev':
        controls.prev();
        break;
      case 'restart':
        controls.restart();
        break;
      case 'step': {
        const exists = demo?.steps.some((s) => s.id === action.stepId);
        if (!exists) {
          if (typeof console !== 'undefined') {
            console.warn(
              `[interactive-demo] Button action targets unknown step "${action.stepId}".`,
            );
          }
          return;
        }
        controls.seekToStep(action.stepId);
        break;
      }
      case 'chapter': {
        const exists = demo?.chapters.some((c) => c.id === action.chapterId);
        if (!exists) {
          if (typeof console !== 'undefined') {
            console.warn(
              `[interactive-demo] Button action targets unknown chapter "${action.chapterId}".`,
            );
          }
          return;
        }
        controls.seekToChapter(action.chapterId);
        break;
      }
    }
  };

  return (
    <button
      type="button"
      className={composedClassName}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {renderInner()}
    </button>
  );
}
