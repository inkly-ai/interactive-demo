/**
 * Demo theme catalog.
 *
 * The headless player ships structural CSS, layout primitives, and the
 * data hooks required for theming. Each preset (color tokens + optional
 * structural CSS) lives here so themes can evolve alongside the player.
 *
 * Themes that go beyond color tokens ship a `css` string that the host
 * injects in a scoped `<style>` tag, gated by a `data-demo-theme`
 * attribute on the player root.
 *
 * Each preset lives in its own file under `./presets/`. Add a new theme by
 * dropping a file there and appending its preset to `demoThemePresets` in
 * `./catalog.ts`.
 *
 * Consumers import from the `./themes` subpath:
 *   import { demoThemePresetsById, resolveDemoTheme } from
 *       "@inkly-org/interactive-demo/themes";
 */

export type { DemoThemePreset } from "./types";
export { demoThemePresets, demoThemePresetsById } from "./catalog";
export {
    DEFAULT_DEMO_THEME_ID,
    extractDemoBrand,
    extractDemoTheme,
    injectResolvedThemeIntoConfig,
    resolveDemoBrand,
    resolveDemoTheme,
    type DemoThemeConfig,
    type HostThemeConfig,
    type ResolvedDemoTheme,
} from "./resolve";
