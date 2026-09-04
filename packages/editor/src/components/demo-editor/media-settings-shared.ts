import type { Step } from "@inkly-org/interactive-demo";
import { type AssetMeta } from "@/lib/assets";

// ─── shared types + helpers for the image / video settings dialogs ──────────

export type ObjectFit = "contain" | "cover" | "fill";
export type ObjectPosition =
  | "left top"
  | "center top"
  | "right top"
  | "left center"
  | "center center"
  | "right center"
  | "left bottom"
  | "center bottom"
  | "right bottom";

export const POSITION_GRID: ReadonlyArray<{
  value: ObjectPosition;
  label: string;
}> = [
  { value: "left top", label: "Top-left" },
  { value: "center top", label: "Top" },
  { value: "right top", label: "Top-right" },
  { value: "left center", label: "Left" },
  { value: "center center", label: "Center" },
  { value: "right center", label: "Right" },
  { value: "left bottom", label: "Bottom-left" },
  { value: "center bottom", label: "Bottom" },
  { value: "right bottom", label: "Bottom-right" },
];

export const FIT_OPTIONS: ReadonlyArray<{ value: ObjectFit; label: string }> = [
  { value: "contain", label: "Contain" },
  { value: "cover", label: "Cover" },
  { value: "fill", label: "Fill" },
];

export type MediaSettingsButtonProps = {
  step: Extract<Step, { kind: "content" }>;
  onChange: (patch: Partial<Step>) => void;
  slug: string;
  assets: ReadonlyArray<AssetMeta>;
  onAssetsChanged: () => void;
  /** Inject the just-uploaded crop into the in-memory asset manifest +
   *  draft files, so the live preview resolves the new `asset:<id>`
   *  immediately and a save persists it (without this the preview flashes
   *  a broken image and a reload can't find the asset). */
  onAssetUploaded?: (asset: AssetMeta) => void;
  stageAspect: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export type ImageContentStep = Extract<Step, { kind: "content" }> & {
  background: Extract<
    Extract<Step, { kind: "content" }>["background"],
    { type: "image" }
  >;
};

export type VideoContentStep = Extract<Step, { kind: "content" }> & {
  background: Extract<
    Extract<Step, { kind: "content" }>["background"],
    { type: "video" }
  >;
};

export type AnimationContentStep = Extract<Step, { kind: "content" }> & {
  background: Extract<
    Extract<Step, { kind: "content" }>["background"],
    { type: "animation" }
  >;
};

export function isCrossOrigin(src: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(src, window.location.href);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export async function loadMediaBlob(src: string, label: string): Promise<Blob> {
  const crossOrigin = isCrossOrigin(src);
  const fetchUrl = src;
  const res = await fetch(fetchUrl, {
    mode: crossOrigin ? "cors" : "same-origin",
    // A public remote host typically serves `access-control-allow-origin: *`,
    // which is incompatible with credentialed requests.
    credentials: crossOrigin ? "omit" : "same-origin",
  });
  if (!res.ok) {
    throw new Error(`Failed to load ${label}: ${src} (HTTP ${res.status})`);
  }
  return await res.blob();
}
