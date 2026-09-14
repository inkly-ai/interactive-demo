import type { DemoThemePreset } from "../types";
import { demoThemeDefaultTokensById } from "../token-defaults";

/**
 * Default — indigo accent on a clean dotted background. Lifted card,
 * macOS-style frame, gradient header and CTA, serif display headlines
 * (system serif fallback; no webfonts are fetched).
 *
 * Only player rules live here: the frame, dotted backdrop, header, hotspot
 * bubbles, controls, caption, cover, badge and widgets. Everything is scoped
 * by [data-demo-theme="default"], which Demo.Root sets when this preset is
 * resolved.
 */
const defaultCss = `
/* ────────────────────────────────────────────────────────────────
   Demo-player chrome. Activated via [data-demo-theme="default"]
   set by Demo.Root (and mirrored by the
   editor stage). These rules paint the macOS-style frame, dotted
   backdrop, gradient header, hotspot bubbles, controls, and intro
   cover that surround every demo when the default theme is
   resolved.
   ──────────────────────────────────────────────────────────────── */

/* Player frame — single 18px-radius lifted card holding chrome + stage.
   Drop the stage's own border/shadow/radius since the player owns the chrome. */
[data-demo-theme="default"] .demo-player {
    border: 1px solid #cccccc;
    border-radius: 18px;
    overflow: hidden;
    background: transparent;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.85),
        inset 0 -1px 0 rgba(0,0,0,0.06),
        0 1px 2px rgba(0,0,0,0.06),
        0 30px 60px -30px rgba(0,0,0,0.30),
        0 12px 24px -12px rgba(0,0,0,0.20);
}
[data-demo-theme="default"] .demo-player-shell,
[data-demo-theme="default"] .demo-stage {
    /* Player owns the chrome; zero out the shell + stage borders/shadows
       that the headless package paints by default so the visual weight
       doesn't double up. border-radius: inherit keeps the shell's
       rounded shape aligned with the player's so background colors /
       images paint rounded and don't leak past the curved clip. */
    border: 0;
    border-radius: inherit;
    box-shadow: none;
}

/* Dotted backdrop on the content stage. */
[data-demo-theme="default"] .demo-player-shell {
    background:
        radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 0.5px, transparent 1px) 0 0 / 10px 10px,
        #f5f5f5;
}

/* Intro / outro carry a full-bleed watercolor backdrop by default.
   Per-step backgroundImage (rendered as a layered img) still wins
   when authors want a unique cover image. */
[data-demo-theme="default"] .demo-intro{
    background-color: #f5f5f5;
}
/* Watercolor backdrop lives on a ::before so it can be mirrored
   horizontally — the source image's dark pine sits bottom-LEFT, right where
   the left-aligned headline/description go. scaleX(-1) flips it to the
   right (empty) side without touching the text. The image is 16:9 inside a
   16:9 cover, so background-position can't slide it; mirroring is the only
   way to move the pine off the copy without zooming or washing it out.
   z-index:-1 keeps it above the solid #f5f5f5 fill but below the (un-
   positioned) cover content, so the copy stays on top. A translucent white
   wash pales the watercolor back a touch for headline contrast.
   The image itself is set by the optional fonts.css (self-hosted next to
   the player as ./backgrounds/…); without that sheet only the wash paints. */
[data-demo-theme="default"] .demo-intro::before{
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3));
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    transform: scaleX(-1);
    pointer-events: none;
}
[data-demo-theme="default"] .demo-intro[data-background-type]::before{
    content: none;
}

/* Header — design's macOS chrome: 52px tall, gradient surface, single
   border-bottom (no full border), inset white highlight just above it. */
[data-demo-theme="default"] .demo-header {
    height: 52px;
    padding: 0 16px;
    background: linear-gradient(180deg, #fcfcfc, #f8f8f8);
    border: 0;
    border-bottom: 1px solid #cccccc;
    border-radius: 0;
    box-shadow: inset 0 -1px 0 rgba(255,255,255,0.5);
}
[data-demo-theme="default"] .demo-header-title-pill {
    background: #f5f5f5;
    border: 1px solid #cccccc;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);
    color: #3a3a3a;
}
[data-demo-theme="default"] .demo-header-title-icon {
    background: linear-gradient(135deg, #5b6cff, #2a3aaa);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
}
[data-demo-theme="default"] .demo-header-action {
    color: #7a7a7a;
    border: 1px solid transparent;
    border-radius: 7px;
}
[data-demo-theme="default"] .demo-header-action:hover {
    background: #ebebeb;
    color: #3a3a3a;
    border-color: #dddddd;
}
/* The header carries a bottom-only border + inset highlight, so the
   visual content area is ~1px shorter at the bottom than the grid's
   centering math assumes. Geometrically-centered lights therefore read
   as sitting slightly high; nudge the group down 1px for optical center. */
[data-demo-theme="default"] .demo-header-lights {
    position: relative;
    top: 1px;
}
[data-demo-theme="default"] .demo-header-light {
    border: 1px solid rgba(0,0,0,0.18);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4),
        inset 0 -1px 0 rgba(0,0,0,0.18);
}
[data-demo-theme="default"] .demo-header-light[data-color="red"] {
    background: linear-gradient(180deg, #ff8c80, #e55749);
    color: transparent;
}
[data-demo-theme="default"] .demo-header-light[data-color="yellow"] {
    background: linear-gradient(180deg, #ffd66e, #e5b232);
    color: transparent;
}
[data-demo-theme="default"] .demo-header-light[data-color="green"] {
    background: linear-gradient(180deg, #83e26a, #3eb84c);
    color: transparent;
}

/* Card-style hotspot bubble — indigo gradient + accent-ink border. */
[data-demo-theme="default"] .demo-hotspot-callout,
[data-demo-theme="default"] .demo-hotspot-pointer,
[data-demo-theme="default"] .demo-hotspot-area {
    --hotspot-bg: linear-gradient(180deg,
        color-mix(in oklab, var(--demo-primary) 88%, white),
        var(--demo-primary) 60%,
        color-mix(in oklab, var(--demo-primary) 80%, black));
    --hotspot-fg: var(--demo-primary-fg);
}
[data-demo-theme="default"] .demo-hotspot-callout,
[data-demo-theme="default"] .demo-hotspot-area-message,
[data-demo-theme="default"] .demo-hotspot-label {
    background: var(--hotspot-bg);
    color: var(--hotspot-fg);
    border: 1px solid color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 78%, black);
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.30),
        inset 0 -1px 0 rgba(0,0,0,0.15),
        0 2px 3px color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 40%, transparent),
        0 14px 28px -10px color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 70%, transparent);
}
[data-demo-theme="default"] .demo-callout-footer {
    border-top: 1px dashed rgba(255,255,255,0.35);
    padding-top: 8px;
    margin-top: 6px;
}
[data-demo-theme="default"] .demo-callout-step {
    font-family: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    opacity: 0.85;
}
[data-demo-theme="default"] .demo-callout-nav-button {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.30);
    color: #ffffff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.20);
}
[data-demo-theme="default"] .demo-callout-nav-button:hover:not(:disabled) {
    background: rgba(255,255,255,0.22);
}

/* Pin dot — pulse ring (already animated in package; tighten the colors). */
[data-demo-theme="default"] .demo-hotspot-dot {
    border: 2px solid #ffffff;
    box-shadow:
        0 2px 4px color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 50%, transparent),
        0 8px 18px -6px color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 70%, transparent),
        0 0 0 6px color-mix(in oklab, var(--hotspot-accent, var(--demo-primary)) 18%, transparent);
}

/* Cardless control bar — controls float on a dark fade so the white
   icons + cream progress bar stay readable against the watercolor sky
   on light covers. The fade is split across two layers (the bar's own
   background + a ::before that extends upward) so the gradient
   transitions in over a tall area without growing the bar's layout.
   Both pieces meet at the same alpha at the seam so the boundary is
   invisible. */
[data-demo-theme="default"] .demo-controls {
    --demo-controls-bg: linear-gradient(
        to top,
        rgba(12, 16, 28, 0.62),
        rgba(12, 16, 28, 0.32)
    );
    padding: 28px 22px 18px;
    /* Controls strip is dark; keep the step indicator white instead of
       the theme's near-black --demo-fg. */
    --demo-step-indicator-color: #ffffff;
}
[data-demo-theme="default"] .demo-player-shell::after {
    height: calc(
        var(--ctrl-pad-top) + var(--ctrl-segment-h) + var(--ctrl-stack-gap) +
        var(--ctrl-btn) + var(--ctrl-pad-bot) + 80px
    );
}
[data-demo-theme="default"] .demo-controls::before {
    /* Tall upward bleed: pulls the gradient ~80px above the bar so the
       fade-in is gentle and the bar doesn't read as a hard rectangle.
       Bottom alpha matches the top of .demo-controls (0.32) so no
       visible seam appears where they join. */
    content: none;
}
[data-demo-theme="default"] .demo-controls-minimal::before {
    /* Minimal controls omit the progress segments, so the hover fade can be
       shorter without leaving the old full-bar shadow footprint. */
    height: 48px;
}
[data-demo-theme="default"] .demo-control-button {
    background: transparent;
    border: 1px solid transparent;
    color: #ffffff;
    box-shadow: none;
}
[data-demo-theme="default"] .demo-control-button:hover {
    background: rgba(255,255,255,0.12);
    box-shadow: none;
}

/* Glassy caption — design's dark backdrop-blur strip. */
[data-demo-theme="default"] .demo-caption {
    background: rgba(20,20,24,0.82);
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: 0 8px 22px -10px rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 9px;
}

/* Intro / Outro cover — design's serif headline with italic accent. The
   package's <h2> structure stays, default just retypeset. The
   description fades back; the CTA picks up the 3D button recipe defined
   below. The dotted backdrop is inherited via the cover-element rule
   above. */
[data-demo-theme="default"] .demo-intro{
    padding: clamp(40px, 6cqi, 72px);
}
[data-demo-theme="default"] .demo-intro-title{
    font-family: var(--demo-display-font, "Waldenburg", "Inter", ui-sans-serif, system-ui, sans-serif);
    font-weight: 600;
    font-size: clamp(30px, 3.8cqi, 44px);
    line-height: 1.08;
    letter-spacing: -1.5px;
    color: var(--demo-fg);
    text-wrap: balance;
}
[data-demo-theme="default"] .demo-intro-title em{
    font-style: italic;
}
[data-demo-theme="default"] .demo-intro-description{
    color: #5f5f5f;
    /* Fluid like the title (3.8cqi) so the title:subtitle ratio stays a
       steady ~2.2–2.6x across player widths instead of drifting from 2x to
       ~2.9x when the title is fixed against a 15px subtitle. */
    font-size: clamp(14px, 1.5cqi, 17px);
    line-height: 1.5;
    max-width: 46ch;
    opacity: 1;
}
[data-demo-theme="default"] .demo-intro-content{
    gap: 20px;
    max-width: 560px;
}

/* Mobile breakpoint — matches the base-layer @container in
   demo-react/styles.css at the same specificity so the cascade resolves
   without "!important". Cover padding tightens, title/description shrink
   to mobile-friendly sizes (Apple HIG Title 2 / Footnote), and the
   platform attribution pill drops out. */
@container demo-player (max-width: 640px) {
    [data-demo-theme="default"] .demo-intro{
        padding: 20px;
    }
    [data-demo-theme="default"] .demo-intro-title{
        font-size: 22px;
        line-height: 1.15;
        letter-spacing: -0.4px;
    }
    [data-demo-theme="default"] .demo-intro-description{
        font-size: 13.5px;
        line-height: 1.45;
    }
    [data-demo-theme="default"] .demo-intro-content{
        gap: 12px;
        max-width: 100%;
    }
    [data-demo-theme="default"] .demo-intro-cta{
        height: 32px;
        padding: 0 12px;
        font-size: 12.5px;
        border-radius: 8px;
    }
    [data-demo-theme="default"] .demo-intro > .demo-intro-attribution{
        position: absolute;
        left: 12px;
        bottom: 12px;
        right: auto;
        top: auto;
        z-index: 2;
    }
}
[data-demo-theme="default"] .demo-intro-cta{
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    /* Shadow tint: the button's colour pulled toward black, the same rule the
       page header uses, so a light button casts a grey shadow instead of an
       invisible white one. */
    --demo-cta-ink: color-mix(in oklab, var(--demo-cta-bg, var(--demo-primary)) 55%, black);
    height: 42px;
    padding: 0 18px;
    font-size: 14px;
    line-height: 1;
    justify-content: center;
    border-radius: 11px;
    margin-top: 4px;
    background: linear-gradient(180deg,
        color-mix(in oklab, var(--demo-cta-bg, var(--demo-primary)) 86%, white),
        var(--demo-cta-bg, var(--demo-primary)));
    color: var(--demo-cta-fg, var(--demo-primary-fg));
    border: 1px solid color-mix(in oklab, var(--demo-cta-bg, var(--demo-primary)) 78%, black);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 28%),
        inset 0 -1px 0 color-mix(in oklab, var(--demo-cta-ink) 50%, transparent),
        0 1px 2px color-mix(in oklab, var(--demo-cta-ink) 18%, transparent),
        0 4px 10px color-mix(in oklab, var(--demo-cta-ink) 22%, transparent);
    transition: filter 120ms ease, box-shadow 120ms ease, transform 80ms ease;
}
[data-demo-theme="default"] .demo-intro-cta .demo-button-label{
    display: inline-flex;
    align-items: center;
    line-height: 1;
}
[data-demo-theme="default"] .demo-intro-cta:hover{
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 32%),
        inset 0 -1px 0 color-mix(in oklab, var(--demo-cta-ink) 55%, transparent),
        0 2px 4px color-mix(in oklab, var(--demo-cta-ink) 20%, transparent),
        0 10px 18px color-mix(in oklab, var(--demo-cta-ink) 26%, transparent);
}
[data-demo-theme="default"] .demo-intro-cta:active{
    box-shadow:
        inset 0 1px 2px color-mix(in oklab, var(--demo-cta-ink) 30%, transparent),
        0 1px 1px color-mix(in oklab, var(--demo-cta-ink) 14%, transparent);
}

/* Brand mark — lifted 3D card. */
[data-demo-theme="default"] .demo-intro-brand-icon{
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #f8f8f8;
    border: 1px solid #cccccc;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.85),
        inset 0 -1px 0 rgba(0,0,0,0.06),
        0 1px 2px rgba(0,0,0,0.06),
        0 4px 10px -4px rgba(0,0,0,0.08);
    color: #1f1f1f;
    font-family: var(--demo-font);
    font-size: 18px;
    font-weight: 600;
}
/* Preview — 3D oblique card, gradient surface, deep lift. */
[data-demo-theme="default"] .demo-intro-preview{
    border: 1px solid #cccccc;
    background: linear-gradient(160deg, #f4f4f4 0%, #e8e8e8 60%, #d6d6d6 100%);
    border-radius: 16px;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.85),
        0 1px 2px rgba(0,0,0,0.07),
        0 24px 50px -22px rgba(0,0,0,0.35),
        0 10px 22px -10px rgba(0,0,0,0.18);
    transform: perspective(1400px) rotateY(-7deg) rotateX(2deg);
    transform-origin: center;
}

/* Attribution — lifted pill with serif italic accent. */
[data-demo-theme="default"] .demo-intro-attribution{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #f8f8f8;
    border: 1px solid #cccccc;
    border-radius: 999px;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.85),
        inset 0 -1px 0 rgba(0,0,0,0.06),
        0 1px 2px rgba(0,0,0,0.06),
        0 4px 10px -4px rgba(0,0,0,0.08);
    color: #1f1f1f;
    font-size: 12px;
    font-weight: 500;
}
[data-demo-theme="default"] .demo-intro-attribution em{
    font-family: var(--demo-font);
    font-style: italic;
    font-weight: 500;
    color: #7a7a7a;
}

[data-demo-theme="default"] .demo-builtwith-badge {
    --demo-watermark-fg: rgba(78,78,78,0.58);
    --demo-watermark-fg-hover: rgba(54,54,54,0.76);
}
[data-demo-theme="default"] .demo-builtwith-badge-text {
    font-family: var(--demo-display-font, "Waldenburg", "Inter", ui-sans-serif, system-ui, sans-serif);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    /* The display face's ascent ≫ descent, so centering the full em box leaves
       the cap-block sitting high against the icon (measures ~1px high on
       the cap). Trim the line box to cap-height → baseline so align-items
       centers the actual letterforms, not the metric box with its empty
       descender padding. Browsers without text-box-trim (Firefox, older
       Chrome/Safari) fall back to the near-centered em-box behavior. */
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
}

@container demo-player (min-width: 641px) {
    [data-demo-theme="default"] .demo-builtwith-badge-text {
        font-size: 13.2px;
    }
}

@container demo-player (min-width: 960px) {
    [data-demo-theme="default"] .demo-builtwith-badge-text {
        font-size: 14.4px;
    }
}


/* Embedded widget image — flat gradient card with lift. Replaces the
   package's neutral hatched placeholder; the img tag still paints on
   top once it loads. */
[data-demo-theme="default"] .demo-widget-image-frame {
    border: 1px solid #cccccc;
    background: linear-gradient(160deg, #f4f4f4 0%, #e8e8e8 60%, #d6d6d6 100%);
    border-radius: 16px;
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.85),
        0 1px 2px rgba(0,0,0,0.07),
        0 24px 50px -22px rgba(0,0,0,0.35),
        0 10px 22px -10px rgba(0,0,0,0.18);
}

/* ── Widget title / description / form submit ──────────────────────
   The cover headline gets the default typographic + 3D-button treatment
   above (.demo-intro-title / -description / -cta). The form / embed /
   media widgets carry their own .demo-widget-title / -description and
   the form a .demo-widget-submit, which otherwise fall through to the
   colorless base styles. Mirror the headline's treatment here so a
   form on the cover reads as the same surface as a headline rather than
   an unstyled block. */
/* Title + description match the cover headline exactly (.demo-intro-title
   / .demo-intro-description above) — same font, size ramp, tracking, and
   muted subtitle color, including markdown emphasis semantics and the
   mobile breakpoint below. */
[data-demo-theme="default"] .demo-widget-title {
    font-family: var(--demo-display-font, "Waldenburg", "Inter", ui-sans-serif, system-ui, sans-serif);
    font-weight: 600;
    font-size: clamp(30px, 3.8cqi, 44px);
    line-height: 1.08;
    letter-spacing: -1.5px;
    color: var(--demo-fg);
    text-wrap: balance;
}
[data-demo-theme="default"] .demo-widget-title em {
    font-style: italic;
}
[data-demo-theme="default"] .demo-widget-description {
    color: #5f5f5f;
    font-size: clamp(14px, 1.5cqi, 17px);
    line-height: 1.5;
    max-width: 46ch;
    opacity: 1;
}

/* Form submit picks up the cover CTA's 3D gradient button recipe (same
   gradient / border / lift shadow stack as .demo-intro-cta), kept
   full-width to match the form column. */
[data-demo-theme="default"] .demo-widget-form .demo-widget-submit {
    font-family: var(--demo-font);
    border-radius: 11px;
    background: linear-gradient(180deg,
        color-mix(in oklab, var(--demo-primary) 86%, white),
        var(--demo-primary));
    color: var(--demo-primary-fg);
    border: 1px solid color-mix(in oklab, var(--demo-primary) 78%, black);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 28%),
        inset 0 -1px 0 color-mix(in oklab, var(--demo-primary) 50%, transparent),
        0 1px 2px color-mix(in oklab, var(--demo-primary) 18%, transparent),
        0 4px 10px color-mix(in oklab, var(--demo-primary) 22%, transparent);
    transition: filter 120ms ease, box-shadow 120ms ease, transform 80ms ease;
}
[data-demo-theme="default"] .demo-widget-form .demo-widget-submit:hover {
    filter: none;
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 32%),
        inset 0 -1px 0 color-mix(in oklab, var(--demo-primary) 55%, transparent),
        0 2px 4px color-mix(in oklab, var(--demo-primary) 20%, transparent),
        0 10px 18px color-mix(in oklab, var(--demo-primary) 26%, transparent);
}
[data-demo-theme="default"] .demo-widget-form .demo-widget-submit:active {
    box-shadow:
        inset 0 1px 2px color-mix(in oklab, var(--demo-primary) 30%, transparent),
        0 1px 1px color-mix(in oklab, var(--demo-primary) 14%, transparent);
}

/* Mobile breakpoint — mirrors the .demo-intro-title / -description mobile
   ramp above so widget copy shrinks in lock-step with the headline. */
@container demo-player (max-width: 640px) {
    [data-demo-theme="default"] .demo-widget-title {
        font-size: 22px;
        line-height: 1.15;
        letter-spacing: -0.4px;
    }
    [data-demo-theme="default"] .demo-widget-description {
        font-size: 13.5px;
        line-height: 1.45;
    }
}
`;

export const defaultPreset: DemoThemePreset = {
    id: "default",
    label: "Default",
    theme: demoThemeDefaultTokensById.default,
    css: defaultCss,
};
