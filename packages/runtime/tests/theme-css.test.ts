import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(
  resolve(testDir, '../src/theme/styles.css'),
  'utf8',
);

describe('theme CSS', () => {
  it('keeps message hover transitions enabled for HTML and video steps', () => {
    // The video step still snaps the annotation *position* containers so
    // the overlay lands in place rather than sliding in.
    expect(styles).toContain(
      ".demo-stage[data-background-type='video']\n  .demo-annotation-point:not(.demo-hotspot-callout)",
    );
    // ...but the hover-scaled message cards must NOT be force-snapped, or
    // the hover enlargement animation disappears on video steps.
    expect(styles).not.toContain(
      ".demo-stage[data-background-type='video'] .demo-hotspot-label",
    );
    expect(styles).not.toContain(
      ".demo-stage[data-background-type='video'] .demo-hotspot-callout",
    );
    expect(styles).not.toContain(
      ".demo-stage[data-background-type='video'] .demo-hotspot-area-message",
    );
    // The earlier over-broad `:not(image)` form is gone for good.
    expect(styles).not.toContain(
      ".demo-stage:not([data-background-type='image']) .demo-hotspot-label",
    );
  });

  it('keeps selection regions snapped to their projected content box', () => {
    const zoomPropertyRule = styles.match(
      /@property --zoom\s*\{(?<body>[^}]+)\}/,
    );
    const stageRule = styles.match(/\.demo-stage\s*\{(?<body>[^}]+)\}/);
    const stageImageRule = styles.match(
      /\.demo-stage-image\s*\{(?<body>[^}]+)\}/,
    );
    const stageEffectLayerRule = styles.match(
      /\.demo-stage-effect-layer\s*\{(?<body>[^}]+)\}/,
    );
    const annotationLayerRule = styles.match(
      /\.demo-annotation-layer\s*\{(?<body>[^}]+)\}/,
    );
    const annotationPointRule = styles.match(
      /\.demo-annotation-point\s*\{(?<body>[^}]+)\}/,
    );
    const pointerPointRules = Array.from(
      styles.matchAll(
        /\.demo-hotspot-pointer\.demo-annotation-point\s*\{(?<body>[^}]+)\}/g,
      ),
    );
    const pointerPointRule = pointerPointRules.find((rule) =>
      rule.groups?.body?.includes('transform: none'),
    );
    const pointerTriggerRule = styles.match(
      /\.demo-hotspot-trigger\s*\{(?<body>[^}]+)\}/,
    );
    const pointerSettlingRule = styles.match(
      /\.demo-hotspot-pointer\[data-anchor-settling\]\s+\.demo-hotspot-label\s*\{(?<body>[^}]+)\}/,
    );
    const pointerLabelRightRule = styles.match(
      /\.demo-hotspot-pointer\.demo-hotspot-anchor-right\s+\.demo-hotspot-label\s*\{(?<body>[^}]+)\}/,
    );
    const pointerLabelLeftRule = styles.match(
      /\.demo-hotspot-pointer\.demo-hotspot-anchor-left\s+\.demo-hotspot-label\s*\{(?<body>[^}]+)\}/,
    );
    const pointerLabelBottomRule = styles.match(
      /\.demo-hotspot-pointer\.demo-hotspot-anchor-bottom\s+\.demo-hotspot-label\s*\{(?<body>[^}]+)\}/,
    );
    const pointerLabelTopRule = styles.match(
      /\.demo-hotspot-pointer\.demo-hotspot-anchor-top\s+\.demo-hotspot-label\s*\{(?<body>[^}]+)\}/,
    );
    const calloutAutoRule = styles.match(
      /\.demo-hotspot-callout\.demo-hotspot-anchor-auto\s*\{(?<body>[^}]+)\}/,
    );
    const areaMessageAutoRule = styles.match(
      /\.demo-hotspot-area\.demo-hotspot-anchor-auto\s+\.demo-hotspot-area-message\s*\{(?<body>[^}]+)\}/,
    );
    const areaRegionRule = styles.match(
      /\.demo-annotation-region\s*\{(?<body>[^}]+)\}/,
    );
    const editorChromeRule = styles.match(
      /\.demo-stage\[data-annotation-edit-mode\]\s+\.demo-hotspot-trigger,\s*\n\.demo-stage\[data-annotation-edit-mode\]\s+\.demo-hotspot-label,\s*\n\.demo-stage\[data-annotation-edit-mode\]\s+\.demo-hotspot-callout,\s*\n\.demo-stage\[data-annotation-edit-mode\]\s+\.demo-hotspot-area-message\s*\{(?<body>[^}]+)\}/,
    );

    expect(zoomPropertyRule?.groups?.body).toContain('syntax: "<number>"');
    expect(zoomPropertyRule?.groups?.body).toContain('inherits: true');
    expect(stageRule?.groups?.body).toContain('--zoom 600ms');
    expect(stageRule?.groups?.body).toContain('--focal-x 600ms');
    expect(stageRule?.groups?.body).toContain('--focal-y 600ms');
    expect(stageImageRule?.groups?.body).toContain(
      'transform: translateZ(0) scale(var(--zoom, 1))',
    );
    expect(stageImageRule?.groups?.body).toContain('transition: none');
    expect(stageEffectLayerRule?.groups?.body).toContain(
      'transform: translateZ(0) scale(var(--zoom, 1))',
    );
    expect(stageEffectLayerRule?.groups?.body).toContain('pointer-events: none');
    expect(annotationLayerRule?.groups?.body).toContain(
      'transform: translateZ(0) scale(var(--zoom, 1))',
    );
    expect(annotationLayerRule?.groups?.body).toContain(
      'transform-origin: calc(var(--focal-x) * 100%) calc(var(--focal-y) * 100%)',
    );
    expect(annotationLayerRule?.groups?.body).toContain('transition: none');
    expect(annotationPointRule?.groups?.body).toContain(
      'top: calc(var(--y) * 100%)',
    );
    expect(annotationPointRule?.groups?.body).toContain(
      'left: calc(var(--x) * 100%)',
    );
    expect(annotationPointRule?.groups?.body).toContain('top 600ms');
    expect(annotationPointRule?.groups?.body).toContain('left 600ms');
    expect(pointerPointRule?.groups?.body).toContain('transform: none');
    expect(pointerPointRule?.groups?.body).toContain(
      'top var(--pointer-travel-ms, 600ms)',
    );
    expect(pointerPointRule?.groups?.body).toContain(
      'left var(--pointer-travel-ms, 600ms)',
    );
    expect(pointerTriggerRule?.groups?.body).toContain(
      'transform: translate(-50%, -50%) scale(calc(1 / var(--zoom, 1)))',
    );
    expect(pointerSettlingRule?.groups?.body).toContain(
      'transition: opacity 0ms linear, transform 0ms linear',
    );
    expect(pointerLabelRightRule?.groups?.body).toContain(
      'left: var(--hotspot-pointer-gap)',
    );
    expect(pointerLabelRightRule?.groups?.body).toContain(
      'scale(calc(1 / var(--zoom, 1)))',
    );
    expect(pointerLabelRightRule?.groups?.body).toContain(
      'transform-origin: 0% 50%',
    );
    expect(pointerLabelLeftRule?.groups?.body).toContain(
      'right: var(--hotspot-pointer-gap)',
    );
    expect(pointerLabelLeftRule?.groups?.body).toContain(
      'transform-origin: 100% 50%',
    );
    expect(pointerLabelBottomRule?.groups?.body).toContain(
      'top: var(--hotspot-pointer-gap)',
    );
    expect(pointerLabelBottomRule?.groups?.body).toContain(
      'transform-origin: 50% 0%',
    );
    expect(pointerLabelTopRule?.groups?.body).toContain(
      'bottom: var(--hotspot-pointer-gap)',
    );
    expect(pointerLabelTopRule?.groups?.body).toContain(
      'transform-origin: 50% 100%',
    );
    expect(calloutAutoRule?.groups?.body).toContain(
      'transform: translate(-50%, -50%) scale(calc(1 / var(--zoom, 1)))',
    );
    expect(areaMessageAutoRule?.groups?.body).toContain(
      'transform: translate(-50%, -50%) scale(calc(1 / var(--zoom, 1)))',
    );
    expect(styles).toContain('scale(calc(1.03 / var(--zoom, 1)))');
    expect(styles).toContain('scale(calc(1 / var(--zoom, 1)))');
    expect(areaRegionRule?.groups?.body).toContain(
      'top: calc(var(--y) * 100%)',
    );
    expect(areaRegionRule?.groups?.body).toContain(
      'left: calc(var(--x) * 100%)',
    );
    expect(areaRegionRule?.groups?.body).toContain('transition: none');
    expect(areaRegionRule?.groups?.body).not.toContain('top 600ms');
    expect(areaRegionRule?.groups?.body).not.toContain('left 600ms');
    expect(areaRegionRule?.groups?.body).not.toContain('width 600ms');
    expect(areaRegionRule?.groups?.body).not.toContain('height 600ms');
    expect(styles).not.toContain(
      '.demo-stage[data-annotation-edit-mode]\n  .demo-annotation-region.demo-hotspot-area',
    );
    expect(editorChromeRule?.groups?.body).toContain('transform 600ms');
  });

  it('hides message cards during mixed annotation motion', () => {
    const messageMotionRule = styles.match(
      /\.demo-stage\[data-annotation-motion\]\s+\.demo-hotspot-label,\s*\n\.demo-stage\[data-annotation-motion\]\s+\.demo-hotspot-callout,\s*\n\.demo-stage\[data-annotation-motion\]\s+\.demo-hotspot-area-message\s*\{(?<body>[^}]+)\}/,
    );

    expect(messageMotionRule?.groups?.body).toContain('opacity: 0');
    expect(messageMotionRule?.groups?.body).toContain('pointer-events: none');
  });

  it('stacks segmented progress previews above the player watermark', () => {
    const controlsBackdropRule = styles.match(
      /\.demo-player-shell::after\s*\{(?<body>[^}]+)\}/,
    );
    const controlsRule = styles.match(
      /\.demo-controls\s*\{(?<body>[^}]+)\}/,
    );
    const previewRule = styles.match(
      /\.demo-progress-segment-preview\s*\{(?<body>[^}]+)\}/,
    );
    const controlsHoverRule = styles.match(
      /\.demo-controls:has\(\.demo-progress-segment:hover\),\s*\n\.demo-controls:has\(\.demo-progress-segment:focus-visible\)\s*\{(?<body>[^}]+)\}/,
    );

    expect(controlsBackdropRule?.groups?.body).toContain('z-index: 5');
    expect(controlsBackdropRule?.groups?.body).toContain('--demo-controls-bg');
    expect(controlsRule?.groups?.body).toContain('z-index: 6');
    expect(controlsRule?.groups?.body).toContain('background: transparent');
    expect(previewRule?.groups?.body).toContain('z-index: 9');
    expect(controlsHoverRule?.groups?.body).toContain('z-index: 8');
  });

  it('keeps cover markdown emphasis as font styling with primary bold color', () => {
    const strongRule = styles.match(
      /\.demo-intro-title\s+strong,\s*\n\.demo-intro-description\s+strong\s*\{(?<body>[^}]+)\}/,
    );
    const emRule = styles.match(
      /\.demo-intro-title\s+em\s*\{(?<body>[^}]+)\}/,
    );

    expect(strongRule?.groups?.body).toContain('color: var(--demo-primary)');
    expect(strongRule?.groups?.body).toContain('font-weight: bolder');
    expect(emRule?.groups?.body).toContain('font-style: italic');
    expect(emRule?.groups?.body).not.toContain('color:');
    expect(styles).not.toContain('.demo-intro-title :is(strong, em)');
  });

});
