/**
 * Embed-snippet builders for `interactive-demo embed` (ported from the
 * original CLI's `embed/snippets.ts`).
 *
 * Two shapes: an inline iframe, and the pop-up loader plus a trigger button.
 * The contract that must stay in lockstep with the runtime is narrow: the
 * `?embed=inline` query param, the `InteractiveDemo` global, and the
 * `embed.js` path the hosting service serves from the runtime package.
 */

const EMBED_SCRIPT_PATH = 'embed.js';

export const LOADER_STUB =
  `<script>window.InteractiveDemo=window.InteractiveDemo||{q:[],open:function(){(this.q=this.q||[]).push(arguments)}};</script>`;

export type EmbedMode = 'inline' | 'popup';

const POPUP_FRAMEWORKS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'next', label: 'Next.js' },
  { id: 'vue', label: 'Vue' },
  { id: 'svelte', label: 'Svelte' },
] as const;

function escapeAttribute(value: string): string {
  return value
    .split('&')
    .join('&amp;')
    .split('"')
    .join('&quot;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;');
}

/** Append `embed=inline` to a URL without clobbering an existing query. */
function withInlineEmbed(url: string): string {
  return url.includes('?') ? `${url}&embed=inline` : `${url}?embed=inline`;
}

export interface InlineSnippetSize {
  /** The demo's player ratio. */
  aspectRatio: { width: number; height: number };
  /** The player header the theme draws above the stage, in px. */
  verticalChromeHeight?: number;
}

const INLINE_MAX_HEIGHT_VIEWPORT_PERCENT = 80;
const INLINE_PLAYER_EDGE_ALLOWANCE_PX = 2;

function formatCssNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

function maxWidthForViewportHeight(size: InlineSnippetSize, unit: 'vh' | 'svh'): string {
  const { width, height } = size.aspectRatio;
  const chrome = size.verticalChromeHeight ?? 0;
  if (chrome > 0) {
    const reserve = chrome + INLINE_PLAYER_EDGE_ALLOWANCE_PX;
    return `calc(max(0px, ${INLINE_MAX_HEIGHT_VIEWPORT_PERCENT}${unit} - ${formatCssNumber(reserve)}px) * ${formatCssNumber(width)} / ${formatCssNumber(height)})`;
  }
  return `${formatCssNumber(INLINE_MAX_HEIGHT_VIEWPORT_PERCENT * (width / height))}${unit}`;
}

/**
 * Inline iframe — drop straight into a page. No loader script required.
 * With a size, the iframe sits in a wrapper that is exactly the demo's
 * ratio plus its header, so the chrome-free page fills it with no
 * letterbox, capped so it never exceeds 80% of the viewport height.
 */
export function buildInlineIframe(url: string, size?: InlineSnippetSize): string {
  const src = escapeAttribute(withInlineEmbed(url));
  const iframe = (style: string) => `<iframe
  src="${src}"
  loading="lazy"
  title="Interactive demo"
  allow="clipboard-read; clipboard-write; fullscreen"
  frameborder="0"
  allowfullscreen
  style="${style}"
></iframe>`;
  if (!size) {
    return iframe('display: block; width: 100%; height: min(900px, 80vh); height: min(900px, 80svh); border: 0;');
  }
  const { width, height } = size.aspectRatio;
  const chrome = size.verticalChromeHeight ?? 0;
  const edge = chrome > 0 ? INLINE_PLAYER_EDGE_ALLOWANCE_PX : 0;
  return `<div style="container-type: inline-size; width: 100%; max-width: ${maxWidthForViewportHeight(size, 'vh')}; max-width: ${maxWidthForViewportHeight(size, 'svh')}; margin: 0 auto;">
  <div style="position: relative; width: 100%; height: calc(100cqw * ${formatCssNumber(height)} / ${formatCssNumber(width)} + ${formatCssNumber(chrome)}px + ${formatCssNumber(edge)}px);">
    ${iframe('position: absolute; inset: 0; width: 100%; height: 100%; border: 0;').split('\n').join('\n    ')}
  </div>
</div>`;
}

/** Where the loader script lives: next to the hosted demos, or next to a static build. */
export function embedScriptUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/${EMBED_SCRIPT_PATH}`;
}

/** The popup loader: a stub plus the script tag, added once per page. */
export function buildPopupLoader(origin: string): string {
  return `${LOADER_STUB}
<script src="${escapeAttribute(embedScriptUrl(origin))}" async></script>`;
}

/** One framework-specific trigger button calling `InteractiveDemo.open(<url>)`. */
export function buildPopupButton(
  framework: (typeof POPUP_FRAMEWORKS)[number]['id'],
  target: string,
  label: string,
): string {
  const jsArg = JSON.stringify(target);
  const htmlArg = `'${target
    .split('\\')
    .join('\\\\')
    .split("'")
    .join("\\'")
    .split('\n')
    .join('\\n')}'`;
  switch (framework) {
    case 'react':
      return `<button onClick={() => InteractiveDemo.open(${jsArg})}>${label}</button>`;
    case 'next':
      return `"use client";

export function DemoTrigger() {
  return <button onClick={() => InteractiveDemo.open(${jsArg})}>${label}</button>;
}`;
    case 'vue':
      return `<button @click="InteractiveDemo.open(${htmlArg})">${label}</button>`;
    case 'svelte':
      return `<button on:click={() => InteractiveDemo.open(${jsArg})}>${label}</button>`;
    case 'html':
    default:
      return `<button onclick="InteractiveDemo.open(${htmlArg})">${label}</button>`;
  }
}

/**
 * Render the full, human-readable embed instructions for one mode. `origin`
 * is where `embed.js` is served from: the hosting service, or the static host.
 */
export function formatEmbedSnippet(args: {
  mode: EmbedMode;
  url: string;
  origin: string;
  label: string;
  size?: InlineSnippetSize;
}): string {
  if (args.mode === 'inline') {
    return `Inline embed — paste into your page:\n\n${buildInlineIframe(args.url, args.size)}\n`;
  }
  const buttons = POPUP_FRAMEWORKS.map(
    (fw) =>
      `  ${fw.label}:\n${buildPopupButton(fw.id, args.url, args.label)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')}`,
  ).join('\n\n');
  return `Popup embed.

1. Add this loader once (e.g. before </body>):

${buildPopupLoader(args.origin)}

2. Add a trigger button (pick your framework):

${buttons}
`;
}

/** Structured form of the snippets for `--json` consumers. */
export function buildEmbedSnippetData(args: {
  mode: EmbedMode;
  url: string;
  origin: string;
  label: string;
  size?: InlineSnippetSize;
}): Record<string, unknown> {
  if (args.mode === 'inline') {
    return { iframe: buildInlineIframe(args.url, args.size) };
  }
  return {
    loader: buildPopupLoader(args.origin),
    triggers: Object.fromEntries(
      POPUP_FRAMEWORKS.map((fw) => [
        fw.id,
        buildPopupButton(fw.id, args.url, args.label),
      ]),
    ),
  };
}
