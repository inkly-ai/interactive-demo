/*
 * Editor sidebar inspectors. Each inspector is the right-pane UI for a
 * specific kind of selection in the strip / stage.
 */
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import {
    type Annotation,
    type ButtonAction,
    type ButtonAnimation,
    type CoverBackground,
    type CoverStep,
    type Cta,
    type EmbedWidget,
    type FormField,
    type FormFieldOption,
    type FormFieldType,
    type FormWidget,
    type HeadlineLogo,
    type HeadlineWidget,
    type MessageTextAlign,
    type MessageVariant,
    type Step,
    type Widget,
    type WidgetImage,
    type WidgetImageLayout,
    type WidgetImagePosition,
} from "@inkly-org/interactive-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
    ArrowDownFromLineIcon,
    ArrowLeftFromLineIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
    ArrowRightFromLineIcon,
    ArrowUpFromLineIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ExternalLinkIcon,
    ImageIcon,
    ListEndIcon,
    Music2Icon,
    PaletteIcon,
    PlusIcon,
    RotateCcwIcon,
    ScanIcon,
    SearchIcon,
    SettingsIcon,
    Trash2Icon,
    UploadCloudIcon,
    XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "@/components/preview/markdown-editor";
import {
    assetDisplayUrl,
    type AssetMeta,
} from "@/lib/assets";
import { findAssetReferenceEntry } from "@/lib/assets/resolve";
import {
    ANCHORS,
    BORDER_RADIUS_PRESETS,
    COVER_WIDGET_KINDS,
    FORM_FIELD_TYPES,
    IMAGE_LAYOUTS,
    IMAGE_POSITIONS,
    MESSAGE_TEXT_ALIGNS,
    MESSAGE_VARIANTS,
    type CoverWidgetKind,
} from "./constants";
import {
    assetNameForUrl,
    borderRadiusKey,
    changeMessageVariant,
    firstContentWidgetImage,
    generateId,
    makeWidget,
    widgetTypeIcon,
} from "./factories";
import {
    GRADIENT_BACKGROUND_PRESETS,
    SOLID_BACKGROUND_PRESETS,
} from "./background-presets";
import {
    Choice,
    ColorSwatchInput,
    Field,
    NumberInput,
    SectionLabel,
    SliderInput,
    TextInput,
    Toggle,
    fieldClass,
} from "./inputs";
import {
    isAudioAsset,
    isVideoAsset,
    measureImageUrl,
    measureVideoUrl,
} from "./media-measure";

const ANCHOR_ICONS: Record<
    (typeof ANCHORS)[number],
    typeof ScanIcon
> = {
    auto: ScanIcon,
    top: ArrowUpFromLineIcon,
    right: ArrowRightFromLineIcon,
    bottom: ArrowDownFromLineIcon,
    left: ArrowLeftFromLineIcon,
};

const DEFAULT_COVER_SOLID_BACKGROUND = SOLID_BACKGROUND_PRESETS[0];
const GLASS_BLUR_PRESETS = [
    { key: "weak", label: "Weak", intensity: -5 },
    { key: "default", label: "Default", intensity: 0 },
    { key: "strong", label: "Strong", intensity: 5 },
] as const;
const DEFAULT_GLASS_BLUR_INTENSITY = GLASS_BLUR_PRESETS[1].intensity;
const MAX_COVER_BACKGROUND_BLUR = 48;
const ASSET_PICKER_PAGE_SIZE = 8;
export const COVER_BACKGROUND_MODES = [
    "default",
    "color",
    "image",
    "glassmorphism",
] as const;
type CoverBackgroundMode = (typeof COVER_BACKGROUND_MODES)[number];

const CTA_THEME_DEFAULTS: Record<
    string,
    { background: string; textColor: string }
> = {
    mono: { background: "#0A66FF", textColor: "#FFFFFF" },
};

function ctaThemeDefaults(themeId?: string) {
    return CTA_THEME_DEFAULTS[themeId ?? ""] ?? CTA_THEME_DEFAULTS["mono"];
}

const HOTSPOT_THEME_DEFAULTS: Record<
    string,
    { background: string; textColor: string }
> = {
    mono: { background: "#2563EB", textColor: "#FFFFFF" },
};

function hotspotThemeDefaults(themeId?: string) {
    return HOTSPOT_THEME_DEFAULTS[themeId ?? ""] ?? HOTSPOT_THEME_DEFAULTS["mono"];
}

function ColorOverrideControl({
    value,
    defaultColor,
    onChange,
    onRemove,
}: {
    value: string | undefined;
    defaultColor: string;
    onChange: (next: string) => void;
    onRemove: () => void;
}) {
    if (value) {
        return (
            <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                    <ColorSwatchInput
                        value={value}
                        fallback={defaultColor}
                        onChange={onChange}
                    />
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRemove}
                    aria-label="Remove override"
                    title="Remove override"
                    className="text-muted-foreground hover:text-[color:var(--ink-strong)]"
                >
                    <XIcon className="size-3.5" />
                </Button>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="flex h-8 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] pr-2 shadow-[var(--shadow-press)] transition-colors focus-within:border-[color:var(--accent)] focus-within:bg-[color:var(--surface)]"
            onClick={() => onChange(defaultColor.toLowerCase())}
        >
            <span
                aria-hidden
                className="h-full w-8 shrink-0 border-r border-[color:var(--line)]"
                style={{ backgroundColor: defaultColor }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                Theme default
            </span>
        </button>
    );
}

function NavButtonRow({
    label,
    placeholderLabel,
    value,
    onChange,
}: {
    label: string;
    placeholderLabel: string;
    value: { label?: string; hidden?: boolean } | undefined;
    onChange: (
        next: { label?: string; hidden?: boolean } | undefined,
    ) => void;
}) {
    const set = (patch: { label?: string; hidden?: boolean }) => {
        const next = { ...(value ?? {}), ...patch };
        if (!next.label && !next.hidden) {
            onChange(undefined);
            return;
        }
        onChange(next);
    };
    const hidden = value?.hidden ?? false;
    return (
        <div className="mb-2 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2">
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                {label}
            </span>
            <TextInput
                value={value?.label ?? ""}
                onChange={(v) => set({ label: v || undefined })}
                placeholder={`Defaults to "${placeholderLabel}"`}
            />
            <div className="mt-1.5">
                <Toggle
                    checked={hidden}
                    onChange={(v) => set({ hidden: v })}
                    label="Hide this button"
                />
            </div>
        </div>
    );
}

export function AnnotationInspector({
    annotation,
    onChange,
    onReplace,
    themeId,
}: {
    annotation: Annotation;
    onChange: (patch: Partial<Annotation>) => void;
    /** Used when the message variant changes (since variant changes
     *  affect required/optional fields, the caller may need to swap the
     *  whole annotation rather than apply a flat patch). */
    onReplace: (next: Annotation) => void;
    themeId?: string;
}) {
    const update = onChange as (patch: Record<string, unknown>) => void;
    const isMessage = annotation.type === "message";
    const messageThemeDefaults = hotspotThemeDefaults(themeId);
    const [behaviorOpen, setBehaviorOpen] = useState(false);

    return (
        <div>
            {isMessage && (
                <div className="mb-3">
                    <Tabs
                        value={annotation.variant}
                        onValueChange={(v) =>
                            onReplace(
                                changeMessageVariant(
                                    annotation,
                                    v as MessageVariant,
                                ),
                            )
                        }
                    >
                        <TabsList className="w-full">
                            {MESSAGE_VARIANTS.map(({ value, label, Icon }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    className="flex-1 gap-1 text-xs"
                                >
                                    <Icon className="size-3.5" />
                                    {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {isMessage && (
                <Field label="Text" asLabel={false}>
                    <MarkdownEditor
                        value={annotation.text ?? ""}
                        onChange={(text) =>
                            update({ text: text || undefined })
                        }
                        placeholder="Type here…"
                        minHeight={64}
                    />
                </Field>
            )}

            {annotation.type === "text" && (
                <>
                    <Field label="Text" asLabel={false}>
                        <MarkdownEditor
                            value={annotation.text}
                            onChange={(text) => update({ text })}
                            placeholder="Type here…"
                            minHeight={48}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Font size">
                            <NumberInput
                                value={annotation.fontSize}
                                step={1}
                                min={1}
                                onChange={(fontSize) => update({ fontSize })}
                            />
                        </Field>
                        <Field label="Color">
                            <ColorSwatchInput
                                value={annotation.color ?? "#000000"}
                                fallback="#000000"
                                onChange={(color) => update({ color })}
                            />
                        </Field>
                    </div>
                </>
            )}

            {annotation.type === "blur" && (
                <Field label="Intensity">
                    <SliderInput
                        value={annotation.intensity}
                        step={1}
                        min={0}
                        max={20}
                        onChange={(intensity) => update({ intensity })}
                    />
                </Field>
            )}

            {isMessage && (
                <>
                    <SectionLabel>Appearance</SectionLabel>
                    <Field label="Anchor">
                        <Tabs
                            value={annotation.anchor ?? "auto"}
                            onValueChange={(v) =>
                                update({
                                    anchor: v as (typeof ANCHORS)[number],
                                })
                            }
                        >
                            <TabsList className="w-full">
                                {ANCHORS.map((anchor) => {
                                    const Icon = ANCHOR_ICONS[anchor];
                                    const label =
                                        anchor === "auto"
                                            ? "Auto anchor"
                                            : `Anchor ${anchor}`;
                                    return (
                                        <TabsTrigger
                                            key={anchor}
                                            value={anchor}
                                            aria-label={label}
                                            tooltip={label}
                                            className="flex-1 px-1"
                                        >
                                            <Icon className="size-3.5" />
                                        </TabsTrigger>
                                    );
                                })}
                            </TabsList>
                        </Tabs>
                    </Field>
                    <Field label="Text alignment">
                        <Tabs
                            value={annotation.textAlign ?? "left"}
                            onValueChange={(v) =>
                                update({ textAlign: v as MessageTextAlign })
                            }
                        >
                            <TabsList className="w-full">
                                {MESSAGE_TEXT_ALIGNS.map(
                                    ({ value, label, Icon }) => (
                                        <TabsTrigger
                                            key={value}
                                            value={value}
                                            aria-label={label}
                                            tooltip={label}
                                            className="flex-1 px-1"
                                        >
                                            <Icon className="size-3.5" />
                                        </TabsTrigger>
                                    ),
                                )}
                            </TabsList>
                        </Tabs>
                    </Field>
                    <Field label="Background">
                        <ColorOverrideControl
                            value={annotation.background}
                            defaultColor={messageThemeDefaults.background}
                            onChange={(background) => update({ background })}
                            onRemove={() => update({ background: undefined })}
                        />
                    </Field>
                    <Field label="Text color">
                        <ColorOverrideControl
                            value={annotation.textColor}
                            defaultColor={messageThemeDefaults.textColor}
                            onChange={(textColor) => update({ textColor })}
                            onRemove={() => update({ textColor: undefined })}
                        />
                    </Field>
                    <Field label="Border radius">
                        <Tabs
                            value={borderRadiusKey(annotation.borderRadius)}
                            onValueChange={(key) => {
                                if (typeof key !== "string") return;
                                const preset = BORDER_RADIUS_PRESETS.find(
                                    (p) => p.key === key,
                                );
                                if (!preset) return;
                                update({ borderRadius: preset.value });
                            }}
                        >
                            <TabsList className="w-full">
                                {BORDER_RADIUS_PRESETS.map(
                                    ({ key, label, Icon }) => (
                                        <TabsTrigger
                                            key={key}
                                            value={key}
                                            aria-label={label}
                                            tooltip={label}
                                            className="flex-1 px-1"
                                        >
                                            <Icon
                                                className="size-3.5"
                                                aria-hidden
                                            />
                                        </TabsTrigger>
                                    ),
                                )}
                            </TabsList>
                        </Tabs>
                    </Field>
                    <button
                        type="button"
                        onClick={() => setBehaviorOpen((v) => !v)}
                        aria-expanded={behaviorOpen}
                        className="my-3 flex w-full cursor-pointer items-center gap-2 text-muted-foreground outline-none transition-colors hover:text-[color:var(--ink-strong)] focus-visible:text-[color:var(--ink-strong)]"
                    >
                        <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
                        <span className="inline-flex shrink-0 items-center gap-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.4px]">
                            {behaviorOpen ? (
                                <ChevronDownIcon className="size-3" />
                            ) : (
                                <ChevronRightIcon className="size-3" />
                            )}
                            Behavior
                        </span>
                        <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
                    </button>
                    {behaviorOpen ? (
                        <>
                            <Toggle
                                checked={annotation.advancesStep ?? true}
                                onChange={(v) =>
                                    update({ advancesStep: v })
                                }
                                label="Advances step on click"
                            />
            {/* The cursor variant hides the nav footer in the runtime, so
                its prev/next controls would be inert — omit them. */}
                            {annotation.variant !== "cursor" ? (
                                <>
                                    <Toggle
                                        checked={
                                            annotation.showNavigation ?? true
                                        }
                                        onChange={(v) =>
                                            update({ showNavigation: v })
                                        }
                                        label="Show prev/next navigation"
                                    />
                                    {(annotation.showNavigation ?? true) ? (
                                        <div className="mt-2">
                                            <SectionLabel>
                                                Navigation buttons
                                            </SectionLabel>
                                            <NavButtonRow
                                                label="Previous"
                                                placeholderLabel="<"
                                                value={annotation.prevButton}
                                                onChange={(prevButton) =>
                                                    update({ prevButton })
                                                }
                                            />
                                            <NavButtonRow
                                                label="Next"
                                                placeholderLabel=">"
                                                value={annotation.nextButton}
                                                onChange={(nextButton) =>
                                                    update({ nextButton })
                                                }
                                            />
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}

// ─── cover & widget inspectors ──────────────────────────────────────────────

/**
 * Side-panel header. Icon-only back button on the left, panel name
 * centered, and optional caller-supplied action + demo-settings
 * shortcut on the right.
 *
 * `items` is kept as a breadcrumb-shaped input so call sites don't
 * have to change: the first item's `onClick` powers the back button
 * and the last item supplies the title.
 */
export function SidebarBreadcrumb({
    items,
    rightAction,
    onOpenSettings,
    fadeBoundary = false,
}: {
    items: ReadonlyArray<{ label: string; onClick?: () => void }>;
    rightAction?: ReactNode;
    onOpenSettings?: () => void;
    fadeBoundary?: boolean;
}) {
    const onBack = items[0]?.onClick;
    const title = items[items.length - 1]?.label ?? "";
    return (
        <header
            className={cn(
                "grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-1 px-2 py-2",
                fadeBoundary &&
                    "relative z-10 bg-[color:var(--surface-2)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[color:var(--surface-2)] after:to-transparent after:backdrop-blur-sm after:[mask-image:linear-gradient(to_bottom,black,transparent)]",
            )}
        >
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onBack}
                disabled={!onBack}
                aria-label="Go back"
                title="Back"
                className="size-7 text-muted-foreground hover:text-[color:var(--ink-strong)]"
            >
                <ArrowLeftIcon className="size-3.5" />
            </Button>
            <span className="truncate text-center text-[11.5px] font-semibold capitalize text-[color:var(--ink-strong)]">
                {title}
            </span>
            <div className="flex min-w-7 items-center justify-end gap-1">
                {rightAction}
                {onOpenSettings ? (
                    <SimpleTooltip content="Demo settings" side="top">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onOpenSettings}
                            aria-label="Demo settings"
                            className="size-7 text-muted-foreground hover:text-[color:var(--ink-strong)]"
                        >
                            <SettingsIcon className="size-3.5" />
                        </Button>
                    </SimpleTooltip>
                ) : null}
            </div>
        </header>
    );
}


/**
 * Sidebar for cover-step authoring. A cover holds exactly one widget:
 * a Type switcher picks the widget kind (headline / form / embed) and
 * the matching fields render inline below. Custom widgets show a
 * read-only note — they're authored in the Code tab.
 */
export function CoverInspector({
    step,
    onChange,
    onSelectWidget,
    steps,
    demoSteps,
    demoId,
    imageAssets,
    uploadImage,
    themeId,
    nameDraft,
    onNameDraftChange,
    onNameCommit,
    namePlaceholder,
}: {
    step: CoverStep;
    onChange: (next: CoverStep) => void;
    /** Which widget is highlighted on the stage (null = none). Retained
     *  for stage↔inspector selection; a cover has a single widget. */
    selectedWidgetId: string | null;
    onSelectWidget: (id: string | null) => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    demoSteps: ReadonlyArray<Step>;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: (
        file: File,
    ) => Promise<{
        path: string;
        src: string;
        width: number;
        height: number;
    } | null>;
    themeId?: string;
    nameDraft: string;
    onNameDraftChange: (next: string) => void;
    onNameCommit: (next: string) => void;
    namePlaceholder: string;
}) {
    const widget = step.widgets[0];
    const setWidget = (next: Widget) => {
        onChange({ ...step, widgets: [next] });
    };

    const setKind = (kind: CoverWidgetKind) => {
        if (widget.type === kind) return;
        const existingImage =
            widget.type === "headline" || widget.type === "form"
                ? widget.image
                : undefined;
        const next = makeWidget(
            kind,
            existingImage ?? firstContentWidgetImage(demoSteps),
        );
        onChange({ ...step, widgets: [next] });
        onSelectWidget(next.id);
    };

    return (
        <div>
            <label className="mb-3 grid gap-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                    Step name
                </span>
                <input
                    type="text"
                    value={nameDraft}
                    placeholder={namePlaceholder}
                    onChange={(e) => onNameDraftChange(e.target.value)}
                    onBlur={(e) => onNameCommit(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.currentTarget.blur();
                    }}
                    className="h-8 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[12.5px] text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
                />
            </label>

            <CoverBackgroundPicker
                step={step}
                onChange={onChange}
                demoId={demoId}
                imageAssets={imageAssets}
                uploadImage={uploadImage}
            />

            <SectionLabel>Widget</SectionLabel>
            <div className="space-y-1.5">
                <Field label="Type">
                    <Tabs
                        value={widget.type === "custom" ? "" : widget.type}
                        onValueChange={(v) => setKind(v as CoverWidgetKind)}
                    >
                        <TabsList className="w-full">
                            {COVER_WIDGET_KINDS.map(({ kind, label }) => {
                                const Icon = widgetTypeIcon(kind);
                                return (
                                    <TabsTrigger
                                        key={kind}
                                        value={kind}
                                        aria-label={label}
                                        title={label}
                                        className="flex-1 gap-1.5 px-1"
                                    >
                                        <Icon className="size-3.5" />
                                        {label}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                </Field>
                {widget.type === "custom" ? (
                    <p className="px-0.5 text-[12px] text-muted-foreground">
                        Custom widgets are configured via the Code tab.
                    </p>
                ) : (
                    <WidgetInspector
                        widget={widget}
                        onChange={setWidget}
                        steps={steps}
                        coverStepId={step.id}
                        demoId={demoId}
                        imageAssets={imageAssets}
                        uploadImage={uploadImage}
                        defaultHeadlineTextAlign="middle"
                        themeId={themeId}
                    />
                )}
            </div>
        </div>
    );
}

function CoverBackgroundPicker({
    step,
    onChange,
    demoId,
    imageAssets,
    uploadImage,
}: {
    step: CoverStep;
    onChange: (next: CoverStep) => void;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
}) {
    const background = step.background;
    const hasOverride = Boolean(background);
    const storedMode: CoverBackgroundMode =
        !background
            ? "default"
            : background.type === "glassmorphism"
            ? "glassmorphism"
            : background.type === "image"
              ? "image"
              : "color";
    // "Image" is selected before an image exists: the tab switches at once
    // and the picker opens; cancelling the picker falls back to the stored
    // mode. (The schema requires an image background to have a src.)
    const [pendingImage, setPendingImage] = useState(false);
    const mode: CoverBackgroundMode =
        pendingImage && storedMode !== "image" ? "image" : storedMode;
    const solidColor =
        background?.type === "color" && background.color
            ? background.color
            : DEFAULT_COVER_SOLID_BACKGROUND;
    const gradient =
        background?.type === "color" && background.from && background.to
            ? { from: background.from, to: background.to }
            : {
                  from: GRADIENT_BACKGROUND_PRESETS[0].from,
                  to: GRADIENT_BACKGROUND_PRESETS[0].to,
              };
    const colorMode =
        background?.type === "color" && background.from && background.to
            ? "gradient"
            : "solid";
    const imageSrc = background?.type === "image" ? background.src ?? "" : "";
    const imageBlur =
        background?.type === "image" && typeof background.blur === "number"
            ? Math.min(MAX_COVER_BACKGROUND_BLUR, Math.max(0, background.blur))
            : 0;
    const glassIntensity =
        background?.type === "glassmorphism" &&
        typeof background.intensity === "number"
            ? background.intensity
            : DEFAULT_GLASS_BLUR_INTENSITY;
    const activeGlassPreset = GLASS_BLUR_PRESETS.reduce(
        (best, preset) =>
            Math.abs(preset.intensity - glassIntensity) <
            Math.abs(best.intensity - glassIntensity)
                ? preset
                : best,
        GLASS_BLUR_PRESETS[0],
    );
    const [imagePickerOpen, setImagePickerOpen] = useState(false);

    const setBackground = (next: CoverBackground) => {
        onChange(coverStepWithBackground(step, next));
    };

    const setImageBackground = (src: string, alt?: string) => {
        setBackground(
            withOptionalCoverBackgroundBlur(
                { type: "image", src, alt },
                imageBlur,
            ),
        );
    };

    const setImageBlur = (blur: number) => {
        if (background?.type !== "image") return;
        setBackground(withOptionalCoverBackgroundBlur({ ...background }, blur));
    };

    const clearBackgroundOverride = () => {
        onChange({
            ...step,
            background: undefined,
            backgroundImage: undefined,
        });
    };

    const setMode = (next: CoverBackgroundMode) => {
        if (next !== "image") setPendingImage(false);
        if (next === "default") {
            clearBackgroundOverride();
        } else if (next === "color") {
            setBackground({ type: "color", color: solidColor });
        } else if (next === "glassmorphism") {
            setBackground({
                type: "glassmorphism",
                intensity: DEFAULT_GLASS_BLUR_INTENSITY,
            });
        } else {
            const existingImage = step.backgroundImage;
            if (existingImage?.src) {
                setBackground({
                    type: "image",
                    src: existingImage.src,
                    alt: existingImage.alt,
                });
            } else {
                // An image background needs an image: show the tab, open the
                // picker and let `setImageBackground` commit once one is chosen.
                setPendingImage(true);
                setImagePickerOpen(true);
            }
        }
    };

    return (
        <div className="mb-3 grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="block text-[11.5px] font-medium text-[color:var(--ink-2)]">
                    Background
                </span>
                {hasOverride ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-[color:var(--ink-strong)]"
                        onClick={clearBackgroundOverride}
                    >
                        <XIcon className="mr-1 size-3" />
                        Cancel override
                    </Button>
                ) : null}
            </div>
            <Tabs
                className="min-w-0"
                value={mode}
                onValueChange={(next) => {
                    if (
                        COVER_BACKGROUND_MODES.includes(
                            next as CoverBackgroundMode,
                        )
                    ) {
                        setMode(next as CoverBackgroundMode);
                    }
                }}
            >
                <TabsList className="min-w-0 w-full">
                    <TabsTrigger value="default" className="flex-1 gap-1.5">
                        Default
                    </TabsTrigger>
                    <TabsTrigger value="color" className="flex-1 gap-1.5">
                        Color
                    </TabsTrigger>
                    <TabsTrigger value="image" className="flex-1 gap-1.5">
                        Image
                    </TabsTrigger>
                    <TabsTrigger
                        value="glassmorphism"
                        className="flex-1 gap-1.5"
                    >
                        Glass
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {mode === "default" ? (
                <button
                    type="button"
                    className="group grid h-16 min-w-0 overflow-hidden rounded-md border border-[color:var(--accent)] bg-[color:var(--surface-2)] text-left shadow-[var(--shadow-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                    onClick={clearBackgroundOverride}
                    aria-label="Use the theme's default background"
                >
                    <span
                        aria-hidden
                        className="col-start-1 row-start-1 block h-full w-full"
                        style={{
                            backgroundImage:
                                "linear-gradient(135deg, #f4f4f5, #d4d4d8)",
                        }}
                    />
                    <span className="col-start-1 row-start-1 flex items-end justify-between gap-2 bg-gradient-to-t from-white/85 via-white/35 to-transparent px-3 py-2">
                        <span className="min-w-0 truncate text-[12.5px] font-semibold text-[color:var(--ink-strong)]">
                            Theme default
                        </span>
                        <span className="rounded-full border border-[color:var(--accent)] bg-white/85 px-2 py-0.5 text-[10.5px] font-medium text-[color:var(--ink-2)]">
                            Default
                        </span>
                    </span>
                </button>
            ) : null}

            {mode === "color" ? (
                <div className="grid min-w-0 gap-2">
                    <Tabs
                        className="min-w-0"
                        value={colorMode}
                        onValueChange={(next) => {
                            if (next === "solid") {
                                setBackground({
                                    type: "color",
                                    color: solidColor,
                                });
                            } else if (next === "gradient") {
                                setBackground({
                                    type: "color",
                                    from: gradient.from,
                                    to: gradient.to,
                                });
                            }
                        }}
                    >
                        <TabsList className="min-w-0 w-full">
                            <TabsTrigger
                                value="solid"
                                className="flex-1 gap-1.5"
                            >
                                <PaletteIcon className="size-3.5" />
                                Solid
                            </TabsTrigger>
                            <TabsTrigger
                                value="gradient"
                                className="flex-1 gap-1.5"
                            >
                                <span
                                    aria-hidden
                                    className="size-3.5 rounded-full"
                                    style={{
                                        background:
                                            "linear-gradient(135deg, #a18cd1, #fbc2eb)",
                                    }}
                                />
                                Gradient
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {colorMode === "solid" ? (
                        <>
                            <div className="grid min-w-0 grid-cols-8 gap-1.5">
                                {SOLID_BACKGROUND_PRESETS.map((color) => (
                                    <CoverBackgroundSwatchButton
                                        key={color}
                                        active={solidColor === color}
                                        label={color}
                                        style={{ background: color }}
                                        onClick={() =>
                                            setBackground({
                                                type: "color",
                                                color,
                                            })
                                        }
                                    />
                                ))}
                            </div>
                            <ColorSwatchInput
                                value={solidColor}
                                fallback={DEFAULT_COVER_SOLID_BACKGROUND}
                                onChange={(color) =>
                                    setBackground({ type: "color", color })
                                }
                            />
                        </>
                    ) : (
                        <>
                            <div className="grid min-w-0 grid-cols-3 gap-1.5">
                                {GRADIENT_BACKGROUND_PRESETS.map((preset) => (
                                    <CoverBackgroundSwatchButton
                                        key={preset.label}
                                        active={
                                            gradient.from === preset.from &&
                                            gradient.to === preset.to
                                        }
                                        label={preset.label}
                                        className="h-9 rounded-md"
                                        style={{
                                            background: `linear-gradient(135deg, ${preset.from}, ${preset.to})`,
                                        }}
                                        onClick={() =>
                                            setBackground({
                                                type: "color",
                                                from: preset.from,
                                                to: preset.to,
                                            })
                                        }
                                    />
                                ))}
                            </div>
                            <div className="grid min-w-0 grid-cols-2 gap-2">
                                <ColorSwatchInput
                                    value={gradient.from}
                                    fallback={GRADIENT_BACKGROUND_PRESETS[0].from}
                                    onChange={(from) =>
                                        setBackground({
                                            type: "color",
                                            from,
                                            to: gradient.to,
                                        })
                                    }
                                />
                                <ColorSwatchInput
                                    value={gradient.to}
                                    fallback={GRADIENT_BACKGROUND_PRESETS[0].to}
                                    onChange={(to) =>
                                        setBackground({
                                            type: "color",
                                            from: gradient.from,
                                            to,
                                        })
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            ) : null}

            {mode === "image" ? (
                <div className="grid min-w-0 gap-2">
                    <Field label="Background blur">
                        <SliderInput
                            value={imageBlur}
                            step={1}
                            min={0}
                            max={MAX_COVER_BACKGROUND_BLUR}
                            valueLabel={(value) => `${value}px`}
                            onChange={setImageBlur}
                        />
                    </Field>
                    <Button
                        type="button"
                        variant="flat"
                        className="w-full gap-1.5"
                        onClick={() => setImagePickerOpen(true)}
                    >
                        <UploadCloudIcon className="size-3.5" />
                        Upload Image
                    </Button>
                    <MediaAssetPickerDialog
                        open={imagePickerOpen}
                        onOpenChange={(open) => {
                            setImagePickerOpen(open);
                            if (!open && storedMode !== "image") {
                                setPendingImage(false);
                            }
                        }}
                        title="Upload background image"
                        mediaKind="image"
                        currentSrc={imageSrc}
                        assets={imageAssets}
                        demoId={demoId}
                        uploadMedia={uploadImage}
                        onPick={(result) => {
                            setImageBackground(result.src, result.alt);
                            setPendingImage(false);
                        }}
                    />
                </div>
            ) : null}

            {mode === "glassmorphism" ? (
                <div className="grid min-w-0 gap-1.5 px-0.5 pt-0.5">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-[color:var(--ink-2)]">
                        <span>Blur intensity</span>
                    </div>
                    <Tabs
                        value={activeGlassPreset.key}
                        onValueChange={(key) => {
                            const preset = GLASS_BLUR_PRESETS.find(
                                (option) => option.key === key,
                            );
                            if (preset) {
                                setBackground({
                                    type: "glassmorphism",
                                    intensity: preset.intensity,
                                });
                            }
                        }}
                    >
                        <TabsList className="w-full">
                            {GLASS_BLUR_PRESETS.map((preset) => (
                                <TabsTrigger
                                    key={preset.key}
                                    value={preset.key}
                                    className="flex-1"
                                >
                                    {preset.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            ) : null}
        </div>
    );
}

export function coverStepWithBackground(
    step: CoverStep,
    background: CoverBackground,
): CoverStep {
    return {
        ...step,
        background,
        backgroundImage: undefined,
    };
}

function withOptionalCoverBackgroundBlur<T extends CoverBackground>(
    background: T,
    blur: number,
): T {
    const next = { ...background };
    if (blur > 0) {
        next.blur = Math.min(MAX_COVER_BACKGROUND_BLUR, Math.max(0, blur));
    } else {
        delete next.blur;
    }
    return next;
}

function CoverBackgroundSwatchButton({
    active,
    label,
    style,
    className,
    onClick,
}: {
    active: boolean;
    label: string;
    style: CSSProperties;
    className?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={cn(
                "h-7 min-w-0 cursor-pointer rounded-md border border-white/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] outline outline-1 outline-transparent transition",
                active &&
                    "outline-[color:var(--accent)] ring-2 ring-[color:var(--surface)]",
                className,
            )}
            style={style}
        />
    );
}

/**
 * Per-widget settings panel. Switches on `widget.type` and renders the
 * fields that map 1:1 to the widget schema. Custom widgets are
 * read-only — their `data` bag is too freeform to type a UI for.
 */
export function WidgetInspector({
    widget,
    onChange,
    steps,
    coverStepId,
    demoId,
    imageAssets,
    uploadImage,
    defaultHeadlineTextAlign,
    themeId,
}: {
    widget: Widget;
    onChange: (next: Widget) => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    coverStepId: string;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: (
        file: File,
    ) => Promise<{
        path: string;
        src: string;
        width: number;
        height: number;
    } | null>;
    defaultHeadlineTextAlign: MessageTextAlign;
    themeId?: string;
}) {
    return (
        <div>
            {widget.type === "headline" && (
                <HeadlineWidgetFields
                    widget={widget}
                    onChange={onChange}
                    steps={steps}
                    coverStepId={coverStepId}
                    defaultTextAlign={defaultHeadlineTextAlign}
                    themeId={themeId}
                    demoId={demoId}
                    imageAssets={imageAssets}
                    uploadImage={uploadImage}
                />
            )}
            {widget.type === "form" && (
                <FormWidgetFields
                    widget={widget}
                    onChange={onChange}
                    steps={steps}
                    coverStepId={coverStepId}
                    themeId={themeId}
                    demoId={demoId}
                    imageAssets={imageAssets}
                    uploadImage={uploadImage}
                />
            )}
            {widget.type === "embed" && (
                <EmbedWidgetFields widget={widget} onChange={onChange} />
            )}
            {widget.type === "custom" && (
                <p className="text-[12px] text-muted-foreground">
                    Custom widgets are configured via the Code tab.
                </p>
            )}
        </div>
    );
}

function InspectorCollapsibleSection({
    title,
    defaultOpen = true,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <Collapsible open={open} onOpenChange={(next) => setOpen(next)}>
            <div className="my-3 flex w-full items-center gap-2 text-muted-foreground">
                <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
                <CollapsibleTrigger
                    render={
                        <button
                            type="button"
                            className="group flex shrink-0 cursor-pointer items-center gap-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.4px] outline-none transition-colors hover:text-[color:var(--ink-strong)] focus-visible:text-[color:var(--ink-strong)]"
                            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
                        >
                            <span>{title}</span>
                            <ChevronDownIcon
                                className={cn(
                                    "size-3 transition-transform",
                                    !open && "-rotate-90",
                                )}
                            />
                        </button>
                    }
                />
                <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:overflow-visible data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

function IconTabTooltip({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <span className="grid gap-0.5 text-left">
            <span className="font-medium">{title}</span>
            <span className="text-[11px] opacity-80">{description}</span>
        </span>
    );
}

function imagePositionDescription(value: WidgetImagePosition) {
    if (value === "left") return "Places the image to the left of the copy.";
    if (value === "right") return "Places the image to the right of the copy.";
    return "Stacks the image above the cover copy.";
}

function imageLayoutDescription(value: WidgetImageLayout) {
    if (value === "hero") return "Uses a larger edge-to-edge hero treatment.";
    return "Keeps the image contained in a standard frame.";
}

function textAlignDescription(value: MessageTextAlign) {
    if (value === "left") return "Aligns the cover copy to the left.";
    if (value === "right") return "Aligns the cover copy to the right.";
    return "Centers the cover copy.";
}

/**
 * Optional image control shared by the headline and form widget
 * editors. Mirrors the Logo field — a picker button (+ remove) — plus a
 * left/right/top position toggle once an image is set.
 */
function WidgetImageField({
    image,
    onChange,
    demoId,
    imageAssets,
    uploadImage,
}: {
    image: WidgetImage | undefined;
    onChange: (next: WidgetImage | undefined) => void;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const imageName = image
        ? assetNameForUrl(image.src, imageAssets, demoId)
        : "";

    return (
        <>
            <Field label="Image">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className={cn(
                            "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-left text-[12.5px] shadow-[var(--shadow-press)] hover:border-[color:var(--accent)]",
                        )}
                    >
                        <ImageIcon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                        <span className="truncate text-[color:var(--ink-1)]">
                            {image ? imageName || "Image" : "Add an image…"}
                        </span>
                    </button>
                    {image ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-destructive hover:text-destructive"
                            aria-label="Remove image"
                            title="Remove image"
                            onClick={() => onChange(undefined)}
                        >
                            <Trash2Icon className="size-3.5" />
                        </Button>
                    ) : null}
                </div>
            </Field>
            {image ? (
                <Field label="Image layout">
                    <Tabs
                        value={image.position}
                        onValueChange={(v) =>
                            onChange({
                                ...image,
                                position: v as WidgetImagePosition,
                            })
                        }
                    >
                        <TabsList className="w-full">
                            {IMAGE_POSITIONS.map(({ value, label, Icon }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    aria-label={label}
                                    title={label}
                                    tooltip={
                                        <IconTabTooltip
                                            title={label}
                                            description={imagePositionDescription(
                                                value,
                                            )}
                                        />
                                    }
                                    className="flex-1 px-1"
                                >
                                    <Icon className="size-3.5" />
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </Field>
            ) : null}
            {image ? (
                <Field label="Image style">
                    <Tabs
                        value={image.layout}
                        onValueChange={(v) =>
                            onChange({
                                ...image,
                                layout: v as WidgetImageLayout,
                            })
                        }
                    >
                        <TabsList className="w-full">
                            {IMAGE_LAYOUTS.map(({ value, label, Icon }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    aria-label={label}
                                    title={label}
                                    tooltip={
                                        <IconTabTooltip
                                            title={label}
                                            description={imageLayoutDescription(
                                                value,
                                            )}
                                        />
                                    }
                                    className="flex-1 px-1"
                                >
                                    <Icon className="size-3.5" />
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </Field>
            ) : null}
            <MediaAssetPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                title="Image"
                mediaKind="image"
                currentSrc={image?.src ?? ""}
                assets={imageAssets}
                demoId={demoId}
                uploadMedia={uploadImage}
                onPick={(r) => {
                    onChange({
                        src: r.src,
                        position: image?.position ?? "right",
                        layout: image?.layout ?? "hero",
                        ...(r.alt ? { alt: r.alt } : {}),
                        ...(r.naturalWidth
                            ? { naturalWidth: r.naturalWidth }
                            : {}),
                        ...(r.naturalHeight
                            ? { naturalHeight: r.naturalHeight }
                            : {}),
                    });
                }}
            />
        </>
    );
}

export function HeadlineWidgetFields({
    widget,
    onChange,
    steps,
    coverStepId,
    defaultTextAlign,
    themeId,
    demoId,
    imageAssets,
    uploadImage,
}: {
    widget: HeadlineWidget;
    onChange: (next: HeadlineWidget) => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    coverStepId: string;
    defaultTextAlign: MessageTextAlign;
    themeId?: string;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: (
        file: File,
    ) => Promise<{
        path: string;
        src: string;
        width: number;
        height: number;
    } | null>;
}) {
    const set = (patch: Partial<HeadlineWidget>) =>
        onChange({ ...widget, ...patch });
    const ctaDefaults = ctaThemeDefaults(themeId);
    const [logoPickerOpen, setLogoPickerOpen] = useState(false);
    const logoName = widget.logo
        ? assetNameForUrl(widget.logo.src, imageAssets, demoId)
        : "";

    return (
        <>
            <Field label="Logo">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setLogoPickerOpen(true)}
                        className={cn(
                            "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-left text-[12.5px] shadow-[var(--shadow-press)] hover:border-[color:var(--accent)]",
                        )}
                    >
                        <ImageIcon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                        <span className="truncate text-[color:var(--ink-1)]">
                            {widget.logo
                                ? logoName || "Logo"
                                : "Add a logo…"}
                        </span>
                    </button>
                    {widget.logo ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-destructive hover:text-destructive"
                            aria-label="Remove logo"
                            title="Remove logo"
                            onClick={() => {
                                const { logo: _drop, ...rest } = widget;
                                void _drop;
                                onChange(rest as HeadlineWidget);
                            }}
                        >
                            <Trash2Icon className="size-3.5" />
                        </Button>
                    ) : null}
                </div>
            </Field>
            <MediaAssetPickerDialog
                open={logoPickerOpen}
                onOpenChange={setLogoPickerOpen}
                title="Logo"
                mediaKind="image"
                currentSrc={widget.logo?.src ?? ""}
                assets={imageAssets}
                demoId={demoId}
                uploadMedia={uploadImage}
                onPick={(r) => {
                    const nextLogo: HeadlineLogo = {
                        src: r.src,
                        ...(r.alt ? { alt: r.alt } : {}),
                        ...(widget.logo?.height
                            ? { height: widget.logo.height }
                            : {}),
                    };
                    set({ logo: nextLogo });
                }}
            />
            <Field label="Title" asLabel={false}>
                <MarkdownEditor
                    value={widget.title}
                    onChange={(v) => set({ title: v })}
                    placeholder="Type here…"
                    minHeight={48}
                    color={widget.titleColor}
                    onColorChange={(v) => set({ titleColor: v })}
                    showLists={false}
                />
            </Field>
            <Field label="Description" asLabel={false}>
                <MarkdownEditor
                    value={widget.description ?? ""}
                    onChange={(v) => set({ description: v || undefined })}
                    placeholder="Optional supporting copy"
                    minHeight={64}
                    color={widget.descriptionColor}
                    onColorChange={(v) => set({ descriptionColor: v })}
                    showLists={false}
                />
            </Field>
            <Field label="Alignment">
                <Tabs
                    value={widget.textAlign ?? defaultTextAlign}
                    onValueChange={(v) =>
                        set({ textAlign: v as MessageTextAlign })
                    }
                >
                    <TabsList className="w-full">
                        {MESSAGE_TEXT_ALIGNS.map(
                            ({ value, label, Icon }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    aria-label={label}
                                    title={label}
                                    tooltip={
                                        <IconTabTooltip
                                            title={label}
                                            description={textAlignDescription(
                                                value,
                                            )}
                                        />
                                    }
                                    className="flex-1 px-1"
                                >
                                    <Icon className="size-3.5" />
                                </TabsTrigger>
                            ),
                        )}
                    </TabsList>
                </Tabs>
            </Field>
            <InspectorCollapsibleSection title="Image">
                <WidgetImageField
                    image={widget.image}
                    onChange={(next) => set({ image: next })}
                    demoId={demoId}
                    imageAssets={imageAssets}
                    uploadImage={uploadImage}
                />
            </InspectorCollapsibleSection>

            <InspectorCollapsibleSection title="Call to action">
                <CtaButtonEditor
                    label="Primary button"
                    labelField="CTA label"
                    value={widget.cta}
                    defaultColors={ctaDefaults}
                    onChange={(cta) => set({ cta })}
                    onRemove={() => {
                        const { cta: _drop, ...rest } = widget;
                        void _drop;
                        onChange(rest as HeadlineWidget);
                    }}
                    steps={steps}
                    excludeStepId={coverStepId}
                />
                {widget.cta && !widget.secondaryCta ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mb-2 h-7 px-2 text-[11.5px]"
                        onClick={() =>
                            set({
                                secondaryCta: {
                                    label: "Learn more",
                                    action: { type: "next" },
                                    animation: "shimmer",
                                },
                            })
                        }
                    >
                        <PlusIcon className="size-3.5" />
                        Second button
                    </Button>
                ) : null}
                {widget.secondaryCta ? (
                    <>
                        <SectionLabel>Second button</SectionLabel>
                        <CtaButtonEditor
                            label="Second button"
                            labelField="Label"
                            value={widget.secondaryCta}
                            defaultColors={ctaDefaults}
                            onChange={(secondaryCta) =>
                                set({ secondaryCta })
                            }
                            onRemove={() => {
                                const { secondaryCta: _drop, ...rest } =
                                    widget;
                                void _drop;
                                onChange(rest as HeadlineWidget);
                            }}
                            steps={steps}
                            excludeStepId={coverStepId}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mb-2 h-7 px-2 text-[11.5px] text-destructive hover:text-destructive"
                            onClick={() => {
                                const { secondaryCta: _drop, ...rest } =
                                    widget;
                                void _drop;
                                onChange(rest as HeadlineWidget);
                            }}
                        >
                            <Trash2Icon className="size-3.5" />
                            Remove second button
                        </Button>
                    </>
                ) : null}
            </InspectorCollapsibleSection>
        </>
    );
}

function CtaButtonEditor({
    label,
    labelField,
    value,
    defaultColors,
    onChange,
    onRemove,
    steps,
    excludeStepId,
}: {
    label: string;
    labelField: string;
    value: Cta | undefined;
    defaultColors: { background: string; textColor: string };
    onChange: (next: Cta | undefined) => void;
    onRemove: () => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    excludeStepId?: string;
}) {
    const set = (patch: Partial<Cta>) => {
        onChange({
            ...(value ?? {
                label,
                action: { type: "next" } as ButtonAction,
                animation: "shimmer" as const,
            }),
            ...patch,
        });
    };

    return (
        <>
            <Field label={labelField}>
                <TextInput
                    value={value?.label ?? ""}
                    onChange={(nextLabel) => {
                        if (!nextLabel) {
                            onRemove();
                            return;
                        }
                        set({ label: nextLabel });
                    }}
                    placeholder="Leave empty to hide"
                />
            </Field>
            {value ? (
                <>
                    <CtaActionEditor
                        value={value.action ?? { type: "next" }}
                        onChange={(action) => set({ action })}
                        steps={steps}
                        excludeStepId={excludeStepId}
                    />
                    <CtaAnimationEditor
                        value={value.animation}
                        onChange={(animation) => set({ animation })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Background">
                            <ColorOverrideControl
                                value={value.background}
                                defaultColor={defaultColors.background}
                                onChange={(background) => set({ background })}
                                onRemove={() => set({ background: undefined })}
                            />
                        </Field>
                        <Field label="Text color">
                            <ColorOverrideControl
                                value={value.textColor}
                                defaultColor={defaultColors.textColor}
                                onChange={(textColor) => set({ textColor })}
                                onRemove={() => set({ textColor: undefined })}
                            />
                        </Field>
                    </div>
                </>
            ) : null}
        </>
    );
}

export type CtaActionKind = "next" | "prev" | "restart" | "step" | "url";

export const CTA_ACTION_KIND_LABELS: ReadonlyArray<{
    value: CtaActionKind;
    label: string;
    Icon: typeof ArrowRightIcon;
}> = [
    { value: "next", label: "Go to next step", Icon: ArrowRightIcon },
    { value: "prev", label: "Go to previous step", Icon: ArrowLeftIcon },
    { value: "restart", label: "Restart demo", Icon: RotateCcwIcon },
    { value: "step", label: "Go to a specific step", Icon: ListEndIcon },
    { value: "url", label: "Open external URL", Icon: ExternalLinkIcon },
];

const CTA_ANIMATION_OPTIONS: ReadonlyArray<{
    value: "none" | ButtonAnimation;
    label: string;
}> = [
    { value: "none", label: "None" },
    { value: "shimmer", label: "Shimmer" },
];

/**
 * Animation variant picker for an authored CTA. Missing animation uses
 * the schema default (shimmer); "none" is stored explicitly.
 */
export function CtaAnimationEditor({
    value,
    onChange,
}: {
    value: ButtonAnimation | undefined;
    onChange: (next: ButtonAnimation) => void;
}) {
    const selected = value ?? "shimmer";
    return (
        <Field label="Animation">
            <Tabs
                value={selected}
                onValueChange={(next) => {
                    if (typeof next !== "string") return;
                    if (next === "none") {
                        onChange("none");
                        return;
                    }
                    onChange(next as ButtonAnimation);
                }}
            >
                <TabsList className="w-full">
                    {CTA_ANIMATION_OPTIONS.map((o) => (
                        <TabsTrigger
                            key={o.value}
                            value={o.value}
                            className="flex-1"
                        >
                            {o.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </Field>
    );
}

/**
 * Cta action editor — type Choice plus the destination fields for the
 * picked kind (target step for `step`, href + target for `url`).
 * Shared by the headline CTA and the form-submit CTA so both surfaces
 * support the same destination set. Chapter destinations are still
 * authorable via the Code tab only.
 */
export function CtaActionEditor({
    value,
    onChange,
    steps,
    excludeStepId,
}: {
    value: ButtonAction;
    onChange: (next: ButtonAction) => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    /** Hide a step id from the picker — typically the current step. */
    excludeStepId?: string;
}) {
    // Map any non-listed action types (chapter) back to "next" for the
    // kind select, but keep the underlying action intact in case the
    // author re-picks it.
    const kind: CtaActionKind =
        value.type === "next" ||
        value.type === "prev" ||
        value.type === "restart" ||
        value.type === "step" ||
        value.type === "url"
            ? value.type
            : "next";

    const pickableSteps = steps.filter((s) => s.id !== excludeStepId);
    return (
        <>
            <Field label="Action">
                <Select
                    value={kind}
                    onValueChange={(next) => {
                        if (typeof next !== "string") return;
                        const k = next as CtaActionKind;
                        if (k === "step") {
                            onChange({
                                type: "step",
                                stepId:
                                    pickableSteps[0]?.id ?? steps[0]?.id ?? "",
                            });
                            return;
                        }
                        if (k === "url") {
                            onChange({
                                type: "url",
                                href: "https://",
                                target: "_blank",
                            });
                            return;
                        }
                        onChange({ type: k } as ButtonAction);
                    }}
                >
                    <SelectTrigger
                        className={cn(
                            "w-full border-[color:var(--line)] bg-[color:var(--surface-2)] text-[12.5px] shadow-[var(--shadow-press)]",
                        )}
                    >
                        <SelectValue>
                            {(v) => {
                                const option = CTA_ACTION_KIND_LABELS.find(
                                    (o) => o.value === v,
                                );
                                if (!option) return "";
                                const Icon = option.Icon;
                                return (
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <Icon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                                        <span className="truncate">
                                            {option.label}
                                        </span>
                                    </span>
                                );
                            }}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {CTA_ACTION_KIND_LABELS.map((o) => {
                            const Icon = o.Icon;
                            return (
                                <SelectItem key={o.value} value={o.value}>
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            {o.label}
                                        </span>
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </Field>
            {kind === "step" ? (
                <Field label="Target step">
                    <Select
                        value={value.type === "step" ? value.stepId : ""}
                        onValueChange={(stepId) => {
                            if (typeof stepId !== "string" || !stepId) return;
                            onChange({ type: "step", stepId });
                        }}
                    >
                        <SelectTrigger
                            className={cn(
                                "w-full border-[color:var(--line)] bg-[color:var(--surface-2)] text-[12.5px] shadow-[var(--shadow-press)]",
                            )}
                        >
                            <SelectValue placeholder="Pick a step…">
                                {(v) =>
                                    pickableSteps.find((s) => s.id === v)
                                        ?.label ?? "Pick a step…"
                                }
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {pickableSteps.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : null}
            {kind === "url" ? (
                <Field label="URL">
                    <TextInput
                        value={value.type === "url" ? value.href : ""}
                        onChange={(href) =>
                            onChange({
                                type: "url",
                                href,
                                target: "_blank",
                            })
                        }
                        placeholder="https://example.com"
                    />
                </Field>
            ) : null}
        </>
    );
}

function FormFieldEditor({
    field,
    fieldCount,
    onUpdate,
    onChangeType,
    onRemove,
    onAddOption,
    onUpdateOption,
    onRemoveOption,
}: {
    field: FormField;
    fieldCount: number;
    onUpdate: (patch: Partial<FormField>) => void;
    onChangeType: (type: FormFieldType) => void;
    onRemove: () => void;
    onAddOption: () => void;
    onUpdateOption: (
        index: number,
        patch: Partial<FormFieldOption>,
    ) => void;
    onRemoveOption: (index: number) => void;
}) {
    const [open, setOpen] = useState(true);
    const canRemove = fieldCount > 1;

    return (
        <Collapsible
            open={open}
            onOpenChange={(next) => setOpen(next)}
            className="rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)]"
        >
            <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                <CollapsibleTrigger
                    render={
                        <button
                            type="button"
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
                        >
                            <ChevronDownIcon
                                className={cn(
                                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                    !open && "-rotate-90",
                                )}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-medium text-[color:var(--ink-strong)]">
                                    {field.label || "Untitled field"}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] capitalize text-[color:var(--ink-2)]">
                                    {field.type}
                                    {field.placeholder
                                        ? ` · ${field.placeholder}`
                                        : ""}
                                </span>
                            </span>
                        </button>
                    }
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={onRemove}
                    disabled={!canRemove}
                    aria-label="Remove field"
                    title="Remove field"
                >
                    <Trash2Icon className="size-3.5" />
                </Button>
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
                <div className="px-2 pb-2">
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Label">
                            <TextInput
                                value={field.label}
                                onChange={(label) => onUpdate({ label })}
                            />
                        </Field>
                        <Field label="Type">
                            <Choice
                                value={field.type}
                                options={FORM_FIELD_TYPES}
                                onChange={onChangeType}
                            />
                        </Field>
                    </div>
                    <Field label="Placeholder">
                        <TextInput
                            value={field.placeholder ?? ""}
                            onChange={(placeholder) =>
                                onUpdate({
                                    placeholder: placeholder || undefined,
                                })
                            }
                            placeholder="Defaults to label"
                        />
                    </Field>
                    {field.type === "dropdown" ? (
                        <div className="mb-2 rounded-md border border-dashed border-[color:var(--line-soft)] p-2">
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                                    Options
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[11px]"
                                    onClick={onAddOption}
                                >
                                    + Add
                                </Button>
                            </div>
                            {(field.options ?? []).map((opt, index) => (
                                <div
                                    key={index}
                                    className="mb-1 flex items-center gap-1"
                                >
                                    <Input
                                        value={opt.label}
                                        placeholder="Label"
                                        onChange={(e) =>
                                            onUpdateOption(index, {
                                                label: e.target.value,
                                            })
                                        }
                                        className={fieldClass}
                                    />
                                    <Input
                                        value={opt.value}
                                        placeholder="Value"
                                        onChange={(e) =>
                                            onUpdateOption(index, {
                                                value: e.target.value,
                                            })
                                        }
                                        className={fieldClass}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-7 shrink-0 text-destructive hover:text-destructive"
                                        onClick={() => onRemoveOption(index)}
                                        disabled={
                                            (field.options ?? []).length <= 1
                                        }
                                        aria-label="Remove option"
                                        title="Remove option"
                                    >
                                        <Trash2Icon className="size-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {/* The per-field "Required" toggle is intentionally
                        not surfaced in the editor — every field is treated
                        as optional. The schema still carries `required`
                        (default false) for forward-compat. */}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function FormWidgetFields({
    widget,
    onChange,
    steps,
    coverStepId,
    themeId,
    demoId,
    imageAssets,
    uploadImage,
}: {
    widget: FormWidget;
    onChange: (next: FormWidget) => void;
    steps: ReadonlyArray<{ id: string; label: string }>;
    coverStepId: string;
    themeId?: string;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    uploadImage: (
        file: File,
    ) => Promise<{
        path: string;
        src: string;
        width: number;
        height: number;
    } | null>;
}) {
    const set = (patch: Partial<FormWidget>) =>
        onChange({ ...widget, ...patch });
    const ctaDefaults = ctaThemeDefaults(themeId);

    const [logoPickerOpen, setLogoPickerOpen] = useState(false);
    const logoName = widget.logo
        ? assetNameForUrl(widget.logo.src, imageAssets, demoId)
        : "";

    const updateField = (id: string, patch: Partial<FormField>) =>
        set({
            fields: widget.fields.map((f) =>
                f.id === id ? { ...f, ...patch } : f,
            ),
        });

    const addField = () =>
        set({
            fields: [
                ...widget.fields,
                {
                    id: generateId("field"),
                    label: "New field",
                    type: "text",
                    required: false,
                },
            ],
        });

    const removeField = (id: string) => {
        if (widget.fields.length <= 1) return;
        set({ fields: widget.fields.filter((f) => f.id !== id) });
    };

    const changeFieldType = (id: string, type: FormFieldType) => {
        // Dropdown requires `options` (schema-enforced — at least 1
        // option). Seed a default pair so flipping the type doesn't
        // immediately invalidate the config and crash the editor.
        if (type === "dropdown") {
            updateField(id, {
                type,
                options: [
                    { value: "option-1", label: "Option 1" },
                    { value: "option-2", label: "Option 2" },
                ],
            });
            return;
        }
        // Drop `options` when switching back to text — leaving them
        // attached is valid but noisy in the serialized config.
        set({
            fields: widget.fields.map((f) => {
                if (f.id !== id) return f;
                const { options: _drop, ...rest } = f;
                void _drop;
                return { ...rest, type } as FormField;
            }),
        });
    };

    const addOption = (fieldId: string) => {
        const f = widget.fields.find((x) => x.id === fieldId);
        if (!f) return;
        const opts = f.options ?? [];
        const next: FormFieldOption = {
            value: `option-${opts.length + 1}`,
            label: `Option ${opts.length + 1}`,
        };
        updateField(fieldId, { options: [...opts, next] });
    };

    const updateOption = (
        fieldId: string,
        index: number,
        patch: Partial<FormFieldOption>,
    ) => {
        const f = widget.fields.find((x) => x.id === fieldId);
        if (!f?.options) return;
        const next = f.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
        updateField(fieldId, { options: next });
    };

    const removeOption = (fieldId: string, index: number) => {
        const f = widget.fields.find((x) => x.id === fieldId);
        if (!f?.options || f.options.length <= 1) return;
        updateField(fieldId, {
            options: f.options.filter((_, i) => i !== index),
        });
    };

    return (
        <>
            <Field label="Logo">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setLogoPickerOpen(true)}
                        className={cn(
                            "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-left text-[12.5px] shadow-[var(--shadow-press)] hover:border-[color:var(--accent)]",
                        )}
                    >
                        <ImageIcon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                        <span className="truncate text-[color:var(--ink-1)]">
                            {widget.logo ? logoName || "Logo" : "Add a logo…"}
                        </span>
                    </button>
                    {widget.logo ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-destructive hover:text-destructive"
                            aria-label="Remove logo"
                            title="Remove logo"
                            onClick={() => {
                                const { logo: _drop, ...rest } = widget;
                                void _drop;
                                onChange(rest as FormWidget);
                            }}
                        >
                            <Trash2Icon className="size-3.5" />
                        </Button>
                    ) : null}
                </div>
            </Field>
            <MediaAssetPickerDialog
                open={logoPickerOpen}
                onOpenChange={setLogoPickerOpen}
                title="Logo"
                mediaKind="image"
                currentSrc={widget.logo?.src ?? ""}
                assets={imageAssets}
                demoId={demoId}
                uploadMedia={uploadImage}
                onPick={(r) => {
                    const nextLogo: HeadlineLogo = {
                        src: r.src,
                        ...(r.alt ? { alt: r.alt } : {}),
                        ...(widget.logo?.height
                            ? { height: widget.logo.height }
                            : {}),
                    };
                    set({ logo: nextLogo });
                }}
            />
            <Field label="Title">
                <TextInput
                    value={widget.title ?? ""}
                    onChange={(v) => set({ title: v || undefined })}
                />
            </Field>
            <Field label="Description">
                <TextInput
                    value={widget.description ?? ""}
                    onChange={(v) => set({ description: v || undefined })}
                />
            </Field>
            <InspectorCollapsibleSection title="Image">
                <WidgetImageField
                    image={widget.image}
                    onChange={(next) => set({ image: next })}
                    demoId={demoId}
                    imageAssets={imageAssets}
                    uploadImage={uploadImage}
                />
            </InspectorCollapsibleSection>

            <InspectorCollapsibleSection title="Fields">
                <ul className="space-y-2">
                    {widget.fields.map((field) => (
                        <li key={field.id}>
                            <FormFieldEditor
                                field={field}
                                fieldCount={widget.fields.length}
                                onUpdate={(patch) =>
                                    updateField(field.id, patch)
                                }
                                onChangeType={(type) =>
                                    changeFieldType(field.id, type)
                                }
                                onRemove={() => removeField(field.id)}
                                onAddOption={() => addOption(field.id)}
                                onUpdateOption={(index, patch) =>
                                    updateOption(field.id, index, patch)
                                }
                                onRemoveOption={(index) =>
                                    removeOption(field.id, index)
                                }
                            />
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="mt-2 flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-[color:var(--line)] bg-transparent text-[12px] font-medium text-[color:var(--ink-2)] outline-none transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--ink-strong)] focus-visible:border-[color:var(--accent)]"
                    onClick={addField}
                >
                    <PlusIcon className="size-3.5" />
                    Add new field
                </button>
            </InspectorCollapsibleSection>

            <InspectorCollapsibleSection
                title="Submit button"
                defaultOpen={false}
            >
                <Field label="Label">
                    <TextInput
                        value={widget.submit.label}
                        onChange={(v) =>
                            set({
                                submit: {
                                    ...widget.submit,
                                    label: v || "Submit",
                                },
                            })
                        }
                    />
                </Field>
                <CtaActionEditor
                    value={widget.submit.action}
                    onChange={(action) =>
                        set({ submit: { ...widget.submit, action } })
                    }
                    steps={steps}
                    excludeStepId={coverStepId}
                />
                <CtaAnimationEditor
                    value={widget.submit.animation}
                    onChange={(animation) =>
                        set({ submit: { ...widget.submit, animation } })
                    }
                />
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Background">
                        <ColorOverrideControl
                            value={widget.submit.background}
                            defaultColor={ctaDefaults.background}
                            onChange={(background) =>
                                set({
                                    submit: { ...widget.submit, background },
                                })
                            }
                            onRemove={() =>
                                set({
                                    submit: {
                                        ...widget.submit,
                                        background: undefined,
                                    },
                                })
                            }
                        />
                    </Field>
                    <Field label="Text color">
                        <ColorOverrideControl
                            value={widget.submit.textColor}
                            defaultColor={ctaDefaults.textColor}
                            onChange={(textColor) =>
                                set({
                                    submit: { ...widget.submit, textColor },
                                })
                            }
                            onRemove={() =>
                                set({
                                    submit: {
                                        ...widget.submit,
                                        textColor: undefined,
                                    },
                                })
                            }
                        />
                    </Field>
                </div>
            </InspectorCollapsibleSection>
        </>
    );
}

export function EmbedWidgetFields({
    widget,
    onChange,
}: {
    widget: EmbedWidget;
    onChange: (next: EmbedWidget) => void;
}) {
    const set = (patch: Partial<EmbedWidget>) =>
        onChange({ ...widget, ...patch });
    return (
        <Field label="Source URL">
            <TextInput
                value={widget.src}
                onChange={(v) => set({ src: v })}
                placeholder="https://…"
            />
        </Field>
    );
}

/**
 * Media widget editor — the surface deliberately exposes a single
 * control: a Select listing every image asset already uploaded to
 * this demo (plus an Upload button). Title / description / alt /
 * natural-width / natural-height live in the schema for runtime
 * rendering, but the editor never asks for them — alt defaults to
 * the file name, dimensions are measured from the picked image, and
 * title/description on a media cell are unused in practice.
 */
export type MediaPickResult = {
    src: string;
    alt: string;
    naturalWidth?: number;
    naturalHeight?: number;
    mediaKind: "image" | "video" | "audio";
};

export type MediaUploader = (
    file: File,
) => Promise<{
    asset?: AssetMeta;
    path: string;
    src: string;
    width: number;
    height: number;
} | null>;

/**
 * Reusable picker dialog used wherever the editor needs to swap a
 * media asset — this is the single canonical asset picker; every
 * upload/select surface in the editor routes through it. `mediaKind`
 * scopes what the dialog accepts: `"image"`, `"video"`, or `"audio"` lock
 * it to one kind, while `"media"` accepts image or video (used by step
 * insertion). Thumbnails, the dimension probe, and the
 * reported pick kind are derived per-asset, so a `"media"` picker can
 * mix images and videos in one grid. Caller controls open state and
 * receives the chosen asset (or a freshly uploaded one) via `onPick`.
 */
export function MediaAssetPickerDialog({
    open,
    onOpenChange,
    title,
    mediaKind,
    currentSrc,
    assets,
    demoId,
    uploadMedia,
    onPick,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    mediaKind: "image" | "video" | "audio" | "media";
    currentSrc: string;
    assets: ReadonlyArray<AssetMeta>;
    demoId: string;
    uploadMedia: MediaUploader;
    onPick: (result: MediaPickResult) => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);

    const acceptAttr =
        mediaKind === "video"
            ? "video/*"
            : mediaKind === "image"
              ? "image/*"
              : mediaKind === "audio"
                ? "audio/*"
                : "image/*,video/*";
    const uploadHint =
        mediaKind === "video"
            ? "MP4, WebM, or MOV"
            : mediaKind === "image"
              ? "PNG, JPG, GIF, or WebP"
              : mediaKind === "audio"
                ? "MP3, WAV, M4A, or OGG"
                : "Image or video";
    const uploadLabel =
        mediaKind === "video"
            ? "Upload a new video"
            : mediaKind === "image"
              ? "Upload a new image"
              : mediaKind === "audio"
                ? "Upload a new audio file"
                : "Upload a new image or video";

    useEffect(() => {
        if (!open) return;
        const match = findAssetReferenceEntry(assets, currentSrc);
        const nextSelectedPath = match?.path ?? null;
        setSelectedPath(nextSelectedPath);
        setQuery("");
        const selectedIndex = nextSelectedPath
            ? assets.findIndex((asset) => asset.path === nextSelectedPath)
            : -1;
        setPage(
            selectedIndex >= 0
                ? Math.floor(selectedIndex / ASSET_PICKER_PAGE_SIZE)
                : 0,
        );
    }, [open, assets, currentSrc]);

    const normalizedQuery = query.trim().toLowerCase();
    const visibleAssets = useMemo(() => {
        if (!normalizedQuery) return assets;
        return assets.filter((a) => {
            const name = a.path.split("/").pop() ?? a.path;
            return (
                name.toLowerCase().includes(normalizedQuery) ||
                a.path.toLowerCase().includes(normalizedQuery)
            );
        });
    }, [assets, normalizedQuery]);
    const pageCount = Math.max(
        1,
        Math.ceil(visibleAssets.length / ASSET_PICKER_PAGE_SIZE),
    );
    const currentPage = Math.min(page, pageCount - 1);
    const pageStart = currentPage * ASSET_PICKER_PAGE_SIZE;
    const pageAssets = useMemo(
        () =>
            visibleAssets.slice(
                pageStart,
                pageStart + ASSET_PICKER_PAGE_SIZE,
            ),
        [visibleAssets, pageStart],
    );
    const showingStart = visibleAssets.length === 0 ? 0 : pageStart + 1;
    const showingEnd = Math.min(
        visibleAssets.length,
        pageStart + pageAssets.length,
    );

    useEffect(() => {
        setPage(0);
    }, [normalizedQuery, mediaKind]);

    useEffect(() => {
        if (page < pageCount) return;
        setPage(pageCount - 1);
    }, [page, pageCount]);

    const measure = async (url: string, asVideo: boolean) =>
        asVideo ? measureVideoUrl(url) : measureImageUrl(url);

    const applyAsset = async (asset: AssetMeta) => {
        if (!asset.id) return;
        const displaySrc = assetDisplayUrl(demoId, asset);
        const src = `asset:${asset.id}`;
        const fileName = asset.path.split("/").pop() ?? asset.path;
        const assetIsAudio = isAudioAsset(asset);
        const assetIsVideo = isVideoAsset(asset);
        // Audio has no visual dimensions to probe.
        const dims = assetIsAudio
            ? null
            : await measure(displaySrc, assetIsVideo).catch(() => null);
        onPick({
            src,
            alt: fileName,
            naturalWidth: dims?.width,
            naturalHeight: dims?.height,
            mediaKind: assetIsAudio ? "audio" : assetIsVideo ? "video" : "image",
        });
        onOpenChange(false);
    };

    const handleConfirm = () => {
        const asset = assets.find((a) => a.path === selectedPath);
        if (asset) void applyAsset(asset);
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const result = await uploadMedia(file);
            if (!result) return;
            onPick({
                src: result.src,
                alt: file.name,
                naturalWidth: result.width,
                naturalHeight: result.height,
                mediaKind: file.type.startsWith("video/")
                    ? "video"
                    : file.type.startsWith("audio/")
                      ? "audio"
                      : "image",
            });
            onOpenChange(false);
        } finally {
            setUploading(false);
        }
    };

    const handleDroppedFiles = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        const accepts = (type: string) =>
            mediaKind === "video"
                ? type.startsWith("video/")
                : mediaKind === "image"
                  ? type.startsWith("image/")
                  : mediaKind === "audio"
                    ? type.startsWith("audio/")
                    : type.startsWith("image/") || type.startsWith("video/");
        const file = Array.from(fileList).find((f) => accepts(f.type));
        if (file) void handleUpload(file);
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                hidden
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleUpload(f);
                }}
            />
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="grid h-[min(680px,calc(100vh-2rem))] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:max-w-[640px]"
                    onDragOver={(e) => {
                        e.preventDefault();
                        if (!dragOver) setDragOver(true);
                    }}
                    onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node))
                            return;
                        setDragOver(false);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        handleDroppedFiles(e.dataTransfer.files);
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--ink-3)]" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search assets…"
                            className="pl-7"
                        />
                    </div>
                    <div className="flex h-7 items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span>
                            {visibleAssets.length === 0
                                ? "No matching assets"
                                : `Showing ${showingStart}-${showingEnd} of ${visibleAssets.length}`}
                        </span>
                        {pageCount > 1 ? (
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={currentPage === 0}
                                    onClick={() =>
                                        setPage((p) => Math.max(0, p - 1))
                                    }
                                    aria-label="Previous asset page"
                                    title="Previous page"
                                >
                                    <ArrowLeftIcon className="size-3" />
                                </Button>
                                <span className="min-w-12 text-center tabular-nums">
                                    {currentPage + 1} / {pageCount}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={currentPage >= pageCount - 1}
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(pageCount - 1, p + 1),
                                        )
                                    }
                                    aria-label="Next asset page"
                                    title="Next page"
                                >
                                    <ArrowRightIcon className="size-3" />
                                </Button>
                            </div>
                        ) : null}
                    </div>
                    <div
                        className={cn(
                            "grid min-h-0 auto-rows-[132px] grid-cols-2 content-start gap-2 overflow-y-auto rounded-md pr-1 transition sm:grid-cols-3",
                            dragOver &&
                                "ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--surface)]",
                        )}
                    >
                        {pageAssets.map((a) => {
                            const url = assetDisplayUrl(demoId, a);
                            const name = a.path.split("/").pop() ?? a.path;
                            const selected = a.path === selectedPath;
                            const assetIsAudio = isAudioAsset(a);
                            const assetIsVideo = isVideoAsset(a);
                            return (
                                <button
                                    key={a.path}
                                    type="button"
                                    onClick={() => setSelectedPath(a.path)}
                                    onDoubleClick={() => void applyAsset(a)}
                                    title={name}
                                    className={cn(
                                        "group flex h-full min-w-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-md border bg-[color:var(--surface-2)] p-1 text-left transition hover:border-[color:var(--accent)]",
                                        selected
                                            ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]"
                                            : "border-[color:var(--line)]",
                                    )}
                                >
                                    <div className="relative h-[104px] w-full shrink-0 overflow-hidden rounded-sm bg-[color:var(--surface)]">
                                        {assetIsAudio ? (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <Music2Icon className="size-5 text-[color:var(--ink-3)]" />
                                            </div>
                                        ) : url ? (
                                            assetIsVideo ? (
                                                <video
                                                    src={url}
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                />
                                            ) : (
                                                <img
                                                    src={url}
                                                    alt={name}
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="absolute inset-0 h-full w-full object-cover"
                                                />
                                            )
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <ImageIcon className="size-5 text-[color:var(--ink-3)]" />
                                            </div>
                                        )}
                                    </div>
                                    <span className="block h-4 min-w-0 truncate px-0.5 text-[11px] leading-4 text-[color:var(--ink-2)]">
                                        {name}
                                    </span>
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            title={uploadLabel}
                            className={cn(
                                "group flex h-full min-w-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-md border border-dashed bg-[color:var(--surface-2)] p-1 text-left transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60",
                                "border-[color:var(--line)]",
                            )}
                        >
                            <div className="relative flex h-[104px] w-full shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[color:var(--surface)] text-[color:var(--ink-2)] group-hover:text-[color:var(--ink-1)]">
                                <UploadCloudIcon className="size-5" />
                            </div>
                            <span className="block h-4 min-w-0 truncate px-0.5 text-[11px] leading-4 text-[color:var(--ink-2)]">
                                {uploading ? "Uploading…" : uploadHint}
                            </span>
                        </button>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            disabled={!selectedPath}
                            onClick={handleConfirm}
                        >
                            Select
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Horizontal toolbar pinned below the stage. Holds per-step settings
 * (duration, advance trigger, "+ Zoom" entry point) and the
 * "add annotation" actions. Once a zoom transform exists the preview /
 * edit / trash controls live in a floating pill on the stage, not here.
 */
