/**
 * The Inkly lockup: the dot mark sitting on the baseline right before the
 * wordmark, 0.66em tall with a 0.08em gap.
 *
 * Same geometry as the player's "Built with Inkly" badge
 * ({@link ../../../runtime/src/primitives/MadeWithBadge.tsx}) — the landing
 * page's Familjen preset — so the editor chrome and the player's corner mark
 * read as the same logo. The dot is `currentColor`, so the lockup takes the
 * colour of whatever it sits in. The landing page reveals a WebGL orb inside
 * the dot on hover; the badge already leaves that out, and so does this.
 *
 * 22px is the canonical size for app chrome — what the sidebar renders at in
 * the surface this lockup comes from. The dot and gap are em-based, so the
 * whole mark scales with it.
 */
const CHROME_SIZE = 22;

export function InklyLogo({
    size = CHROME_SIZE,
    className,
}: {
    /** Wordmark size in px. The dot and its gap follow it. */
    size?: number;
    className?: string;
}) {
    return (
        <a
            className={
                "inline-flex shrink-0 items-baseline font-bold tracking-[-0.02em] " +
                "text-foreground no-underline transition-opacity hover:opacity-70 " +
                (className ?? "")
            }
            style={{ fontSize: `${size}px`, lineHeight: 1 }}
            href="https://inklyai.dev"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Inkly"
        >
            <span
                aria-hidden
                className="mr-[0.08em] inline-block size-[0.66em] shrink-0 rounded-full bg-current"
            />
            Inkly
        </a>
    );
}
