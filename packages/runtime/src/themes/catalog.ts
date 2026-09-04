import type { DemoThemePreset } from "./types";
import { monoPreset } from "./presets/mono";

export const demoThemePresets: DemoThemePreset[] = [monoPreset];

export const demoThemePresetsById: Record<string, DemoThemePreset> =
    Object.fromEntries(demoThemePresets.map((p) => [p.id, p]));
