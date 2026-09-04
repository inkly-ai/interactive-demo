import {
    AlignCenterIcon,
    AlignLeftIcon,
    AlignRightIcon,
    CircleDotIcon,
    SquareIcon,
    SquareRoundCornerIcon,
    type LucideIcon,
    Maximize2Icon,
    MessageSquareIcon,
    MousePointerClickIcon,
    PanelBottomIcon,
    PanelLeftIcon,
    PanelRightIcon,
    RectangleHorizontalIcon,
    SquareDashedIcon,
    TypeIcon,
} from "lucide-react";
import type {
    FormFieldType,
    MessageTextAlign,
    MessageVariant,
    WidgetImageLayout,
    WidgetImagePosition,
} from "@inkly-org/interactive-demo";

export type HotspotAnchor = "top" | "right" | "bottom" | "left" | "auto";

export const ANCHORS: ReadonlyArray<HotspotAnchor> = [
    "auto",
    "top",
    "right",
    "bottom",
    "left",
];

/**
 * Add-button kinds. `message` is a single annotation type that the user
 * can re-shape between four variants (cursor / pointer / callout / area) once
 * placed, so we expose only one "+ Message" entry in the toolbar.
 */
export type AddKind = "message" | "blur" | "text";

export const ADD_BUTTONS: ReadonlyArray<{
    kind: AddKind;
    label: string;
}> = [
    { kind: "message", label: "Message" },
    { kind: "blur", label: "Blur" },
    { kind: "text", label: "Text" },
];

export const MESSAGE_VARIANTS: ReadonlyArray<{
    value: MessageVariant;
    label: string;
    Icon: typeof TypeIcon;
}> = [
    { value: "cursor", label: "Cursor", Icon: MousePointerClickIcon },
    { value: "pointer", label: "Pointer", Icon: CircleDotIcon },
    { value: "callout", label: "Callout", Icon: MessageSquareIcon },
    { value: "area", label: "Area", Icon: SquareDashedIcon },
];

export const MESSAGE_TEXT_ALIGNS: ReadonlyArray<{
    value: MessageTextAlign;
    label: string;
    Icon: typeof TypeIcon;
}> = [
    { value: "left", label: "Align left", Icon: AlignLeftIcon },
    { value: "middle", label: "Align middle", Icon: AlignCenterIcon },
    { value: "right", label: "Align right", Icon: AlignRightIcon },
];

/**
 * Border-radius presets exposed in the message inspector. The schema
 * stores `borderRadius` as a free-form CSS string (so themes can use
 * any unit they want), but the UI sticks to three canonical choices:
 * large, medium, and square. Medium intentionally stores no override so
 * messages inherit the runtime fallback radius.
 */
export const BORDER_RADIUS_PRESETS: ReadonlyArray<{
    key: string;
    label: string;
    value: string | undefined;
    Icon: LucideIcon;
}> = [
    {
        key: "large",
        label: "Large radius",
        value: "16px",
        Icon: SquareRoundCornerIcon,
    },
    {
        key: "medium",
        label: "Medium radius",
        value: undefined,
        Icon: SquareIcon,
    },
    {
        key: "none",
        label: "No radius",
        value: "0",
        Icon: SquareDashedIcon,
    },
];

export const DEFAULT_ZOOM_TRANSFORM = { zoom: 2, x: 0.5, y: 0.5 } as const;

/**
 * A cover step holds exactly one widget; this is the set the editor's
 * type switcher exposes. `custom` widgets stay JSON/Code-tab only, so
 * they're intentionally absent here.
 */
export type CoverWidgetKind = "headline" | "form" | "embed";

export const COVER_WIDGET_KINDS: ReadonlyArray<{
    kind: CoverWidgetKind;
    label: string;
}> = [
    { kind: "headline", label: "Headline" },
    { kind: "form", label: "Form" },
    { kind: "embed", label: "Embed" },
];

export const FORM_FIELD_TYPES: ReadonlyArray<FormFieldType> = ["text", "dropdown"];

/**
 * Where the optional headline/form image sits relative to the copy.
 * Drives the `image.position` field and the inspector's position tabs.
 */
export const IMAGE_POSITIONS: ReadonlyArray<{
    value: WidgetImagePosition;
    label: string;
    Icon: LucideIcon;
}> = [
    { value: "left", label: "Image left", Icon: PanelLeftIcon },
    { value: "right", label: "Image right", Icon: PanelRightIcon },
    { value: "top", label: "Stacked", Icon: PanelBottomIcon },
];

/**
 * Visual treatment for the widget image. `hero` is full-bleed (bleeds
 * off the player edge); `standard` is a contained, rounded card.
 */
export const IMAGE_LAYOUTS: ReadonlyArray<{
    value: WidgetImageLayout;
    label: string;
    Icon: typeof TypeIcon;
}> = [
    { value: "standard", label: "Standard", Icon: RectangleHorizontalIcon },
    { value: "hero", label: "Hero", Icon: Maximize2Icon },
];

/**
 * Seed image for a newly added widget image. The schema requires
 * `src.min(1)`, so an empty placeholder would fail Zod parse on
 * re-serialize and crash the editor into the "Editor unavailable" UI.
 * A small inline SVG keeps the config valid until the author swaps in a
 * real asset.
 */
export const WIDGET_IMAGE_PLACEHOLDER_SRC =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
            '<rect width="640" height="360" fill="#e5e7eb"/>' +
            '<text x="50%" y="50%" font-family="system-ui,sans-serif" ' +
            'font-size="28" fill="#9ca3af" text-anchor="middle" ' +
            'dominant-baseline="middle">Image</text>' +
            "</svg>",
    );
