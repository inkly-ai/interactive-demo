import {
    CodeIcon,
    FormInputIcon,
    HelpCircleIcon,
    TypeIcon,
} from "lucide-react";
import {
    DEFAULT_EMBED_ALLOW,
    DEFAULT_EMBED_SANDBOX,
    type Annotation,
    type HeadlineWidget,
    type Message,
    type MessageVariant,
    type Step,
    type Widget,
    type WidgetImage,
} from "@inkly-org/interactive-demo";
import type { AssetMeta } from "@/lib/assets";
import { findAssetReferenceEntry } from "@/lib/assets/resolve";
import {
    BORDER_RADIUS_PRESETS,
    type AddKind,
    type CoverWidgetKind,
} from "./constants";

export function borderRadiusKey(value: string | undefined): string {
    const match = BORDER_RADIUS_PRESETS.find(
        (p) => (p.value ?? "") === (value ?? ""),
    );
    if (match) return match.key;
    return "medium";
}

export function generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeMessage(variant: MessageVariant): Message {
    const id = generateId("msg");
    const base = {
        id,
        type: "message" as const,
        advancesStep: true,
        anchor: "auto" as const,
        textAlign: "left" as const,
        showNavigation: true,
    };
    switch (variant) {
        case "pointer":
            return { ...base, variant, x: 0.5, y: 0.5, text: "New message" };
        case "cursor":
            // Point-based like pointer; the runtime renders a simulated
            // cursor that glides between steps. Nav footer is hidden by the
            // runtime, so showNavigation here is a no-op for this variant.
            return { ...base, variant, x: 0.5, y: 0.5, text: "New message" };
        case "callout":
            return { ...base, variant, x: 0.5, y: 0.5, text: "New callout" };
        case "area":
            return {
                ...base,
                variant,
                x: 0.4,
                y: 0.4,
                w: 0.2,
                h: 0.2,
                text: "New area",
            };
    }
}

export function makeAnnotation(kind: AddKind): Annotation {
    switch (kind) {
        case "message":
            return makeMessage("cursor");
        case "blur":
            return {
                id: generateId("blur"),
                type: "blur",
                x: 0.4,
                y: 0.4,
                w: 0.2,
                h: 0.2,
                intensity: 8,
            };
        case "text":
            return {
                id: generateId("text"),
                type: "text",
                x: 0.5,
                y: 0.5,
                text: "New text",
                fontSize: 16,
            };
    }
}

/**
 * Convert a Message between variants. All variants share a single `text`
 * field, so no content migration is needed — only fill in `w`/`h` when
 * switching to `area` if they were missing.
 */
export function changeMessageVariant(
    message: Message,
    variant: MessageVariant,
): Message {
    const next: Message = { ...message, variant };
    if (variant === "area") {
        next.w = next.w ?? 0.2;
        next.h = next.h ?? 0.2;
    }
    return next;
}

/**
 * Render the *file name* of a selected asset in a Select trigger
 * instead of the raw URL value. base-ui Select.Value accepts a
 * function child that receives the current value; we look up the
 * asset by URL and return its basename.
 *
 * Three kinds of `src` show up in widgets:
 * - A project asset reference (`asset:{id}`) or URL → basename
 *   of the asset path (e.g. `Starter_demo_preview.png`).
 * - A data URI (the seeded placeholder SVG) → "Inline image".
 * - An external URL (e.g. `https://placehold.co/.../png?text=…`) →
 *   the URL's filename if it has an extension after stripping the
 *   query string / hash; otherwise "External image". Without the
 *   strip, generator URLs leak `png?text=Welcome&font=inter` into
 *   the trigger label.
 */
export function assetNameForUrl(
    url: string | null | undefined,
    assets: ReadonlyArray<AssetMeta>,
    _demoId: string,
): string {
    void _demoId;
    if (typeof url !== "string" || !url) return "";
    const match = findAssetReferenceEntry(assets, url);
    if (match) return match.path.split("/").pop() ?? match.path;
    if (url.startsWith("data:")) return "Inline image";
    const clean = url.split(/[?#]/)[0];
    const last = clean.split("/").filter(Boolean).pop() ?? "";
    if (/\.[A-Za-z0-9]{1,5}$/.test(last)) {
        return last.length > 28 ? `${last.slice(0, 25)}…` : last;
    }
    return "External image";
}

export function widgetTypeIcon(type: Widget["type"]): typeof TypeIcon {
    switch (type) {
        case "headline":
            return TypeIcon;
        case "form":
            return FormInputIcon;
        case "embed":
            return CodeIcon;
        case "custom":
            return HelpCircleIcon;
    }
}

export function widgetLabel(widget: Widget): string {
    switch (widget.type) {
        case "headline":
            return widget.title || "Headline";
        case "form":
            return widget.title || "Form";
        case "embed":
            return widget.iframeTitle || "Embed";
        case "custom":
            return widget.name || "Custom";
    }
}

export function widgetTypeLabel(widget: Widget): string {
    return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);
}

export function firstContentWidgetImage(
    steps: ReadonlyArray<Step>,
): WidgetImage | undefined {
    for (const step of steps) {
        if (step.kind !== "content") continue;
        if (step.background.type === "image") {
            return {
                src: step.background.src,
                position: "right",
                layout: "hero",
                naturalWidth: step.background.naturalWidth,
                naturalHeight: step.background.naturalHeight,
                ...(step.background.alt ? { alt: step.background.alt } : {}),
            };
        }
        if (step.background.type === "video" && step.background.posterSrc) {
            return {
                src: step.background.posterSrc,
                position: "right",
                layout: "hero",
                naturalWidth: step.background.naturalWidth,
                naturalHeight: step.background.naturalHeight,
                ...(step.background.alt ? { alt: step.background.alt } : {}),
            };
        }
    }
    return undefined;
}

export function makeWidget(
    kind: CoverWidgetKind,
    defaultImage?: WidgetImage,
): Widget {
    switch (kind) {
        case "headline":
            return {
                type: "headline",
                id: generateId("headline"),
                title: "Headline",
                description: "Add a description for this cover.",
                cta: {
                    label: "Continue",
                    action: { type: "next" },
                    animation: "shimmer",
                },
                ...(defaultImage ? { image: defaultImage } : {}),
            };
        case "form":
            return {
                type: "form",
                id: generateId("form"),
                title: "Tell us about you",
                fields: [
                    {
                        id: generateId("field"),
                        label: "Email",
                        type: "text",
                        required: true,
                    },
                ],
                submit: {
                    label: "Submit",
                    action: { type: "next" },
                    animation: "shimmer",
                },
                ...(defaultImage ? { image: defaultImage } : {}),
            };
        case "embed":
            return {
                type: "embed",
                id: generateId("embed"),
                src: "",
                sandbox: DEFAULT_EMBED_SANDBOX,
                allow: DEFAULT_EMBED_ALLOW,
            };
    }
}

export function makeOutroCtaWidget(): HeadlineWidget {
    return {
        type: "headline",
        id: generateId("headline"),
        title: "Ready for the next step?",
        description: "Replay this demo or continue from here.",
        textAlign: "middle",
        cta: {
            label: "Replay demo",
            action: { type: "restart" },
            animation: "shimmer",
        },
    };
}
