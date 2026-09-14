export type MadeWithBadgeProps = {
  href?: string;
  label?: string;
  className?: string;
};

/**
 * Small "Built with Inkly" link parked at the player's bottom-right corner.
 * On by default; authors turn it off with `chrome.branding: false` in the
 * demo config. "Inkly" is set as the wordmark: the dot sits on the baseline
 * right before the I, 0.66em tall with a 0.08em gap (the landing page's
 * Familjen preset), in the badge's own colour so it stays a quiet mark.
 */
const DEFAULT_LABEL = 'Built with Inkly';

export function MadeWithBadge({
  href = 'https://inklyai.dev',
  label = DEFAULT_LABEL,
  className,
}: MadeWithBadgeProps = {}) {
  return (
    <a
      className={className ?? 'demo-builtwith-badge'}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
    >
      {label === DEFAULT_LABEL ? (
        <span className="demo-builtwith-badge-text">
          Built with{' '}
          <span className="demo-builtwith-badge-wordmark">
            <span className="demo-builtwith-badge-dot" aria-hidden="true" />
            Inkly
          </span>
        </span>
      ) : (
        <span className="demo-builtwith-badge-text">{label}</span>
      )}
    </a>
  );
}
