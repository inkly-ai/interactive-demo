import type { DemoThemePreset } from "./types";
import { defaultPreset } from "./presets/default";
import { monoPreset } from "./presets/mono";

export const demoThemePresets: DemoThemePreset[] = [defaultPreset, monoPreset];

export const demoThemePresetsById: Record<string, DemoThemePreset> =
    Object.fromEntries(demoThemePresets.map((p) => [p.id, p]));
