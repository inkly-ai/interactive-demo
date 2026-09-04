import { type ReactNode } from 'react';
import { useDemoPlayerContext } from '../context';

export type HeaderProps = {
  /**
   * Replace the left-side cluster (the macOS-style traffic lights by
   * default). Pass `null` to drop it entirely.
   */
  leading?: ReactNode;
  /**
   * Override the centered title. Defaults to the demo's `title`.
   */
  title?: ReactNode;
  className?: string;
};

function TrafficLights() {
  return (
    <div className="demo-header-lights" aria-hidden>
      <span className="demo-header-light" data-color="red" />
      <span className="demo-header-light" data-color="yellow" />
      <span className="demo-header-light" data-color="green" />
    </div>
  );
}

export function Header({
  leading,
  title,
  className,
}: HeaderProps = {}) {
  const { demo } = useDemoPlayerContext();
  // Header brand: wordmark text and click target, injected by the host onto
  // `demo.theme.brand` before render. Player chrome never renders brand CTAs;
  // calls to action belong on the host page or in cover widgets.
  const brand = demo?.theme?.brand;
  // The `title` prop still wins so host slots can override; otherwise
  // fall back to the brand wordmark, then the demo title.
  const resolvedName = title ?? brand?.name ?? demo?.title ?? '';

  // Inner pill content is shared by the static and linked variants.
  const pillContent = (
    <>
      <span className="demo-header-title-icon" aria-hidden />
      <span className="demo-header-title-text">{resolvedName}</span>
    </>
  );

  return (
    <div className={className ?? 'demo-header'}>
      <div className="demo-header-leading">
        {leading === undefined ? <TrafficLights /> : leading}
      </div>
      {brand?.logoHref ? (
        <a
          className="demo-header-title-pill"
          href={brand.logoHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {pillContent}
        </a>
      ) : (
        <div className="demo-header-title-pill">{pillContent}</div>
      )}
      <div className="demo-header-actions" aria-hidden />
    </div>
  );
}
