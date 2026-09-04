export type MadeWithBadgeProps = {
  href?: string;
  label?: string;
  className?: string;
};

/**
 * Small "made with" link parked at the player's bottom-right corner. On by
 * default; authors turn it off with `chrome.branding: false` in the demo
 * config. Text only, no mark — it must never read as a logo over the
 * author's product.
 */
export function MadeWithBadge({
  href = 'https://github.com/inkly-ai/interactive-demo',
  label = 'Made with interactive-demo',
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
      <span className="demo-builtwith-badge-text">{label}</span>
    </a>
  );
}
