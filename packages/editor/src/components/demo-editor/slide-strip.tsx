/*
 * Editor's left-rail step strip. Each step renders a thumbnail with
 * action menus, drag handles, and cover/content variants. Drag-and-drop
 * is wired via @dnd-kit/sortable.
 */
import {
    Fragment,
    useMemo,
    type CSSProperties,
    type ReactNode,
} from "react";
import type { DemoConfig, Step } from "@inkly-org/interactive-demo";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    CodeIcon,
    CopyIcon,
    FlagIcon,
    FlagOffIcon,
    FormInputIcon,
    ImageIcon,
    MoreHorizontalIcon,
    MousePointerClickIcon,
    SettingsIcon,
    Trash2Icon,
    TypeIcon,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { demoThemePresetsById } from "@inkly-org/interactive-demo/themes";
import { CoverPreviewMini } from "@inkly-org/interactive-demo";
import {
    backgroundKind,
    backgroundPosterSrc,
    backgroundSrc,
    firstContentfulImageSrc,
} from "./geometry";
import { type Slide } from "./context";

export type CoverVariant = "form" | "headline" | "embed" | "cta";

export const COVER_OPTIONS: ReadonlyArray<{
    kind: CoverVariant;
    label: string;
    Icon: typeof TypeIcon;
}> = [
    {
        kind: "headline",
        label: "Add a new headline",
        Icon: TypeIcon,
    },
    {
        kind: "form",
        label: "Add new form",
        Icon: FormInputIcon,
    },
    {
        kind: "embed",
        label: "Add new embed",
        Icon: CodeIcon,
    },
    {
        kind: "cta",
        label: "Add new CTA",
        Icon: MousePointerClickIcon,
    },
];

const INSERT_COVER_OPTIONS = COVER_OPTIONS.filter(({ kind }) => kind !== "cta");

// ─── step thumbnail strip ───────────────────────────────────────────────────

export function SlideThumbnail({
    previewSrc,
    previewKind,
    customBody,
    fallback,
    selected,
    onClick,
    actions,
    topLeft,
    bottomRight,
}: {
    previewSrc?: string;
    previewKind?: "image" | "video";
    /** Full-bleed override that replaces the image/fallback slot. */
    customBody?: ReactNode;
    fallback?: ReactNode;
    selected: boolean;
    onClick: () => void;
    /** Hover-only overlay rendered in the image's top-right corner. */
    actions?: ReactNode;
    /** Always-visible overlay in the image's top-left corner. */
    topLeft?: ReactNode;
    /** Always-visible overlay in the image's bottom-right corner. */
    bottomRight?: ReactNode;
}) {
    return (
        <div
            className={cn(
                "group/thumb relative flex flex-col rounded-[12px] border bg-[color:var(--surface)] transition-[box-shadow,border-color]",
                selected
                    ? "border-[color:var(--accent)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent),var(--shadow-lift)]"
                    : "border-[color:var(--line)] shadow-[var(--shadow-lift)] hover:shadow-[var(--shadow-lift-hover)]",
            )}
        >
            <div className="relative m-1.5 aspect-[2/1]">
                <button
                    type="button"
                    onClick={onClick}
                    className="absolute inset-0 block cursor-pointer overflow-hidden rounded-[10px] border border-[color:var(--line-soft)] bg-[color:var(--bg-2,#ebebeb)] text-left outline-none"
                >
                    {customBody ? (
                        customBody
                    ) : previewSrc ? (
                        previewKind === "video" ? (
                            <video
                                src={previewSrc}
                                className="block h-full w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                            />
                        ) : (
                            <img
                                src={previewSrc}
                                alt=""
                                className="block h-full w-full object-cover"
                                draggable={false}
                            />
                        )
                    ) : fallback ? (
                        <div className="flex h-full w-full items-center justify-center text-[10.5px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
                            {fallback}
                        </div>
                    ) : null}
                </button>
                {topLeft ? (
                    <div className="pointer-events-none absolute top-2 left-2">
                        {topLeft}
                    </div>
                ) : null}
                {bottomRight ? (
                    <div className="absolute right-2.5 bottom-2.5">
                        {bottomRight}
                    </div>
                ) : null}
                {selected ? (
                    <div className="pointer-events-none absolute bottom-2 left-2 inline-flex h-6 items-center gap-1 rounded-full border border-[color:var(--line-soft)] bg-[color:var(--surface)]/88 px-2 text-[10.5px] font-medium text-[color:var(--ink-2)] opacity-0 shadow-[0_1px_4px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-opacity duration-150 group-hover/thumb:opacity-100">
                        <MousePointerClickIcon className="size-3" />
                        Click to edit
                    </div>
                ) : null}
                {actions ? (
                    <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100 focus-within:opacity-100">
                        {actions}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function SlideStripVideoBuffer({ config }: { config: DemoConfig }) {
    const sources = useMemo(() => {
        const seen = new Set<string>();
        const next: string[] = [];
        for (const step of config.steps) {
            if (step.kind !== "content" || step.background.type !== "video") {
                continue;
            }
            const src = backgroundSrc(step);
            if (!src || seen.has(src)) continue;
            seen.add(src);
            next.push(src);
        }
        return next;
    }, [config.steps]);

    if (sources.length === 0) return null;

    return (
        <div
            aria-hidden
            className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
        >
            {sources.map((src) => (
                <video
                    key={src}
                    src={src}
                    muted
                    playsInline
                    preload="auto"
                    tabIndex={-1}
                />
            ))}
        </div>
    );
}

/**
 * Dotted divider rendered between adjacent slide thumbnails. The `+`
 * affordance opens a dropdown of insert options (add image/video via the
 * canonical media picker, cover collection). Each option resolves to a new
 * step inserted at the given index.
 */
export function SlideDivider({
    onAddMedia,
    onAddCover,
    disabled,
}: {
    onAddMedia: () => void;
    onAddCover: (kind: CoverVariant) => void;
    disabled?: boolean;
}) {
    return (
        <div className="-my-2 flex items-center justify-center gap-1.5 py-0.5">
            <div className="flex-1 border-t border-dashed border-[color:var(--line)]" />
            {!disabled ? (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label="Add step here"
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--ink-3,#c4c4c4)] outline-none hover:text-[color:var(--accent)] data-[state=open]:text-[color:var(--accent)]"
                    >
                        <svg
                            viewBox="0 0 12 12"
                            className="h-3 w-3"
                            aria-hidden="true"
                        >
                            <path
                                d="M6 2v8M2 6h8"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="right"
                        align="center"
                        sideOffset={8}
                        className="w-52"
                    >
                        <DropdownMenuItem onClick={onAddMedia}>
                            <ImageIcon className="size-4" />
                            Add image or video
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium uppercase leading-none text-muted-foreground">
                                Cover steps
                            </DropdownMenuLabel>
                            {INSERT_COVER_OPTIONS.map(({ kind, label, Icon }) => (
                                <DropdownMenuItem
                                    key={kind}
                                    onClick={() => onAddCover(kind)}
                                >
                                    <Icon className="size-4" />
                                    {label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
            <div className="flex-1 border-t border-dashed border-[color:var(--line)]" />
        </div>
    );
}

/**
 * Wraps a step thumbnail with `useSortable`. Dnd-kit listeners are not
 * applied here — they're forwarded into the thumbnail's footer drag
 * handle via `setActivatorNodeRef`, so dragging only starts on the
 * handle and the card body remains a normal click target.
 */
/** Hover-revealed action menu rendered in the card's top-right corner. */
export function StepActionsMenu({
    onOpenSettings,
    onDuplicate,
    onDelete,
    canDelete,
}: {
    onOpenSettings: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    canDelete: boolean;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Step actions"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-2)] shadow-[var(--shadow-lift)] outline-none hover:text-[color:var(--ink-strong)]"
            >
                <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-44">
                <DropdownMenuItem onClick={onOpenSettings}>
                    <SettingsIcon className="size-4" />
                    Step settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDuplicate}>
                    <CopyIcon className="size-4" />
                    Duplicate step
                </DropdownMenuItem>
                <DropdownMenuItem
                    variant="destructive"
                    disabled={!canDelete}
                    onClick={onDelete}
                    title={
                        canDelete
                            ? "Delete step"
                            : "A demo needs at least one step."
                    }
                >
                    <Trash2Icon className="size-4" />
                    Delete step
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Subtle pill in the top-left corner showing the step's position. */
export function StepNumberBadge({ index }: { index: number }) {
    return (
        <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[color:var(--surface)] px-1.5 text-[10.5px] font-semibold text-[color:var(--ink-strong)] shadow-[0_1px_2px_rgba(0,0,0,0.18)] ring-1 ring-[color:var(--line)]">
            {index}
        </span>
    );
}

/**
 * Small accent-colored dot rendered in the bottom-right corner when a
 * step has annotations. Hovering it shows a tooltip with the count.
 */
export function MessageCountIndicator({ count }: { count: number }) {
    if (count <= 0) return null;
    const labelText = count === 1 ? "1 message" : `${count} messages`;
    return (
        <Tooltip>
            <TooltipTrigger
                aria-label={labelText}
                className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-[color:var(--accent)] shadow-[0_1px_2px_rgba(0,0,0,0.25)] outline-none ring-2 ring-[color:var(--surface)]"
            />
            <TooltipContent side="top">
                {labelText} on this step
            </TooltipContent>
        </Tooltip>
    );
}

export function SortableStepThumbnail({
    step,
    index,
    themeId,
    glassImageSrc,
    selected,
    onClick,
    onOpenSettings,
    onDuplicate,
    onDelete,
    canDelete,
}: {
    step: Step;
    index: number;
    themeId?: string;
    glassImageSrc?: string;
    selected: boolean;
    onClick: () => void;
    onOpenSettings: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    canDelete: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step.id });
    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
    };
    const themePreset = themeId ? demoThemePresetsById[themeId] : undefined;
    const coverBody =
        step.kind === "cover" ? (
            <CoverPreviewMini
                cover={step}
                glassImageSrc={glassImageSrc}
                themeId={themeId}
                themeTokens={themePreset?.theme}
                themeCss={themePreset?.css}
            />
        ) : undefined;
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <SlideThumbnail
                customBody={coverBody}
                previewSrc={
                    coverBody
                        ? undefined
                        : (backgroundPosterSrc(step) ??
                          backgroundSrc(step) ??
                          undefined)
                }
                previewKind={
                    backgroundKind(step) === "video" &&
                    step.kind === "content" &&
                    step.background?.type === "video" &&
                    !step.background.posterSrc
                        ? "video"
                        : "image"
                }
                selected={selected}
                onClick={onClick}
                topLeft={<StepNumberBadge index={index} />}
                bottomRight={
                    step.kind === "content" ? (
                        <MessageCountIndicator
                            count={step.annotations.length}
                        />
                    ) : null
                }
                actions={
                    <StepActionsMenu
                        onOpenSettings={onOpenSettings}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete}
                        canDelete={canDelete}
                    />
                }
            />
        </div>
    );
}

/**
 * Full-width CTA card rendered at the top/bottom of the strip when the
 * first/last step is not already a cover. Clicking inserts a cover step
 * — `headline` (2-col + media) for intro, `cta` (headline only) for outro.
 */
function AddBookendButton({
    kind,
    onClick,
}: {
    kind: "intro" | "outro";
    onClick: () => void;
}) {
    const Icon = kind === "intro" ? FlagIcon : FlagOffIcon;
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex aspect-[2/1] cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] text-[13px] font-medium text-[color:var(--ink-2)] outline-none transition-[box-shadow,color,border-color] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:shadow-[var(--shadow-lift-hover)] focus-visible:border-[color:var(--accent)] focus-visible:text-[color:var(--accent)]"
        >
            <Icon className="size-4" />
            Add {kind} step
        </button>
    );
}

export function SlideStrip({
    config,
    themeId,
    selectedSlide,
    onSelectSlide,
    onOpenStepSettings,
    onOpenCoverSettings,
    onAddMediaAt,
    onAddCoverAt,
    onAddIntroStep,
    onReorderSteps,
    onDuplicateStep,
    onDeleteStep,
    canDeleteSteps,
}: {
    config: DemoConfig;
    themeId?: string;
    selectedSlide: Slide;
    onSelectSlide: (next: Slide) => void;
    /** Re-clicking the already-selected thumbnail opens the step
     *  settings panel; the strip raises this so view.tsx can swap the
     *  sidebar. */
    onOpenStepSettings: () => void;
    /** Double-clicking a cover thumbnail jumps straight to the cover
     *  inspector (layout + widgets), bypassing the step-settings panel. */
    onOpenCoverSettings: (stepId: string) => void;
    onAddMediaAt: (insertIndex: number) => void;
    onAddCoverAt: (insertIndex: number, kind: CoverVariant) => void;
    onAddIntroStep: () => void;
    onReorderSteps: (fromIndex: number, toIndex: number) => void;
    onDuplicateStep: (stepId: string) => void;
    onDeleteStep: (stepId: string) => void;
    canDeleteSteps: boolean;
}) {
    const canAdd = config.steps.length > 0;
    const firstStep = config.steps[0];
    const lastStep = config.steps[config.steps.length - 1];
    const showAddIntro = canAdd && firstStep?.kind !== "cover";
    const showAddOutro =
        canAdd && config.steps.length > 0 && lastStep?.kind !== "cover";
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );
    const stepIds = useMemo(
        () => config.steps.map((s) => s.id),
        [config.steps],
    );
    const glassImageSrc = useMemo(
        () => firstContentfulImageSrc(config.steps),
        [config.steps],
    );
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = stepIds.indexOf(String(active.id));
        const to = stepIds.indexOf(String(over.id));
        if (from === -1 || to === -1) return;
        onReorderSteps(from, to);
    };
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            {showAddIntro ? (
                <>
                    <AddBookendButton
                        kind="intro"
                        onClick={onAddIntroStep}
                    />
                    <SlideDivider
                        onAddMedia={() => onAddMediaAt(0)}
                        onAddCover={(kind) => onAddCoverAt(0, kind)}
                    />
                </>
            ) : null}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={stepIds}
                    strategy={verticalListSortingStrategy}
                >
                    {config.steps.map((step, index) => {
                        const isSelected = selectedSlide.stepId === step.id;
                        const showDividerAfter =
                            index < config.steps.length - 1;
                        return (
                            <Fragment key={step.id}>
                                <SortableStepThumbnail
                                    step={step}
                                    index={index + 1}
                                    themeId={themeId}
                                    glassImageSrc={glassImageSrc}
                                    selected={isSelected}
                                    onClick={() => {
                                        if (!isSelected) {
                                            onSelectSlide({ stepId: step.id });
                                        } else if (step.kind === "cover") {
                                            onOpenCoverSettings(step.id);
                                        } else {
                                            onOpenStepSettings();
                                        }
                                    }}
                                    onOpenSettings={() => {
                                        if (!isSelected) {
                                            onSelectSlide({ stepId: step.id });
                                        }
                                        if (step.kind === "cover") {
                                            onOpenCoverSettings(step.id);
                                            return;
                                        }
                                        onOpenStepSettings();
                                    }}
                                    onDuplicate={() =>
                                        onDuplicateStep(step.id)
                                    }
                                    onDelete={() => onDeleteStep(step.id)}
                                    canDelete={canDeleteSteps}
                                />
                                {showDividerAfter ? (
                                    <SlideDivider
                                        onAddMedia={() =>
                                            onAddMediaAt(index + 1)
                                        }
                                        onAddCover={(kind) =>
                                            onAddCoverAt(index + 1, kind)
                                        }
                                        disabled={!canAdd}
                                    />
                                ) : null}
                            </Fragment>
                        );
                    })}
                </SortableContext>
            </DndContext>
            {showAddOutro ? (
                <>
                    <SlideDivider
                        onAddMedia={() => onAddMediaAt(config.steps.length)}
                        onAddCover={(kind) =>
                            onAddCoverAt(config.steps.length, kind)
                        }
                    />
                    <AddBookendButton
                        kind="outro"
                        onClick={() =>
                            onAddCoverAt(config.steps.length, "cta")
                        }
                    />
                </>
            ) : null}
        </div>
    );
}
