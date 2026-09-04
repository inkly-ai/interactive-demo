export function ToolbarCountPill({
    count,
}: {
    count: number;
}) {
    if (count <= 0) return null;

    return (
        <span
            aria-hidden
            className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-semibold leading-none text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] ring-2 ring-[color:var(--surface)]"
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}
