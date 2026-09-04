import { RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
