import type { DemoThemePreset } from "../types";
import { demoThemeDefaultTokensById } from "../token-defaults";

/**
 * Mono — plain, flat, minimal. White paper, black ink, configurable
 * primary accent for emphasis. Hairline borders, sharp small corners.
 */
const monoCss = `
/* Mono — plain, flat, minimal. White paper, black ink, configurable
   primary accent for emphasis. No gradients, no shadows beyond a barely-there
   frame edge, hairline borders, sharp small corners. Bold sans-serif
   headline carries all the weight; the chrome stays whisper-quiet. */

/* Player frame — white slab with a hairline neutral edge, no shadow. */
[data-demo-theme="mono"] .demo-player {
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: none;
}
[data-demo-theme="mono"] .demo-player-shell,
[data-demo-theme="mono"] .demo-stage {
    border: 0;
    border-radius: inherit;
    box-shadow: none;
}

/* Subtle dotted-paper backdrop on the content stage and cover screens.
   16px grid, ~1px dot at 5% black — visible enough to add tactile
   texture but quiet enough that it never competes with the bold
   headline or the blue accent. */
[data-demo-theme="mono"] .demo-player-shell,
[data-demo-theme="mono"] .demo-intro{
    background:
        radial-gradient(circle at 1px 1px, rgba(10, 10, 10, 0.06) 1px, transparent 1.6px) 0 0 / 16px 16px,
        #ffffff;
}

/* Header — flat masthead, no chrome. Title pill collapses to plain ink. */
[data-demo-theme="mono"] .demo-header {
    height: 48px;
    padding: 0 18px;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #ececec;
    border-radius: 0;
}
[data-demo-theme="mono"] .demo-header-title-pill {
    background: transparent;
    border: 0;
    color: #0a0a0a;
    border-radius: 0;
    padding: 0;
    gap: 0;
    font-family: var(--demo-font);
    font-weight: 500;
    font-size: 13.5px;
    letter-spacing: 0.05px;
    box-shadow: none;
}
[data-demo-theme="mono"] .demo-header-title-icon {
    display: none;
}
[data-demo-theme="mono"] .demo-header-action {
    color: #6b6b6b;
    border-radius: 10px;
    border: 1px solid transparent;
    transition: background-color 120ms ease, color 120ms ease, transform 80ms ease;
}
[data-demo-theme="mono"] .demo-header-action:hover {
    background: #f5f5f5;
    color: #0a0a0a;
}
[data-demo-theme="mono"] .demo-header-action:active {
    transform: translateY(1px);
    background: #e8e8e8;
}
[data-demo-theme="mono"] .demo-header-light {
    border: 1px solid #e5e5e5;
    box-shadow: none;
}

/* Intro / outro — bold sans headline with primary-colored emphasis. */
[data-demo-theme="mono"] .demo-intro{
    padding: clamp(36px, 5.5cqi, 72px);
}
[data-demo-theme="mono"] .demo-intro-title{
    font-family: var(--demo-font);
    font-weight: 800;
    font-size: clamp(30px, 4cqi, 48px);
    line-height: 1.02;
    letter-spacing: -1px;
    color: #0a0a0a;
    text-transform: uppercase;
    text-wrap: balance;
}
[data-demo-theme="mono"] .demo-intro-title em{
    font-style: normal;
    color: var(--demo-primary);
}
[data-demo-theme="mono"] .demo-intro-description{
    color: #525252;
    font-size: 15px;
    line-height: 1.55;
    max-width: 46ch;
}
[data-demo-theme="mono"] .demo-intro-content{
    gap: 22px;
    max-width: 560px;
}

/* Mobile breakpoint. Mono keeps its uppercase weight-800 look but shrinks the
   point size to something legible on a 390px frame. */
@container demo-player (max-width: 640px) {
    [data-demo-theme="mono"] .demo-intro{
        padding: 20px;
    }
    [data-demo-theme="mono"] .demo-intro-title{
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.4px;
    }
    [data-demo-theme="mono"] .demo-intro-description{
        font-size: 13.5px;
        line-height: 1.45;
    }
    [data-demo-theme="mono"] .demo-intro-content{
        gap: 12px;
        max-width: 100%;
    }
    [data-demo-theme="mono"] .demo-intro-cta{
        height: 32px;
        padding: 0 12px;
        font-size: 12.5px;
        border-radius: 8px;
    }
    [data-demo-theme="mono"] .demo-intro > .demo-intro-attribution{
        position: absolute;
        left: 12px;
        bottom: 12px;
        right: auto;
        top: auto;
        z-index: 2;
    }
}

/* Primary CTA — flat token-colored card with a hairline edge. */
[data-demo-theme="mono"] .demo-intro-cta{
    height: 40px;
    padding: 0 18px;
    font-size: 13.5px;
    font-weight: 500;
    border-radius: 10px;
    margin-top: 4px;
    background: var(--demo-primary);
    color: var(--demo-primary-fg);
    border: 1px solid var(--demo-primary);
    box-shadow: 0 8px 18px -14px color-mix(in oklab, var(--demo-primary) 58%, transparent);
    transition:
        background-color 140ms ease,
        border-color 140ms ease,
        box-shadow 140ms ease,
        transform 80ms ease;
}
[data-demo-theme="mono"] .demo-intro-cta:hover{
    background: color-mix(in oklab, var(--demo-primary) 90%, white);
    border-color: color-mix(in oklab, var(--demo-primary) 86%, black);
    box-shadow: 0 12px 24px -16px color-mix(in oklab, var(--demo-primary) 68%, transparent);
}
[data-demo-theme="mono"] .demo-intro-cta:active{
    transform: translateY(1px);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.18);
}
[data-demo-theme="mono"] .demo-intro-cta:focus-visible{
    outline: 2px solid color-mix(in oklab, var(--demo-primary) 72%, white);
    outline-offset: 2px;
}
/* Preview card — white surface with hairline edge, no transform. */
[data-demo-theme="mono"] .demo-intro-preview{
    border: 1px solid #e5e5e5;
    background: #ffffff;
    border-radius: 10px;
    box-shadow: none;
    transform: none;
}

/* Hotspot bubble — solid blue, white text, sharp small corners. */
[data-demo-theme="mono"] .demo-hotspot-callout,
[data-demo-theme="mono"] .demo-hotspot-pointer,
[data-demo-theme="mono"] .demo-hotspot-area {
    --hotspot-bg: var(--demo-primary);
    --hotspot-fg: var(--demo-primary-fg);
}
[data-demo-theme="mono"] .demo-hotspot-callout,
[data-demo-theme="mono"] .demo-hotspot-area-message,
[data-demo-theme="mono"] .demo-hotspot-label {
    background: var(--hotspot-bg);
    color: var(--hotspot-fg);
    border: 0;
    border-radius: 8px;
    box-shadow: none;
}
[data-demo-theme="mono"] .demo-hotspot-dot {
    border: 2px solid #ffffff;
    background: var(--hotspot-bg);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--demo-primary) 18%, transparent);
}

/* Controls — flat white strip, thin primary progress fill. */
[data-demo-theme="mono"] .demo-controls {
    padding: 10px 16px;
    border-top: 1px solid #ececec;
}
[data-demo-theme="mono"] .demo-control-button {
    background: transparent;
    border: 1px solid transparent;
    color: #0a0a0a;
    border-radius: 10px;
    box-shadow: none;
    transition: background-color 120ms ease, transform 80ms ease;
}
[data-demo-theme="mono"] .demo-control-button:hover {
    background: #f5f5f5;
}
[data-demo-theme="mono"] .demo-control-button:active {
    transform: translateY(1px);
    background: #e8e8e8;
}

/* Caption — white card with hairline edge. */
[data-demo-theme="mono"] .demo-caption {
    background: #ffffff;
    color: #0a0a0a;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: none;
}

/* Embedded widget image — flat white with hairline border, no shadow. */
[data-demo-theme="mono"] .demo-widget-image-frame {
    border: 1px solid #e5e5e5;
    background: #ffffff;
    border-radius: 10px;
    box-shadow: none;
}
`;

export const monoPreset: DemoThemePreset = {
    id: "mono",
    label: "Mono",
    theme: demoThemeDefaultTokensById.mono,
    css: monoCss,
};
