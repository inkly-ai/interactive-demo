import { type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SaveBadge({
    hasUnsavedChanges,
    status,
}: {
    hasUnsavedChanges?: boolean;
    status: "idle" | "saving" | "saved" | "error";
}) {
    if (status === "saving") {
        return (
            <Badge variant="secondary" className="gap-1.5 text-[11px]">
                <RefreshCwIcon className="size-3 animate-spin" />
                Saving
            </Badge>
        );
    }

    if (hasUnsavedChanges && status !== "error") {
        return (
            <Badge
                variant="outline"
                className="gap-1.5 border-[color:color-mix(in_oklab,var(--accent)_24%,var(--line))] bg-[color:color-mix(in_oklab,var(--accent)_6%,var(--surface))] text-[11px] text-[color:var(--ink-2)]"
            >
                <RefreshCwIcon className="size-3 animate-pulse text-[color:var(--accent-ink)]" />
                Unsaved changes
            </Badge>
        );
    }

    if (status === "idle") return null;
    const map = {
        saved: { text: "Saved", variant: "outline" as const },
        error: { text: "Save failed", variant: "destructive" as const },
    };
    const { text, variant } = map[status];
    return (
        <Badge
            variant={variant}
            className={cn("text-[11px]", status === "error" && "gap-1.5")}
        >
            {text}
        </Badge>
    );
}

/* ── Share dialog pieces (from the original preview client) ─────────── */

export function ShareNavItem({
    active,
    onClick,
    label,
    trailing,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    trailing?: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "relative flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-[background,box-shadow,border-color,color] duration-150 " +
                (active
                    ? "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-strong)] shadow-[var(--shadow-lift)]"
                    : "border-transparent text-[color:var(--ink-2)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink-strong)]")
            }
        >
            <span className="flex-1 truncate">{label}</span>
            {trailing}
        </button>
    );
}

export function ShareRailHeader() {
    return (
        <div className="relative flex items-center gap-2.5 px-1.5 pb-3">
            <div className="text-[13px] font-semibold leading-tight text-[color:var(--ink-strong)] tracking-[-0.1px]">
                Share demo
            </div>
            <DottedDivider className="absolute inset-x-0 bottom-0" />
        </div>
    );
}

export function DottedDivider({ className = "" }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={
                "block h-px bg-[repeating-linear-gradient(to_right,var(--line-soft)_0_1px,transparent_1px_5px)] " +
                className
            }
        />
    );
}

export function PaneHead({
    title,
    description,
}: {
    title: string;
    description?: string;
}) {
    return (
        <div className="pr-9">
            <h3 className="text-[20px] font-semibold leading-[1.15] tracking-[-0.2px] text-[color:var(--ink-strong)]">
                {title}
            </h3>
            {description ? (
                <p className="mt-1 max-w-[60ch] text-[13px] text-muted-foreground">
                    {description}
                </p>
            ) : null}
        </div>
    );
}

export function PaneFoot({ children }: { children: ReactNode }) {
    return (
        <div className="mt-auto flex items-center gap-2 border-t border-dashed border-[color:var(--line-soft)] pt-3.5">
            <span className="flex-1" />
            {children}
        </div>
    );
}

/** A code snippet with an optional Copy button. Plain text: no highlighter is bundled. */
export function CodeCard({
    lang,
    value,
    copied,
    onCopy,
}: {
    lang: string;
    value: string;
    copied?: boolean;
    onCopy?: () => void;
}) {
    return (
        <div
            data-lang={lang}
            className="relative w-full min-w-0 self-stretch overflow-hidden rounded-[11px] border border-[color:var(--line)] bg-[color:var(--surface-2)] shadow-[var(--shadow-lift)]"
        >
            {onCopy ? (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={onCopy}
                    className="absolute right-2 top-2 z-10 h-[26px] gap-1.5 px-2.5 text-[11.5px]"
                >
                    {copied ? "Copied" : "Copy"}
                </Button>
            ) : null}
            <pre className="min-w-0 whitespace-pre-wrap break-all p-3.5 pr-20 font-mono text-[12px] leading-[1.65] text-[color:var(--ink-strong)]">
                <code>{value}</code>
            </pre>
        </div>
    );
}

export function InputWithAction({
    value,
    copied,
    onCopy,
    onChange,
    placeholder,
}: {
    value: string;
    copied: boolean;
    onCopy: () => void;
    /** When given, the field is editable instead of read-only. */
    onChange?: (next: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="flex items-center overflow-hidden rounded-[9px] border border-[color:var(--line)] bg-[color:var(--surface-2)] shadow-[var(--shadow-press)]">
            <input
                readOnly={!onChange}
                value={value}
                onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                placeholder={placeholder}
                onFocus={(e) => e.currentTarget.select()}
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[12px] text-[color:var(--ink-strong)] outline-none"
            />
            <button
                type="button"
                onClick={onCopy}
                className="h-8 shrink-0 cursor-pointer border-l border-[color:var(--line)] bg-transparent px-3 text-[12px] font-medium text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sidebar)] hover:text-[color:var(--ink-strong)]"
            >
                {copied ? "Copied" : "Copy"}
            </button>
        </div>
    );
}

/** Dims its children behind a dashed panel carrying one line of explanation. */
export function LockedSurface({
    children,
    message,
}: {
    children: ReactNode;
    message: string;
}) {
    return (
        <div className="relative min-w-0">
            <div className="min-w-0 opacity-45">{children}</div>
            <div className="absolute inset-0 z-20 grid place-items-center rounded-[12px] border border-dashed border-[color:var(--line)] bg-[color:color-mix(in_oklab,var(--surface)_84%,transparent)] px-4 text-center backdrop-blur-[2px]">
                <span className="max-w-[28ch] text-[12.5px] font-semibold text-[color:var(--ink-strong)]">
                    {message}
                </span>
            </div>
        </div>
    );
}
