import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { putDemoAssetBlob } from "@/lib/assets/client-demo-upload";
import { resolveEditorAssetUrl } from "@/lib/demo-resource-paths";
import {
  FIT_OPTIONS,
  loadMediaBlob,
  POSITION_GRID,
  type ImageContentStep,
  type MediaSettingsButtonProps,
  type ObjectFit,
  type ObjectPosition,
} from "@/components/demo-editor/media-settings-shared";

// ─── image cropping + alignment ────────────────────────────────────────────

type ImageSettingsDialogProps = Omit<MediaSettingsButtonProps, "step"> & {
  step: ImageContentStep;
};

const CROP_ASPECTS: ReadonlyArray<{
  id: string;
  label: string;
  ratio: number | null;
}> = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

type CropRect = { x: number; y: number; w: number; h: number };

const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

function clampCrop(rect: CropRect): CropRect {
  const w = Math.min(Math.max(rect.w, 0.05), 1);
  const h = Math.min(Math.max(rect.h, 0.05), 1);
  const x = Math.min(Math.max(rect.x, 0), 1 - w);
  const y = Math.min(Math.max(rect.y, 0), 1 - h);
  return { x, y, w, h };
}

/**
 * Center-fit a rect of the given aspect ratio inside [0,1]^2. Used to
 * seed the crop rect when the user picks a non-free aspect.
 */
function rectForAspect(
  aspect: number,
  naturalWidth: number,
  naturalHeight: number,
): CropRect {
  const imgAspect = naturalWidth / naturalHeight;
  let w: number;
  let h: number;
  if (aspect >= imgAspect) {
    w = 1;
    h = imgAspect / aspect;
  } else {
    h = 1;
    w = aspect / imgAspect;
  }
  return clampCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
}

/**
 * Drag-and-resize crop overlay. Operates entirely in normalized [0,1]
 * coordinates relative to its containing box (which itself matches the
 * image's natural aspect ratio so the rect maps cleanly).
 */
function CropOverlay({
  rect,
  aspect,
  imageAspect,
  onChange,
}: {
  rect: CropRect;
  aspect: number | null;
  /** The container's own aspect ratio (naturalWidth / naturalHeight).
   *  Needed to convert a pixel aspect lock into the normalized
   *  width/height ratio the crop rect actually uses. */
  imageAspect: number;
  onChange: (next: CropRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  type Drag =
    | { kind: "move"; startPx: number; startPy: number; startRect: CropRect }
    | {
        kind: "resize";
        corner: "nw" | "ne" | "sw" | "se";
        anchorX: number;
        anchorY: number;
      };
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const onMove = (ev: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      const node = containerRef.current;
      if (!drag || !node) return;
      const box = node.getBoundingClientRect();
      const px = (ev.clientX - box.left) / box.width;
      const py = (ev.clientY - box.top) / box.height;
      if (drag.kind === "move") {
        const dx = px - drag.startPx;
        const dy = py - drag.startPy;
        onChange(
          clampCrop({
            x: drag.startRect.x + dx,
            y: drag.startRect.y + dy,
            w: drag.startRect.w,
            h: drag.startRect.h,
          }),
        );
      } else {
        const dx = px - drag.anchorX;
        const dy = py - drag.anchorY;
        let w = Math.abs(dx);
        let h = Math.abs(dy);
        if (aspect != null) {
          // Lock to aspect. `aspect` is the desired *pixel* ratio
          // (w·naturalWidth)/(h·naturalHeight); in the rect's
          // normalized coords that means w/h = aspect / imageAspect.
          const normAspect = imageAspect > 0 ? aspect / imageAspect : aspect;
          // Pick the larger axis and derive the other so the rect
          // "follows" the pointer roughly.
          if (w / Math.max(h, 0.0001) > normAspect) {
            h = w / normAspect;
          } else {
            w = h * normAspect;
          }
          // Scale BOTH axes down uniformly so the rect stays inside
          // [0,1] and never larger than the allowed min — clamping
          // each axis on its own would distort the locked ratio.
          const availW = dx >= 0 ? 1 - drag.anchorX : drag.anchorX;
          const availH = dy >= 0 ? 1 - drag.anchorY : drag.anchorY;
          const scale = Math.min(1, availW / w, availH / h);
          w *= scale;
          h *= scale;
          // Enforce the min size, again preserving the ratio.
          const minScale = Math.max(0.05 / w, 0.05 / h, 1);
          w *= minScale;
          h *= minScale;
          // Keep the rect inside [0,1] without touching w/h (which
          // would distort the ratio) — only nudge its position.
          const x = Math.min(
            Math.max(dx >= 0 ? drag.anchorX : drag.anchorX - w, 0),
            1 - w,
          );
          const y = Math.min(
            Math.max(dy >= 0 ? drag.anchorY : drag.anchorY - h, 0),
            1 - h,
          );
          onChange({ x, y, w, h });
          ev.preventDefault();
          return;
        }
        w = Math.max(0.05, Math.min(w, 1));
        h = Math.max(0.05, Math.min(h, 1));
        const x = dx >= 0 ? drag.anchorX : drag.anchorX - w;
        const y = dy >= 0 ? drag.anchorY : drag.anchorY - h;
        onChange(clampCrop({ x, y, w, h }));
      }
      ev.preventDefault();
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [aspect, imageAspect, onChange]);

  const beginMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const node = containerRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    dragRef.current = {
      kind: "move",
      startPx: (e.clientX - box.left) / box.width,
      startPy: (e.clientY - box.top) / box.height,
      startRect: rect,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  const beginResize =
    (corner: "nw" | "ne" | "sw" | "se") =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const anchorX =
        corner === "ne" || corner === "se" ? rect.x : rect.x + rect.w;
      const anchorY =
        corner === "sw" || corner === "se" ? rect.y : rect.y + rect.h;
      dragRef.current = {
        kind: "resize",
        corner,
        anchorX,
        anchorY,
      };
      e.preventDefault();
      e.stopPropagation();
    };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: "none" }}
    >
      {/* darkened frame around the crop rect */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.55)",
          clipPath: `polygon(
                        0% 0%,
                        0% 100%,
                        ${rect.x * 100}% 100%,
                        ${rect.x * 100}% ${rect.y * 100}%,
                        ${(rect.x + rect.w) * 100}% ${rect.y * 100}%,
                        ${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%,
                        ${rect.x * 100}% ${(rect.y + rect.h) * 100}%,
                        ${rect.x * 100}% 100%,
                        100% 100%,
                        100% 0%
                    )`,
        }}
      />
      <div
        onPointerDown={beginMove}
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
      >
        {(["nw", "ne", "sw", "se"] as const).map((corner) => {
          const top = corner === "nw" || corner === "ne" ? -6 : undefined;
          const bottom = corner === "sw" || corner === "se" ? -6 : undefined;
          const left = corner === "nw" || corner === "sw" ? -6 : undefined;
          const right = corner === "ne" || corner === "se" ? -6 : undefined;
          const cursor =
            corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
          return (
            <div
              key={corner}
              onPointerDown={beginResize(corner)}
              className="absolute h-3 w-3 rounded-[2px] border border-[color:var(--accent)] bg-white"
              style={{ top, bottom, left, right, cursor }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Decode the background bytes into a canvas-drawable bitmap for cropping.
 *
 * We deliberately do NOT reuse the inline preview `<img>` / a
 * `crossOrigin="anonymous"` image: a preview loaded in no-cors mode can
 * leave the browser cache holding a response without CORS headers, and a
 * later crossOrigin load of the same URL then fails the CORS check, so the
 * canvas read throws "Failed to load image" even though the preview
 * rendered fine.
 *
 * Instead we `fetch()` the bytes under a CORS request and decode the
 * resulting blob, which yields an untainted bitmap regardless of what the
 * preview cached.
 */
async function loadCropBitmap(src: string): Promise<CanvasImageSource> {
  const blob = await loadMediaBlob(src, "image");
  return await createImageBitmap(blob);
}

/**
 * Image-only crop + alignment dialog for the active content step.
 *   1. Crop      — drag-and-resize rect over the image, optional aspect
 *                  lock; on save we draw the region to a canvas, upload
 *                  the resulting PNG, and swap the background src/dims.
 *   2. Alignment — set CSS `object-fit` + `object-position`.
 */
export function ImageSettingsDialog({
  step,
  onChange,
  slug,
  assets,
  onAssetsChanged,
  onAssetUploaded,
  stageAspect,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: ImageSettingsDialogProps) {
  const bg = step.background;

  // `bg.src` is the authored URI (`asset:<id>` for uploads, raw URLs for
  // author-supplied media, demo-relative paths for files in the demo
  // folder). The browser needs a real, fetchable URL for both the inline
  // `<img>`/`<video>` previews below and the off-screen canvas in
  // `applyCrop` — without this hop `loadCropBitmap` would try to GET the
  // literal string "asset:ast-001" (see `resolveEditorAssetUrl`).
  const resolvedBgSrc = resolveEditorAssetUrl(assets, bg.src, {
    demoSlug: slug,
  });
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };
  const [mode, setMode] = useState<"crop" | "align">("crop");
  const [aspectId, setAspectId] = useState<string>("free");
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspectPreset =
    CROP_ASPECTS.find((a) => a.id === aspectId) ?? CROP_ASPECTS[0];

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("crop");
    setAspectId("free");
    setCrop(FULL_CROP);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (aspectPreset.ratio == null) return;
    setCrop(
      rectForAspect(aspectPreset.ratio, bg.naturalWidth, bg.naturalHeight),
    );
  }, [aspectPreset.ratio, bg.naturalWidth, bg.naturalHeight, open]);

  const fit: ObjectFit = (bg.objectFit ?? "contain") as ObjectFit;
  const position: ObjectPosition = (bg.objectPosition ??
    "center center") as ObjectPosition;

  const setFit = (next: ObjectFit) => {
    onChange({
      background: {
        ...bg,
        objectFit: next === "contain" ? undefined : next,
      },
    });
  };
  const setPosition = (next: ObjectPosition) => {
    onChange({
      background: {
        ...bg,
        objectPosition: next === "center center" ? undefined : next,
      },
    });
  };

  const applyCrop = async () => {
    if (bg.type !== "image") {
      setError("Cropping only supports image backgrounds.");
      return;
    }
    const sx = crop.x * bg.naturalWidth;
    const sy = crop.y * bg.naturalHeight;
    const sw = crop.w * bg.naturalWidth;
    const sh = crop.h * bg.naturalHeight;
    if (sw < 4 || sh < 4) {
      setError("Crop region is too small.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const img = await loadCropBitmap(resolvedBgSrc);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("Failed to encode cropped image.");

      const filename = `crop-${step.id}-${Date.now().toString(36)}.png`;
      const path = `assets/${filename}`;
      const commit = await putDemoAssetBlob({
        slug,
        blob,
        path,
        contentType: "image/png",
        kind: "image",
      });
      if (!commit.assetId) {
        throw new Error("Saved crop did not return an asset id.");
      }
      // Seed the new asset into the manifest + draft files BEFORE
      // pointing the step at it, so the preview re-render resolves
      // `asset:<id>` on the first pass and the save keeps it.
      onAssetUploaded?.(commit.asset);
      onAssetsChanged();
      const newSrc = `asset:${commit.assetId}`;
      onChange({
        background: {
          type: "image",
          src: newSrc,
          naturalWidth: canvas.width,
          naturalHeight: canvas.height,
          alt: bg.alt,
          sourceUrl: bg.sourceUrl,
          title: bg.title,
          objectFit: bg.objectFit,
          objectPosition: bg.objectPosition,
        },
      });
      setOpen(false);
    } catch (err) {
      // Keep the raw cause (often a long asset URL / HTTP status) in
      // the console; show end users a short, tidy message instead.
      console.error("[image-settings] crop failed", err);
      setError("Couldn't crop this image. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const previewAspect = bg.naturalWidth / bg.naturalHeight;

  return (
    <>
      {hideTrigger ? null : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          title="Crop and align the step's background image"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Image settings</DialogTitle>
          </DialogHeader>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "crop" | "align")}
          >
            <TabsList variant="default" className="w-full">
              <TabsTrigger value="crop" className="flex-1">
                Crop
              </TabsTrigger>
              <TabsTrigger value="align" className="flex-1">
                Alignment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="crop" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[color:var(--ink-2)]">
                  Aspect
                </span>
                <div className="flex flex-wrap gap-1">
                  {CROP_ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAspectId(a.id)}
                      className={cn(
                        "cursor-pointer rounded-md border px-2 py-1 text-[11px] transition",
                        aspectId === a.id
                          ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                          : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-2)] hover:border-[color:var(--accent)]",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-center px-2 py-2">
                <div
                  className="relative max-h-[420px] w-full rounded-md bg-[color:var(--surface-2)]"
                  style={{
                    aspectRatio: `${bg.naturalWidth} / ${bg.naturalHeight}`,
                    maxWidth:
                      previewAspect >= 1 ? "100%" : `${420 * previewAspect}px`,
                  }}
                >
                  <img
                    src={resolvedBgSrc}
                    alt={bg.alt ?? ""}
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none rounded-md object-contain"
                  />
                  <CropOverlay
                    rect={crop}
                    aspect={aspectPreset.ratio}
                    imageAspect={previewAspect}
                    onChange={setCrop}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Crop region: {Math.round(crop.w * bg.naturalWidth)} x{" "}
                  {Math.round(crop.h * bg.naturalHeight)} px
                </span>
                <button
                  type="button"
                  onClick={() => setCrop(FULL_CROP)}
                  className="cursor-pointer rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] px-2 py-1 text-[11px] text-[color:var(--ink-2)] hover:border-[color:var(--accent)]"
                >
                  Reset
                </button>
              </div>
              {error ? (
                <p className="break-words text-[11px] text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void applyCrop()}
                  disabled={
                    busy ||
                    (crop.x === 0 &&
                      crop.y === 0 &&
                      crop.w === 1 &&
                      crop.h === 1)
                  }
                >
                  {busy ? "Cropping…" : "Apply crop"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="align" className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Player preview
                </p>
                <div className="flex justify-center rounded-md border border-[color:var(--line-soft)] bg-[color:var(--surface-2)] p-2">
                  <div
                    className="relative w-full overflow-hidden rounded-sm bg-[#0b1118] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{ aspectRatio: stageAspect }}
                  >
                    <img
                      src={resolvedBgSrc}
                      alt={bg.alt ?? ""}
                      draggable={false}
                      className="absolute inset-0 h-full w-full select-none"
                      style={{
                        objectFit: fit,
                        objectPosition: fit === "fill" ? undefined : position,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fit
                  </p>
                  <div className="flex gap-1">
                    {FIT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFit(opt.value)}
                        className={cn(
                          "cursor-pointer flex-1 rounded-md border px-2 py-1.5 text-[12px] transition",
                          fit === opt.value
                            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                            : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-2)] hover:border-[color:var(--accent)]",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Anchor
                  </p>
                  <div
                    className={cn(
                      "grid w-fit gap-0.5 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1",
                      fit === "fill" && "opacity-50",
                    )}
                    style={{
                      gridTemplateColumns: "repeat(3, 1fr)",
                    }}
                  >
                    {POSITION_GRID.map((p) => {
                      const [hx, vy] = p.value.split(" ") as [
                        "left" | "center" | "right",
                        "top" | "center" | "bottom",
                      ];
                      const cellAlign = {
                        left: "items-start",
                        center: "items-center",
                        right: "items-end",
                      }[hx];
                      const cellJustify = {
                        top: "justify-start",
                        center: "justify-center",
                        bottom: "justify-end",
                      }[vy];
                      const active = position === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPosition(p.value)}
                          disabled={fit === "fill"}
                          title={p.label}
                          className={cn(
                            "flex h-6 w-6 cursor-pointer flex-col rounded-sm border transition disabled:cursor-not-allowed",
                            cellAlign,
                            cellJustify,
                            active
                              ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15"
                              : "border-[color:var(--line-soft)] bg-[color:var(--surface)] hover:border-[color:var(--accent)]",
                          )}
                        >
                          <span
                            className={cn(
                              "block h-1 w-1 rounded-[1px]",
                              active
                                ? "bg-[color:var(--accent)]"
                                : "bg-[color:var(--ink-2)]",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
