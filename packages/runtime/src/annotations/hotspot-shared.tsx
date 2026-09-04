import type { CSSProperties, MouseEvent } from 'react';
import { useDemoPlayerContext } from '../context';
import { ChevronLeftIcon, ChevronRightIcon } from '../primitives/icons';
import type {
  HotspotAnchor,
  HotspotNavButton,
  MessageTextAlign,
} from '../schema';
import { Markdown } from '../utils/markdown';

type HotspotAppearance = {
  background?: string;
  textColor?: string;
  borderRadius?: string;
  textAlign?: MessageTextAlign;
  anchor?: HotspotAnchor;
  showNavigation?: boolean;
  prevButton?: HotspotNavButton;
  nextButton?: HotspotNavButton;
};

export function buildHotspotStyle(
  appearance: HotspotAppearance,
  extra?: CSSProperties,
): CSSProperties {
  const style: Record<string, string | number> = {};

  if (appearance.background) {
    style['--hotspot-bg'] = appearance.background;
    if (isMixableCssColor(appearance.background)) {
      style['--hotspot-accent'] = appearance.background;
    }
  }
  if (appearance.textColor) {
    style['--hotspot-fg'] = appearance.textColor;
  }
  if (appearance.borderRadius) {
    style['--hotspot-radius'] = appearance.borderRadius;
  }
  if (appearance.textAlign) {
    style['--hotspot-text-align'] =
      appearance.textAlign === 'middle' ? 'center' : appearance.textAlign;
  }

  return { ...(extra ?? {}), ...style } as CSSProperties;
}

function isMixableCssColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized.includes('gradient(') && !normalized.startsWith('url(');
}

export function hotspotClassNames(
  appearance: HotspotAppearance,
  base: string,
): string {
  const anchor = appearance.anchor ?? 'auto';
  return `${base} demo-hotspot-anchor-${anchor}`;
}

type HotspotNavigationFooterProps = {
  prevButton?: HotspotNavButton;
  nextButton?: HotspotNavButton;
};

export function HotspotNavigationFooter({
  prevButton,
  nextButton,
}: HotspotNavigationFooterProps = {}) {
  const { demo, state, controls } = useDemoPlayerContext();
  const totalSteps = demo?.steps.length ?? 0;

  if (totalSteps === 0) {
    return null;
  }

  const stepNumber = state.currentStepIndex + 1;
  const canGoBack = state.currentStepIndex > 0;
  const canGoForward = state.currentStepIndex < totalSteps - 1;
  const showPrev = !prevButton?.hidden;
  const showNext = !nextButton?.hidden;

  const handleNavClick = (
    event: MouseEvent<HTMLButtonElement>,
    handler: () => void,
  ) => {
    event.stopPropagation();
    handler();
  };

  const prevLabel = prevButton?.label;
  const nextLabel = nextButton?.label;

  return (
    <div className="demo-callout-footer">
      <span className="demo-callout-step">
        {stepNumber} of {totalSteps}
      </span>
      <div className="demo-callout-nav">
        {showPrev ? (
          <button
            type="button"
            className={
              prevLabel
                ? 'demo-callout-nav-button demo-callout-nav-button-text cursor-pointer'
                : 'demo-callout-nav-button cursor-pointer'
            }
            aria-label="Previous step"
            disabled={!canGoBack}
            onClick={(event) => handleNavClick(event, controls.prev)}
          >
            {prevLabel ? (
              prevLabel
            ) : (
              <ChevronLeftIcon className="demo-icon" />
            )}
          </button>
        ) : null}
        {showNext ? (
          <button
            type="button"
            className={
              nextLabel
                ? 'demo-callout-nav-button demo-callout-nav-button-text cursor-pointer'
                : 'demo-callout-nav-button cursor-pointer'
            }
            aria-label="Next step"
            disabled={!canGoForward}
            onClick={(event) => handleNavClick(event, controls.next)}
          >
            {nextLabel ? (
              nextLabel
            ) : (
              <ChevronRightIcon className="demo-icon" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type HotspotMessageCardProps = {
  text?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  showNavigation?: boolean;
  prevButton?: HotspotNavButton;
  nextButton?: HotspotNavButton;
  onActivate: () => void;
};

export function HotspotMessageCard({
  text,
  className,
  style,
  ariaLabel,
  showNavigation = true,
  prevButton,
  nextButton,
  onActivate,
}: HotspotMessageCardProps) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onActivate();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={[className, 'cursor-pointer'].filter(Boolean).join(' ')}
      style={style}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {text ? (
        <div className="demo-callout-body">
          <Markdown text={text} />
        </div>
      ) : null}
      {showNavigation ? (
        <HotspotNavigationFooter
          prevButton={prevButton}
          nextButton={nextButton}
        />
      ) : null}
    </div>
  );
}

export type { HotspotAppearance };
