export type MadeWithBadgeProps = {
  href?: string;
  label?: string;
  className?: string;
};

/**
 * Small "Built with Inkly" link parked at the player's bottom-right corner.
 * On by default; authors turn it off with `chrome.branding: false` in the
 * demo config. The dot before the text is the Inkly wordmark's dot, drawn
 * in the badge's own colour so it stays a quiet watermark and never reads
 * as a logo over the author's product.
 */
export function MadeWithBadge({
  href = 'https://inklyai.dev',
  label = 'Built with Inkly',
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
      <span className="demo-builtwith-badge-dot" aria-hidden="true" />
      <span className="demo-builtwith-badge-text">{label}</span>
    </a>
  );
}
