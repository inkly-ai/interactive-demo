import type { ThemeTokens } from '../schema';

export type DemoThemePreset = {
    id: string;
    label: string;
    /**
     * Display credit shown under the theme label in the editor's theme
     * picker.
     */
    author?: string;
    /**
     * Default tokens for this preset. The 4 fields — primary, secondary,
     * font, radius — are the only tokens the cascade carries. The cascade
     * is `preset.theme → host tokens → demo.theme.tokens`.
     */
    theme: ThemeTokens;
    /**
     * Preset CSS scoped to `[data-demo-theme="<id>"]`. Injected as a
     * `<style>` tag by the surface that renders the player.
     */
    css?: string;
};
