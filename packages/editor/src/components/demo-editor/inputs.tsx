import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── design-language atoms ─────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <div className="my-3 flex w-full items-center gap-2 text-muted-foreground">
            <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
            <span className="shrink-0 px-1 text-[10.5px] font-semibold uppercase tracking-[0.4px]">
                {children}
            </span>
            <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
        </div>
    );
}

export function Field({
    label,
    children,
    inline,
    asLabel = true,
}: {
    label: string;
    children: ReactNode;
    inline?: boolean;
    asLabel?: boolean;
}) {
    const className = cn(
        "mb-2.5 flex gap-1 text-[12px]",
        inline ? "items-center justify-between" : "flex-col",
    );
    const labelText = (
        <span
            className={cn(
                "font-medium text-[color:var(--ink-2)]",
                inline ? "" : "text-[11.5px]",
            )}
        >
            {label}
        </span>
    );

    if (!asLabel) {
        return (
            <div className={className}>
                {labelText}
                {children}
            </div>
        );
    }

    return (
        <label className={className}>
            {labelText}
            {children}
        </label>
    );
}

export const fieldClass =
    "h-8 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[12.5px] text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]";

export function TextInput({
    value,
    onChange,
    placeholder,
    type = "text",
}: {
    value: string | undefined;
    onChange: (next: string) => void;
    placeholder?: string;
    type?: "text" | "color";
}) {
    if (type === "color") {
        return (
            <input
                type="color"
                value={value ?? "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 w-full cursor-pointer rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1 shadow-[var(--shadow-press)] outline-none focus:border-[color:var(--accent)]"
            />
        );
    }
    return (
        <Input
            value={value ?? ""}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={fieldClass}
        />
    );
}

export function NumberInput({
    value,
    onChange,
    step = 0.01,
    min,
    max,
}: {
    value: number | undefined;
    onChange: (next: number) => void;
    step?: number;
    min?: number;
    max?: number;
}) {
    return (
        <Input
            type="number"
            value={value ?? ""}
            step={step}
            min={min}
            max={max}
            onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) onChange(next);
            }}
            className={fieldClass}
        />
    );
}

export function SliderInput({
    value,
    onChange,
    step = 1,
    min = 0,
    max = 100,
    valueLabel,
}: {
    value: number | undefined;
    onChange: (next: number) => void;
    step?: number;
    min?: number;
    max?: number;
    valueLabel?: (value: number) => string;
}) {
    const current = Math.min(max, Math.max(min, value ?? min));

    return (
        <div className="flex min-w-0 items-center gap-3">
            <input
                type="range"
                value={current}
                step={step}
                min={min}
                max={max}
                onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) onChange(next);
                }}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[color:var(--accent)]"
            />
            <span className="w-8 shrink-0 text-right font-mono text-[12px] tabular-nums text-[color:var(--ink-2)]">
                {valueLabel ? valueLabel(current) : current}
            </span>
        </div>
    );
}

export function Choice<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (next: T) => void;
    options: ReadonlyArray<T>;
}) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
            <SelectTrigger
                className={cn(
                    "w-full border-[color:var(--line)] bg-[color:var(--surface-2)] text-[12.5px] shadow-[var(--shadow-press)]",
                )}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                        {opt}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 text-[12px] text-[color:var(--ink-2)]"
        >
            <span className="text-left">{label}</span>
            <span
                className={cn(
                    "relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors",
                    checked
                        ? "border-[color:var(--accent-ink)] bg-[color:var(--accent)]"
                        : "border-[color:var(--line-strong)] bg-[color:var(--surface-2)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]",
                )}
            >
                <span
                    className={cn(
                        "absolute top-[1px] left-[1px] h-4 w-4 rounded-full border border-[color:var(--line)] bg-white shadow-sm transition-transform",
                        checked ? "translate-x-4" : "translate-x-0",
                    )}
                />
            </span>
        </button>
    );
}

/**
 * Compact color input — a swatch + hex value pair. The real color
 * input is stretched over the visible row with zero opacity. Keeping
 * it in-place matters: browser-native color panels anchor to the
 * input's layout box, so an sr-only input can make the panel appear
 * in a viewport corner instead of next to the control.
 */
export function ColorSwatchInput({
    value,
    fallback,
    onChange,
}: {
    value: string | undefined;
    /** Used for the swatch + displayed hex when `value` is unset. */
    fallback: string;
    onChange: (next: string) => void;
}) {
    const effective = value ?? fallback;
    const normalizedEffective = effective.toLowerCase();
    return (
        <div className="relative flex h-8 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] pr-2 shadow-[var(--shadow-press)] transition-colors focus-within:border-[color:var(--accent)] focus-within:bg-[color:var(--surface)]">
            <span
                aria-hidden
                className="h-full w-8 shrink-0 border-r border-[color:var(--line)]"
                style={{ backgroundColor: effective }}
            />
            <span className="pointer-events-none flex-1 truncate font-mono text-[12.5px] uppercase text-[color:var(--ink-strong)]">
                {effective.toUpperCase()}
            </span>
            <input
                type="color"
                aria-label="Pick color"
                value={normalizedEffective}
                onChange={(e) => {
                    const next = e.target.value.toLowerCase();
                    if (next === normalizedEffective) return;
                    onChange(next);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
        </div>
    );
}
