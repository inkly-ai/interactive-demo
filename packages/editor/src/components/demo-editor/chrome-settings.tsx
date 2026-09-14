import { useState, type CSSProperties, type ReactNode } from "react";
import {
    ChevronDownIcon,
    ChevronRightIcon,
    PanelBottomIcon,
    PanelTopIcon,
    RectangleHorizontalIcon,
    ImageIcon,
    MessageSquareIcon,
    PaletteIcon,
    PencilIcon,
    PlusIcon,
    SettingsIcon,
    TagIcon,
    UploadCloudIcon,
    VideoIcon,
    XIcon,
} from "lucide-react";
import {
    ChromeSchema,
    resolveControlsMode,
    type Chrome,
    type ControlsMode,
    type DemoBackground,
    type DemoBrand,
    type Message,
    type Step,
} from "@inkly-org/interactive-demo";
import { demoThemePresets } from "@inkly-org/interactive-demo/themes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
    ColorSwatchInput,
    Field,
    SectionLabel,
    SliderInput,
} from "@/components/demo-editor/inputs";
import {
    DEFAULT_DEMO_BACKGROUND_COLOR,
    MAX_DEMO_BACKGROUND_BLUR,
    resolveDemoBackground,
} from "@/lib/demo-background";
import { type AssetMeta } from "@/lib/assets";
import { resolveAssetReference } from "@/lib/assets/resolve";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    MediaAssetPickerDialog,
    type MediaUploader,
} from "@/components/demo-editor/inspectors";
import { assetNameForUrl } from "@/components/demo-editor/factories";
import {
    GRADIENT_BACKGROUND_PRESETS,
    SOLID_BACKGROUND_PRESETS,
} from "@/components/demo-editor/background-presets";

/**
 * The editor reads chrome out of the raw demoConfig literal (no Zod
 * parse), so the schema defaults aren't filled in for us — resolve them
 * here by asking the schema directly. Stays in sync with the package
 * automatically if a new chrome field is added.
 */
export const CHROME_DEFAULTS: Required<Chrome> = ChromeSchema.parse({}) as Required<Chrome>;

export function resolveChrome(chrome: Chrome | undefined): Required<Chrome> {
    return { ...CHROME_DEFAULTS, ...(chrome ?? {}) };
}

type IconTabTooltip = {
    title: string;
    subtitle: string;
};

function IconTabTooltipContent({ title, subtitle }: IconTabTooltip) {
    return (
        <span className="block max-w-[220px] text-left">
            <span className="block font-semibold leading-4">{title}</span>
            <span className="mt-0.5 block leading-4 opacity-80">
                {subtitle}
            </span>
        </span>
    );
}

/**
 * Footer dropdown that opens the right-pane settings panels — demo
 * (player chrome) or step (per-step authoring). The panels live in the
 * sidebar, not a modal, so authors can keep the stage visible while
 * tweaking flags.
 */
export function SettingsMenuButton({
    onOpenDemoSettings,
    onOpenStepSettings,
    onOpenEdit,
    editDisabled = false,
    compact,
}: {
    onOpenDemoSettings: () => void;
    onOpenStepSettings: () => void;
    /** Open the crop/align dialog for the active step's background.
     *  Omit on cover steps where the dialog doesn't apply. */
    onOpenEdit?: () => void;
    /** Keep the edit action visible but unavailable for unsupported step types. */
    editDisabled?: boolean;
    /** Hide the label — icon-only. Used on video steps where the footer
     *  scrubber needs the horizontal room. */
    compact?: boolean;
}) {
    const trigger = (
        <DropdownMenuTrigger
            render={
                <Button
                    type="button"
                    variant="ghost"
                    size="default"
                    className="hover:bg-[color:var(--sidebar)]"
                    title={compact ? undefined : "Settings"}
                >
                    <SettingsIcon className="size-4" />
                    {!compact ? (
                        <span className="hidden lg:inline">Settings</span>
                    ) : null}
                </Button>
            }
        />
    );

    return (
        <DropdownMenu>
            {compact ? (
                <SimpleTooltip content="Settings" side="top">
                    {trigger}
                </SimpleTooltip>
            ) : (
                trigger
            )}
            <DropdownMenuContent align="center" sideOffset={6} className="w-64">
                <DropdownMenuItem onClick={onOpenDemoSettings}>
                    <PaletteIcon className="size-4" />
                    <SettingsMenuItemBody
                        title="Demo settings"
                        subtitle="Player and theme"
                    />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenStepSettings}>
                    <SettingsIcon className="size-4" />
                    <SettingsMenuItemBody
                        title="Step settings"
                        subtitle="Media and messages"
                    />
                </DropdownMenuItem>
                {onOpenEdit ? (
                    <DropdownMenuItem
                        disabled={editDisabled}
                        onClick={editDisabled ? undefined : onOpenEdit}
                    >
                        <PencilIcon className="size-4" />
                        <SettingsMenuItemBody
                            title="Edit Step Asset"
                            subtitle={
                                editDisabled
                                    ? "Unavailable"
                                    : "Edit media"
                            }
                        />
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function SettingsMenuItemBody({
    title,
    subtitle,
}: {
    title: string;
    subtitle: string;
}) {
    return (
        <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-4">
                {title}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-muted-foreground">
                {subtitle}
            </span>
        </span>
    );
}

/**
 * Right-pane editor for demo-level player chrome flags. Same set of
 * toggles the legacy "Player chrome" modal used to host.
 */
export function DemoSettingsInspector({
    title,
    onTitleCommit,
    subtitle,
    onSubtitleCommit,
    background,
    backgroundColor,
    onBackgroundChange,
    themeId,
    themePrimary,
    onThemePrimaryChange,
    brand,
    onBrandChange,
    chrome,
    onChange,
    demoId,
    assets,
    uploadImage,
}: {
    title: string | undefined;
    onTitleCommit: (next: string | undefined) => void;
    subtitle: string | undefined;
    onSubtitleCommit: (next: string | undefined) => void;
    background: DemoBackground | undefined;
    backgroundColor: string | undefined;
    onBackgroundChange: (next: DemoBackground | undefined) => void;
    /** Active theme preset id (resolved — never undefined). */
    themeId: string;
    themePrimary: string | undefined;
    onThemePrimaryChange: (next: string | undefined) => void;
    brand: DemoBrand | undefined;
    onBrandChange: (patch: Partial<DemoBrand>) => void;
    chrome: Chrome | undefined;
    onChange: (next: Chrome) => void;
    demoId: string;
    assets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
}) {
    const resolved = resolveChrome(chrome);
    const themePreset = demoThemePresets.find((preset) => preset.id === themeId);
    const themePrimaryFallback = themePreset?.theme.primary ?? "#5b3df5";
    const setField = (patch: Partial<Required<Chrome>>) => {
        onChange({ ...resolved, ...patch });
    };
    return (
        <div className="grid gap-3">
            <OptionalTextField
                label="Demo title"
                placeholder="Untitled demo"
                value={title}
                onCommit={onTitleCommit}
            />
            <OptionalMultilineTextField
                label="Demo subtitle"
                placeholder="Short paragraph shown alongside the title"
                value={subtitle}
                onCommit={onSubtitleCommit}
            />
            <ChromeSegmentRow
                label="Header"
                value={resolved.hideHeader}
                onChange={(v) => setField({ hideHeader: v })}
                visibleIcon={<PanelTopIcon className="size-4" />}
                hiddenIcon={<XIcon className="size-4" />}
                infoTooltip="Show or hide the browser-style title bar at the top of the player."
                visibleTooltip={{
                    title: "Show header",
                    subtitle: "Show the browser-style player header.",
                }}
                hiddenTooltip={{
                    title: "Hide header",
                    subtitle: "Hide the browser-style player header.",
                }}
            />
            <ChromeSegmentRow
                label="Built-with badge"
                value={!resolved.branding}
                onChange={(hidden) => setField({ branding: !hidden })}
                visibleIcon={<TagIcon className="size-4" />}
                hiddenIcon={<XIcon className="size-4" />}
                infoTooltip={'Show or hide the small "Built with Inkly" link in the player\'s corner.'}
                visibleTooltip={{
                    title: "Show badge",
                    subtitle: "Show the Built with Inkly link in the player.",
                }}
                hiddenTooltip={{
                    title: "Hide badge",
                    subtitle: "Hide the Built with Inkly link.",
                }}
            />
            <PlayerControlsSegmentRow
                value={resolveControlsMode(resolved)}
                onChange={(mode) =>
                    setField({
                        controls: mode,
                        // Keep the legacy boolean consistent for any reader
                        // that only knows `hideControls`.
                        hideControls: mode === "hidden",
                    })
                }
            />
            {/* <ChromeSegmentRow
                label="Mobile message bar"
                value={resolved.mobileFooterMessage}
                onChange={(v) => setField({ mobileFooterMessage: v })}
                visibleIcon={<MessageSquareIcon className="size-4" />}
                hiddenIcon={<PanelBottomIcon className="size-4" />}
                infoTooltip="On narrow viewports, switch messages from the stage to a footer with step navigation."
                visibleTooltip={{
                    title: "Use in-stage messages",
                    subtitle: "Keep messages on the canvas.",
                }}
                hiddenTooltip={{
                    title: "Use mobile message bar",
                    subtitle: "Use a bottom bar on mobile.",
                }}
            /> */}
            <div className="grid gap-3">
                <SectionLabel>Design</SectionLabel>
                <div className="grid gap-1.5">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                            Primary color
                        </span>
                        {themePrimary ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-[color:var(--ink-strong)]"
                                onClick={() => onThemePrimaryChange(undefined)}
                            >
                                <XIcon className="mr-1 size-3" />
                                Reset
                            </Button>
                        ) : null}
                    </div>
                    <ColorSwatchInput
                        value={themePrimary}
                        fallback={themePrimaryFallback}
                        onChange={onThemePrimaryChange}
                    />
                </div>
                <BackgroundPicker
                    background={background}
                    backgroundColor={backgroundColor}
                    onChange={onBackgroundChange}
                    demoId={demoId}
                    assets={assets}
                    uploadImage={uploadImage}
                    themeId={themeId}
                />
            </div>
            <HeaderSection
                brand={brand}
                onBrandChange={onBrandChange}
                demoId={demoId}
                assets={assets}
                uploadImage={uploadImage}
            />
        </div>
    );
}

function SettingsCollapsibleSection({
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
                            className="flex shrink-0 cursor-pointer items-center gap-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground transition hover:text-[color:var(--ink-strong)]"
                        >
                            {title}
                            <ChevronDownIcon
                                className={cn(
                                    "size-3 transition-transform duration-150",
                                    !open && "-rotate-90",
                                )}
                            />
                        </button>
                    }
                />
                <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
            </div>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
                <div className="grid min-w-0 gap-3">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function HeaderSection({
    brand,
    onBrandChange,
    demoId,
    assets,
    uploadImage,
}: {
    brand: DemoBrand | undefined;
    onBrandChange: (patch: Partial<DemoBrand>) => void;
    demoId: string;
    assets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
}) {
    const [logoPickerOpen, setLogoPickerOpen] = useState(false);
    const imageAssets = assets.filter((asset) =>
        asset.contentType.startsWith("image/"),
    );
    const logo = brand?.logo ?? "";
    const logoDisplaySrc = logo
        ? (resolveAssetReference(imageAssets, logo) ?? logo)
        : "";
    return (
        <SettingsCollapsibleSection title="Header" defaultOpen={false}>
            <div className="grid min-w-0 gap-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                    Logo
                </span>
                {logo ? (
                    <div className="flex min-w-0 items-center gap-2 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2 shadow-[var(--shadow-press)]">
                        <img
                            src={logoDisplaySrc}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-md border border-[color:var(--line)] object-contain"
                            draggable={false}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[color:var(--ink-1)]">
                            {assetNameForUrl(logo, imageAssets, demoId) || logo}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-[color:var(--ink-strong)]"
                            onClick={() => onBrandChange({ logo: undefined })}
                        >
                            <XIcon className="mr-1 size-3" />
                            Remove
                        </Button>
                    </div>
                ) : null}
                <Button
                    type="button"
                    variant="flat"
                    size="default"
                    className="w-full gap-1.5"
                    onClick={() => setLogoPickerOpen(true)}
                >
                    <UploadCloudIcon className="size-3.5" />
                    {logo ? "Replace logo" : "Add logo"}
                </Button>
                <MediaAssetPickerDialog
                    open={logoPickerOpen}
                    onOpenChange={setLogoPickerOpen}
                    title="Upload logo"
                    mediaKind="image"
                    currentSrc={logo}
                    assets={imageAssets}
                    demoId={demoId}
                    uploadMedia={uploadImage}
                    onPick={(result) => onBrandChange({ logo: result.src })}
                />
            </div>
            <OptionalUrlField
                label="Logo link"
                placeholder="https://example.com"
                value={brand?.logoHref}
                onCommit={(logoHref) => onBrandChange({ logoHref })}
            />
        </SettingsCollapsibleSection>
    );
}

function BackgroundPicker({
    background,
    backgroundColor,
    onChange,
    demoId,
    assets,
    uploadImage,
    themeId,
}: {
    background: DemoBackground | undefined;
    backgroundColor: string | undefined;
    onChange: (next: DemoBackground | undefined) => void;
    demoId: string;
    assets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
    themeId: string;
}) {
    const hasOverride = Boolean(background || backgroundColor);
    const resolved = resolveDemoBackground({ background, backgroundColor });
    const mode = hasOverride ? resolved.type : "theme";
    const solidColor =
        resolved.type === "color" && resolved.color
            ? resolved.color
            : backgroundColor ?? DEFAULT_DEMO_BACKGROUND_COLOR;
    const gradient =
        resolved.type === "color" && resolved.from && resolved.to
            ? { from: resolved.from, to: resolved.to }
            : {
                  from: GRADIENT_BACKGROUND_PRESETS[0].from,
                  to: GRADIENT_BACKGROUND_PRESETS[0].to,
              };
    const colorMode =
        resolved.type === "color" && resolved.from && resolved.to
            ? "gradient"
            : "solid";
    const imageSrc = resolved.type === "image" ? resolved.src ?? "" : "";
    const imageBlur =
        resolved.type === "image" && typeof resolved.blur === "number"
            ? Math.min(MAX_DEMO_BACKGROUND_BLUR, Math.max(0, resolved.blur))
            : 0;
    const [imagePickerOpen, setImagePickerOpen] = useState(false);
    const imageAssets = assets.filter((asset) =>
        asset.contentType.startsWith("image/"),
    );

    const setMode = (next: DemoBackground["type"]) => {
        if (next === "none") {
            onChange({ type: "none" });
        } else if (next === "color") {
            onChange({ type: "color", color: solidColor });
        } else {
            // An image background needs an image: open the picker and let
            // `setImageBackground` commit the override once one is chosen.
            setImagePickerOpen(true);
        }
    };

    const startBackgroundOverride = () => {
        onChange({ type: "color", color: solidColor });
    };

    const setImageBackground = (src: string, alt?: string) => {
        onChange(
            withOptionalBackgroundBlur(
                { type: "image", src, alt },
                imageBlur,
            ),
        );
    };

    const setImageBlur = (blur: number) => {
        if (resolved.type !== "image") return;
        onChange(withOptionalBackgroundBlur({ ...resolved }, blur));
    };

    return (
        <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                    Background
                </span>
                {hasOverride ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-[color:var(--ink-strong)]"
                        onClick={() => onChange(undefined)}
                    >
                        <XIcon className="mr-1 size-3" />
                        Cancel override
                    </Button>
                ) : null}
            </div>

            {!hasOverride ? (
                <div className="grid min-w-0 gap-2 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2.5 shadow-[var(--shadow-press)]">
                    <div className="flex min-w-0 items-center gap-2">
                        <span
                            aria-hidden
                            className="h-8 w-12 shrink-0 rounded-md border border-[color:var(--line)]"
                            style={{
                                background:
                                    "linear-gradient(135deg, color-mix(in oklab, var(--accent) 20%, var(--surface)), var(--surface-2))",
                            }}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-[color:var(--ink-strong)]">
                                Theme default
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-[color:var(--ink-2)]">
                                {themeId} demo background
                            </span>
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="flat"
                        className="w-full"
                        onClick={startBackgroundOverride}
                    >
                        Override background
                    </Button>
                </div>
            ) : null}

            {hasOverride ? (
                <Tabs
                    className="min-w-0"
                    value={mode}
                    onValueChange={(next) => {
                        if (
                            next === "none" ||
                            next === "color" ||
                            next === "image"
                        ) {
                            setMode(next);
                        }
                    }}
                >
                    <TabsList className="min-w-0 w-full">
                        <TabsTrigger value="none" className="flex-1 gap-1.5">
                            <span
                                aria-hidden
                                className="grid size-3.5 place-items-center rounded-full border border-current text-[9px]"
                            >
                                /
                            </span>
                            None
                        </TabsTrigger>
                        <TabsTrigger value="color" className="flex-1 gap-1.5">
                            <PaletteIcon className="size-3.5" />
                            Color
                        </TabsTrigger>
                        <TabsTrigger value="image" className="flex-1 gap-1.5">
                            <ImageIcon className="size-3.5" />
                            Image
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            ) : null}

            {hasOverride && mode === "none" ? (
                <div className="rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] px-3 py-2.5 text-[12px] leading-snug text-[color:var(--ink-2)]">
                    Uses the default dotted gray brand canvas outside the
                    player.
                </div>
            ) : null}

            {hasOverride && mode === "color" ? (
                <div className="grid min-w-0 gap-2">
                    <Tabs
                        className="min-w-0"
                        value={colorMode}
                        onValueChange={(next) => {
                            if (next === "solid") {
                                onChange({ type: "color", color: solidColor });
                            } else if (next === "gradient") {
                                onChange({
                                    type: "color",
                                    from: gradient.from,
                                    to: gradient.to,
                                });
                            }
                        }}
                    >
                        <TabsList className="min-w-0 w-full">
                            <TabsTrigger value="solid" className="flex-1 gap-1.5">
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
                                    <SwatchButton
                                        key={color}
                                        active={solidColor === color}
                                        label={color}
                                        style={{ background: color }}
                                        onClick={() =>
                                            onChange({ type: "color", color })
                                        }
                                    />
                                ))}
                            </div>
                            <ColorSwatchInput
                                value={solidColor}
                                fallback={DEFAULT_DEMO_BACKGROUND_COLOR}
                                onChange={(color) =>
                                    onChange({ type: "color", color })
                                }
                            />
                        </>
                    ) : (
                        <>
                            <div className="grid min-w-0 grid-cols-3 gap-1.5">
                                {GRADIENT_BACKGROUND_PRESETS.map((preset) => (
                                    <SwatchButton
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
                                            onChange({
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
                                        onChange({
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
                                        onChange({
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

            {hasOverride && mode === "image" ? (
                <div className="grid min-w-0 gap-2">
                    <Field label="Background blur">
                        <SliderInput
                            value={imageBlur}
                            step={1}
                            min={0}
                            max={MAX_DEMO_BACKGROUND_BLUR}
                            valueLabel={(value) => `${value}px`}
                            onChange={setImageBlur}
                        />
                    </Field>
                    <Button
                        type="button"
                        variant="flat"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => setImagePickerOpen(true)}
                    >
                        <UploadCloudIcon className="size-3.5" />
                        Upload Image
                    </Button>
                    <MediaAssetPickerDialog
                        open={imagePickerOpen}
                        onOpenChange={setImagePickerOpen}
                        title="Upload background image"
                        mediaKind="image"
                        currentSrc={imageSrc}
                        assets={imageAssets}
                        demoId={demoId}
                        uploadMedia={uploadImage}
                        onPick={(result) =>
                            setImageBackground(result.src, result.alt)
                        }
                    />
                </div>
            ) : null}
        </div>
    );
}

function withOptionalBackgroundBlur<T extends DemoBackground>(
    background: T,
    blur: number,
): T {
    const next = { ...background };
    if (blur > 0) {
        next.blur = Math.min(MAX_DEMO_BACKGROUND_BLUR, Math.max(0, blur));
    } else {
        delete next.blur;
    }
    return next;
}

function SwatchButton({
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
                active && "outline-[color:var(--accent)] ring-2 ring-[color:var(--surface)]",
                className,
            )}
            style={style}
        />
    );
}

/**
 * Right-pane editor for step-level settings. Step name lives here today;
 * HTML-step zoom rides along since it's per-step too.
 */
export function StepSettingsInspector({
    step,
    nameDraft,
    onNameDraftChange,
    onNameCommit,
    onChange,
    placeholder,
    demoId,
    imageAssets,
    videoAssets,
    uploadImage,
    uploadVideo,
    onOpenEdit,
    onSelectAnnotation,
    onAddMessage,
}: {
    step: Step;
    nameDraft: string;
    onNameDraftChange: (next: string) => void;
    onNameCommit: (next: string) => void;
    onChange: (patch: Partial<Step>) => void;
    placeholder: string;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    videoAssets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
    uploadVideo: MediaUploader;
    /** Open the crop/align dialog for the active step. Only meaningful
     *  for image/video content steps. */
    onOpenEdit?: () => void;
    onSelectAnnotation: (id: string) => void;
    onAddMessage: () => void;
}) {
    const isContent = step.kind === "content";
    const contentStep = isContent
        ? (step as Extract<Step, { kind: "content" }>)
        : null;
    const messages =
        contentStep?.annotations.filter(
            (a): a is Message => a.type === "message",
        ) ?? [];
    return (
        <div className="grid min-w-0 gap-3">
            <label className="grid min-w-0 gap-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                    Step name
                </span>
                <input
                    type="text"
                    value={nameDraft}
                    placeholder={placeholder}
                    onChange={(e) => onNameDraftChange(e.target.value)}
                    onBlur={(e) => onNameCommit(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.currentTarget.blur();
                    }}
                    className="h-8 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[12.5px] text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
                />
            </label>
            {isContent ? (
                <ContentStepMediaRow
                    step={step as Extract<Step, { kind: "content" }>}
                    onChange={onChange}
                    demoId={demoId}
                    imageAssets={imageAssets}
                    videoAssets={videoAssets}
                    uploadImage={uploadImage}
                    uploadVideo={uploadVideo}
                    onOpenEdit={onOpenEdit}
                />
            ) : null}
            {contentStep ? (
                <>
                    <StepSettingsSection title="Messages">
                        {messages.length > 0 ? (
                            <div className="grid gap-1.5">
                                {messages.map((message, index) => (
                                    <StepSettingsOption
                                        key={message.id}
                                        icon={<MessageSquareIcon className="size-3.5" />}
                                        title={`Message ${index + 1}`}
                                        description={
                                            message.text?.trim() ||
                                            message.variant
                                        }
                                        onClick={() =>
                                            onSelectAnnotation(message.id)
                                        }
                                    />
                                ))}
                                <EmptyStepSettingsAction
                                    icon={<PlusIcon className="size-3.5" />}
                                    label="Add message"
                                    onClick={onAddMessage}
                                />
                            </div>
                        ) : (
                            <EmptyStepSettingsAction
                                icon={<PlusIcon className="size-3.5" />}
                                label="Add message"
                                onClick={onAddMessage}
                            />
                        )}
                    </StepSettingsSection>
                </>
            ) : null}
        </div>
    );
}

function StepSettingsSection({
    title,
    actionLabel,
    onAction,
    children,
}: {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    children: ReactNode;
}) {
    if (!actionLabel || !onAction) {
        return (
            <section className="grid min-w-0 gap-1.5">
                <SectionLabel>{title}</SectionLabel>
                {children}
            </section>
        );
    }

    return (
        <section className="grid min-w-0 gap-1.5">
            <div className="my-3 flex w-full items-center gap-2 text-muted-foreground">
                <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
                <span className="shrink-0 px-1 text-[10.5px] font-semibold uppercase tracking-[0.4px]">
                    {title}
                </span>
                <span className="h-px flex-1 border-t border-dashed border-[color:var(--line-soft)]" />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={actionLabel}
                    title={actionLabel}
                    onClick={onAction}
                    className="-my-1 size-6 text-muted-foreground hover:text-[color:var(--ink-strong)]"
                >
                    <PlusIcon className="size-3.5" />
                </Button>
            </div>
            {children}
        </section>
    );
}

function StepSettingsOption({
    icon,
    title,
    description,
    onClick,
}: {
    icon: ReactNode;
    title: string;
    description?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 py-2 text-left text-[12.5px] shadow-[var(--shadow-press)] outline-none transition-colors hover:border-[color:var(--accent)] focus-visible:border-[color:var(--accent)] focus-visible:bg-[color:var(--surface)]"
        >
            <span className="shrink-0 text-[color:var(--ink-2)]">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[color:var(--ink-strong)]">
                    {title}
                </span>
                {description ? (
                    <span className="mt-0.5 block truncate text-[11.5px] text-[color:var(--ink-2)]">
                        {description}
                    </span>
                ) : null}
            </span>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
    );
}

function EmptyStepSettingsAction({
    icon,
    label,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[color:var(--line-soft)] bg-transparent px-3 text-[12px] font-medium text-[color:var(--ink-2)] outline-none transition hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--ink-strong)] focus-visible:border-[color:var(--accent)] focus-visible:bg-[color:var(--surface-2)]"
        >
            {icon}
            {label}
        </button>
    );
}

/**
 * Type selector + media picker for a content step. Switching to a
 * different media kind opens the picker for that kind; choosing an
 * asset replaces the entire background object with the schema shape
 * for the new kind. HTML is shown for visibility but disabled when
 * the step isn't already HTML — HTML backgrounds come from the
 * capture flow, not a generic file pick.
 */
function ContentStepMediaRow({
    step,
    onChange,
    demoId,
    imageAssets,
    videoAssets,
    uploadImage,
    uploadVideo,
    onOpenEdit,
}: {
    step: Extract<Step, { kind: "content" }>;
    onChange: (patch: Partial<Step>) => void;
    demoId: string;
    imageAssets: ReadonlyArray<AssetMeta>;
    videoAssets: ReadonlyArray<AssetMeta>;
    uploadImage: MediaUploader;
    uploadVideo: MediaUploader;
    onOpenEdit?: () => void;
}) {
    const currentType = step.background.type;
    const [pickerKind, setPickerKind] = useState<"image" | "video" | null>(
        null,
    );

    const currentSrc =
        step.background.type === "image" || step.background.type === "video"
            ? step.background.src
            : "";
    const assetPool = currentType === "video" ? videoAssets : imageAssets;
    const currentName = assetNameForUrl(currentSrc, assetPool, demoId);
    const editDisabled = currentType !== "image" && currentType !== "video";

    return (
        <div className="grid min-w-0 gap-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                Type
            </span>
            <Tabs
                className="min-w-0"
                value={currentType}
                onValueChange={(v) => {
                    if (v === "image" || v === "video") setPickerKind(v);
                }}
            >
                <TabsList className="min-w-0 w-full">
                    <TabsTrigger value="image" className="flex-1 gap-1.5">
                        <ImageIcon className="size-3.5" />
                        Image
                    </TabsTrigger>
                    <TabsTrigger value="video" className="flex-1 gap-1.5">
                        <VideoIcon className="size-3.5" />
                        Video
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            {currentType === "image" || currentType === "video" ? (
                <>
                    <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                        Asset
                    </span>
                    <div className="flex min-w-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPickerKind(currentType)}
                            className={cn(
                                "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-left text-[12.5px] shadow-[var(--shadow-press)] hover:border-[color:var(--accent)]",
                            )}
                        >
                            {currentType === "video" ? (
                                <VideoIcon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                            ) : (
                                <ImageIcon className="size-3.5 shrink-0 text-[color:var(--ink-2)]" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-[color:var(--ink-1)]">
                                {currentName || currentSrc || "Pick a file…"}
                            </span>
                        </button>
                        {onOpenEdit ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="default"
                                onClick={editDisabled ? undefined : onOpenEdit}
                                disabled={editDisabled}
                                className="shrink-0 gap-1.5 px-2.5 text-[12.5px]"
                            >
                                <PencilIcon className="size-3.5 text-[color:var(--ink-2)]" />
                                Edit
                            </Button>
                        ) : null}
                    </div>
                </>
            ) : null}
            <MediaAssetPickerDialog
                open={pickerKind !== null}
                onOpenChange={(open) => {
                    if (!open) setPickerKind(null);
                }}
                title="Asset Library"
                mediaKind={pickerKind ?? "image"}
                currentSrc={currentSrc}
                assets={pickerKind === "video" ? videoAssets : imageAssets}
                demoId={demoId}
                uploadMedia={
                    pickerKind === "video" ? uploadVideo : uploadImage
                }
                onPick={(r) => {
                    if (r.mediaKind === "video") {
                        onChange({
                            background: {
                                type: "video",
                                src: r.src,
                                naturalWidth: r.naturalWidth ?? 1280,
                                naturalHeight: r.naturalHeight ?? 720,
                                autoplay: true,
                                muted: true,
                                alt: r.alt,
                            },
                        });
                    } else {
                        onChange({
                            background: {
                                type: "image",
                                src: r.src,
                                naturalWidth: r.naturalWidth ?? 1440,
                                naturalHeight: r.naturalHeight ?? 900,
                                alt: r.alt,
                            },
                        });
                    }
                    setPickerKind(null);
                }}
            />
        </div>
    );
}

/**
 * Commit-on-blur text field for an optional string config value. Local
 * draft so each keystroke doesn't rewrite the file; reseeds when the
 * upstream value changes (e.g., file reloaded from disk) and isn't
 * being actively edited. Empty input drops the field entirely.
 */
function OptionalTextField({
    label,
    placeholder,
    value,
    onCommit,
}: {
    label: string;
    placeholder: string;
    value: string | undefined;
    onCommit: (next: string | undefined) => void;
}) {
    const [draft, setDraft] = useState(value ?? "");
    const [committed, setCommitted] = useState(value ?? "");
    if ((value ?? "") !== committed) {
        setCommitted(value ?? "");
        setDraft(value ?? "");
    }
    const commit = (next: string) => {
        const trimmed = next.trim();
        const normalized = trimmed.length > 0 ? trimmed : undefined;
        setCommitted(normalized ?? "");
        setDraft(normalized ?? "");
        if ((value ?? undefined) !== normalized) {
            onCommit(normalized);
        }
    };
    return (
        <label className="grid gap-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                {label}
            </span>
            <input
                type="text"
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.currentTarget.blur();
                }}
                className="h-8 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[12.5px] text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
            />
        </label>
    );
}

/**
 * Like {@link OptionalTextField} but for an http(s)/mailto URL. Commits
 * only when empty (clears the field) or when the value passes the same
 * protocol allowlist as a CTA href; otherwise shows an inline error and
 * keeps the draft without writing an invalid value to the config.
 */
function OptionalUrlField({
    label,
    placeholder,
    value,
    onCommit,
}: {
    label: string;
    placeholder: string;
    value: string | undefined;
    onCommit: (next: string | undefined) => void;
}) {
    const [draft, setDraft] = useState(value ?? "");
    const [committed, setCommitted] = useState(value ?? "");
    const [error, setError] = useState<string | null>(null);
    if ((value ?? "") !== committed) {
        setCommitted(value ?? "");
        setDraft(value ?? "");
        setError(null);
    }
    const commit = (next: string) => {
        const trimmed = next.trim();
        if (trimmed.length === 0) {
            setError(null);
            setCommitted("");
            setDraft("");
            if ((value ?? undefined) !== undefined) onCommit(undefined);
            return;
        }
        if (!/^(https?:|mailto:)/i.test(trimmed)) {
            setError("Enter a URL starting with https://, http://, or mailto:");
            return;
        }
        setError(null);
        setCommitted(trimmed);
        setDraft(trimmed);
        if ((value ?? undefined) !== trimmed) onCommit(trimmed);
    };
    return (
        <label className="grid gap-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                {label}
            </span>
            <input
                type="text"
                value={draft}
                placeholder={placeholder}
                onChange={(e) => {
                    setDraft(e.target.value);
                    if (error) setError(null);
                }}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.currentTarget.blur();
                }}
                className="h-8 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 text-[12.5px] text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
            />
            {error ? (
                <span className="text-[11.5px] leading-snug text-[color:var(--danger,#b91c1c)]">
                    {error}
                </span>
            ) : null}
        </label>
    );
}

function OptionalMultilineTextField({
    label,
    placeholder,
    value,
    onCommit,
}: {
    label: string;
    placeholder: string;
    value: string | undefined;
    onCommit: (next: string | undefined) => void;
}) {
    const [draft, setDraft] = useState(value ?? "");
    const [committed, setCommitted] = useState(value ?? "");
    if ((value ?? "") !== committed) {
        setCommitted(value ?? "");
        setDraft(value ?? "");
    }
    const commit = (next: string) => {
        const trimmed = next.trim();
        const normalized = trimmed.length > 0 ? trimmed : undefined;
        setCommitted(normalized ?? "");
        setDraft(normalized ?? "");
        if ((value ?? undefined) !== normalized) {
            onCommit(normalized);
        }
    };
    return (
        <label className="grid gap-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                {label}
            </span>
            <Textarea
                value={draft}
                placeholder={placeholder}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commit(e.target.value)}
                className="min-h-20 resize-y border-[color:var(--line)] bg-[color:var(--surface-2)] text-[12.5px] leading-5 text-[color:var(--ink-strong)] shadow-[var(--shadow-press)] placeholder:text-muted-foreground focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
            />
        </label>
    );
}

function ChromeSegmentRow({
    label,
    value,
    onChange,
    visibleIcon,
    hiddenIcon,
    infoTooltip,
    visibleTooltip,
    hiddenTooltip,
}: {
    label: string;
    value: boolean;
    onChange: (next: boolean) => void;
    visibleIcon: ReactNode;
    hiddenIcon: ReactNode;
    infoTooltip: string;
    visibleTooltip: IconTabTooltip;
    hiddenTooltip: IconTabTooltip;
}) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-[13px] font-medium text-[color:var(--ink-strong)]">
                    {label}
                </span>
                <SimpleTooltip content={infoTooltip} side="top">
                    <span
                        className="grid size-3 shrink-0 cursor-help place-items-center rounded-full border border-[color:var(--line-strong)] text-[8px] font-semibold leading-none text-muted-foreground"
                        aria-label={`${label} details`}
                    >
                        !
                    </span>
                </SimpleTooltip>
            </span>
            <Tabs
                value={value ? "hidden" : "visible"}
                onValueChange={(next) => {
                    if (next === "visible") onChange(false);
                    if (next === "hidden") onChange(true);
                }}
                className="shrink-0"
            >
                <TabsList className="h-9 w-[138px]">
                    <TabsTrigger
                        value="visible"
                        className="px-0"
                        tooltip={
                            <IconTabTooltipContent {...visibleTooltip} />
                        }
                        aria-label={visibleTooltip.title}
                    >
                        {visibleIcon}
                    </TabsTrigger>
                    <TabsTrigger
                        value="hidden"
                        className="px-0"
                        tooltip={
                            <IconTabTooltipContent {...hiddenTooltip} />
                        }
                        aria-label={hiddenTooltip.title}
                    >
                        {hiddenIcon}
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}

/**
 * Tri-state player-controls row: full bar, minimal bar (prev/next +
 * share + fullscreen, no progress segments — and it rides along on cover
 * screens too), or hidden. Replaces the old show/hide boolean toggle.
 */
function PlayerControlsSegmentRow({
    value,
    onChange,
}: {
    value: ControlsMode;
    onChange: (next: ControlsMode) => void;
}) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-[13px] font-medium text-[color:var(--ink-strong)]">
                    Player controls
                </span>
                <SimpleTooltip
                    content="Full shows the progress bar and full transport. Minimal shows only back/forward, copy link, and fullscreen (mute appears when a step has voiceover) and stays on cover screens. Hidden removes the bar."
                    side="top"
                >
                    <span
                        className="grid size-3 shrink-0 cursor-help place-items-center rounded-full border border-[color:var(--line-strong)] text-[8px] font-semibold leading-none text-muted-foreground"
                        aria-label="Player controls details"
                    >
                        !
                    </span>
                </SimpleTooltip>
            </span>
            <Tabs
                value={value}
                onValueChange={(next) => {
                    if (
                        next === "full" ||
                        next === "minimal" ||
                        next === "hidden"
                    ) {
                        onChange(next);
                    }
                }}
                className="shrink-0"
            >
                <TabsList className="h-9 w-[138px]">
                    <TabsTrigger
                        value="full"
                        className="px-0"
                        aria-label="Full controls"
                        tooltip={
                            <IconTabTooltipContent
                                title="Full controls"
                                subtitle="Show the full player bar."
                            />
                        }
                    >
                        <PanelBottomIcon className="size-4" />
                    </TabsTrigger>
                    <TabsTrigger
                        value="minimal"
                        className="px-0"
                        aria-label="Minimal controls"
                        tooltip={
                            <IconTabTooltipContent
                                title="Minimal controls"
                                subtitle="Show compact player actions."
                            />
                        }
                    >
                        <RectangleHorizontalIcon className="size-4" />
                    </TabsTrigger>
                    <TabsTrigger
                        value="hidden"
                        className="px-0"
                        aria-label="Hide controls"
                        tooltip={
                            <IconTabTooltipContent
                                title="Hide controls"
                                subtitle="Remove the player bar."
                            />
                        }
                    >
                        <XIcon className="size-4" />
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    );
}
