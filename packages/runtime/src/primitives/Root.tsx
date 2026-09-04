import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DemoPlayerContext,
  type AssetResolver,
  type DemoEventInput,
} from '../context';
import { usePlayerController } from '../engine/usePlayer';
import type {
  AssetEntry,
  DemoEvent,
  DemoBackground,
  ThemeTokens,
} from '../schema';
import { defaultThemeTokens } from '../theme/tokens';
import {
  DEFAULT_DEMO_THEME_ID,
  demoThemeDefaultTokensFor,
} from '../themes/token-defaults';

export type RootProps = {
  config: unknown;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Identifier for the active visual theme. Emitted as `data-demo-theme` on
   * the root so host CSS can scope overrides to a specific theme
   * (e.g. `[data-demo-theme="mono"] .demo-controls { ... }`).
   */
  themeId?: string;
  /**
   * Host-level theme token overrides. Root resolves
   * preset defaults from `themeId`, then applies these, then applies
   * `config.theme.tokens` so demo-level overrides still win.
   */
  themeTokens?: Partial<ThemeTokens>;
  /**
   * Optional attribution slot rendered on cover screens. This is
   * a *host* watermark, not authored by the demo — pass it from the
   * application that hosts the player.
   */
  attribution?: ReactNode;
  /**
   * Canonical runtime event stream. The package stays headless: hosts
   * decide whether events become analytics, form persistence, webhooks,
   * agent observations, or no-ops.
   */
  onEvent?: (event: DemoEvent) => void;
  /**
   * Fires once when the player has finished its initial mount, providing
   * the validated `demo` and stable `controls` to the host. Used by the
   * render server to drive playback (seekToStep, pause, play)
   * without restructuring the host bundle's component tree. Runtime
   * events still flow through `onEvent`; this is just the initial
   * imperative handshake.
   */
  onReady?: (player: {
    demo: NonNullable<ReturnType<typeof usePlayerController>['demo']>;
    controls: ReturnType<typeof usePlayerController>['controls'];
  }) => void;
  /**
   * Optional capture-asset manifest. Each entry's `id` is what the
   * demo config references via `asset:<id>`. When omitted (or an id is
   * missing), the resolver falls back to passing the URI through
   * unchanged — host configs that ship raw URLs keep working.
   */
  assets?: AssetEntry[];
  /**
   * Builds a fetchable URL for a given asset entry. Host-supplied so each
   * host (a static page, the CLI dev server, the editor) can implement its
   * own URL strategy without the player knowing about any of them.
   * Called only when an `asset:<id>` URI matches an entry in
   * `assets`; raw URLs (`http://`, `https://`, `data:`, `blob:`)
   * bypass it.
   */
  resolveAssetUrl?: (entry: AssetEntry) => string;
  /**
   * Builds a fetchable URL for raw in-repo media paths such as
   * `assets/logo.png` or `./images/logo.png`. `asset:<id>` still goes
   * through `resolveAssetUrl`; this hook is only for authored/repo paths
   * that are not in assets.json.
   */
  resolveAssetUri?: (uri: string) => string;
  /**
   * Absolute URL of this demo. Forwarded to context so
   * the minimal controls' copy-link button can copy it. Omit when there is
   * no public URL yet (e.g. an unsaved editor preview) to hide the button.
   */
  shareUrl?: string | null;
};

export function Root({
  config,
  children,
  className,
  style,
  themeId,
  themeTokens,
  attribution,
  onEvent,
  onReady,
  assets,
  resolveAssetUrl,
  resolveAssetUri,
  shareUrl,
}: RootProps) {
  // Asset URI resolver. Three URI shapes the runtime sees in
  // `demo.config` (`background.src`, `backgroundImage.src`,
  // `voiceover.src`, cover bg image, etc.):
  //
  //   1. `asset:<id>` — the canonical capture pointer. Looked up in
  //      `assets` by id, then handed to `resolveAssetUrl` (a static page
  //      builds a relative URL; the CLI dev server builds a
  //      `/<slug>/<file>` URL). This is what the capture pipeline writes.
  //
  //   2. Absolute URL (`http(s)://`, `data:`, `blob:`) — pass-through.
  //      Theme-preview demos, embeds, and any author-supplied external
  //      media land here.
  //
  //   3. In-repo path (`./assets/foo.png`, `assets/foo.png`) —
  //      pass-through. The "user dropped a file in the repo" path. Not
  //      recommended (the pointer model dedups + survives moves better)
  //      but supported: the host is responsible for serving the bytes at
  //      the URL the browser computes.
  //
  // Mapping is built once per render and memoised on
  // `[assets, resolveAssetUrl]`. `asset:<id>` not present in the
  // manifest (or no `resolveAssetUrl` supplied) returns the URI
  // verbatim and warns once per id — avoids cascading errors when an
  // asset is dropped from the manifest before the config is updated.
  const warnedAssetIdsRef = useRef<Set<string>>(new Set());
  const resolveAsset = useMemo<AssetResolver>(() => {
    const byId = new Map<string, AssetEntry>();
    if (assets) {
      for (const entry of assets) {
        byId.set(entry.id, entry);
      }
    }
    return (uri: string): string => {
      if (!uri) return uri;
      const isAbsolute =
        uri.startsWith('http://') ||
        uri.startsWith('https://') ||
        uri.startsWith('data:') ||
        uri.startsWith('blob:');
      if (isAbsolute) {
        return uri;
      }
      if (!uri.startsWith('asset:')) {
        return resolveAssetUri ? resolveAssetUri(uri) : uri;
      }
      const id = uri.slice('asset:'.length);
      const entry = byId.get(id);
      if (!entry || !resolveAssetUrl) {
        if (!warnedAssetIdsRef.current.has(id)) {
          warnedAssetIdsRef.current.add(id);
          if (typeof console !== 'undefined') {
            console.warn(
              `[interactive-demo] Unresolved asset URI "asset:${id}" — ` +
                (entry
                  ? 'no resolveAssetUrl prop supplied'
                  : 'id not found in assets manifest') +
                '. Passing URI through unchanged.',
            );
          }
        }
        return uri;
      }
      return resolveAssetUrl(entry);
    };
  }, [assets, resolveAssetUri, resolveAssetUrl]);

  const player = usePlayerController(config, { resolveAsset });
  // 4-token cascade (primary, secondary, font, radius). Resolve the
  // selected preset locally so a raw demo config can still inherit the
  // active theme's primary; host tokens and demo tokens layer on top.
  // Removed tokens (bg/fg/primary-fg/secondary-fg/font-size/controls-bg)
  // live as CSS-level defaults in styles.css now.
  const activeThemeId =
    themeId ?? player.demo?.theme?.preset ?? DEFAULT_DEMO_THEME_ID;
  const presetTheme =
    demoThemeDefaultTokensFor(activeThemeId) ?? defaultThemeTokens;
  const theme: ThemeTokens = {
    ...presetTheme,
    ...(themeTokens ?? {}),
    ...(player.demo?.theme?.tokens ?? {}),
  };
  const primary = theme.primary ?? defaultThemeTokens.primary;
  const themeStyle: Record<string, string | number> = {
    '--demo-primary': primary,
    '--demo-primary-fg': readableTextColor(primary),
    '--demo-secondary': theme.secondary ?? defaultThemeTokens.secondary,
    '--demo-radius': theme.radius ?? defaultThemeTokens.radius,
    '--demo-font': theme.font ?? defaultThemeTokens.font,
  };

  const emitEvent = useCallback(
    (event: DemoEventInput) => {
      if (!player.demo) return;
      onEvent?.({
        ...event,
        demoId: player.demo.id,
        timestamp: Date.now(),
      } as DemoEvent);
    },
    [onEvent, player.demo],
  );

  const readyFiredRef = useRef(false);

  useEffect(() => {
    if (!readyFiredRef.current || !player.demo) return;
    emitEvent({
      type: 'step_view',
      stepId: player.state.currentStepId,
      stepIndex: player.state.currentStepIndex,
    });
  }, [
    emitEvent,
    player.demo,
    player.state.currentStepId,
    player.state.currentStepIndex,
  ]);

  useEffect(() => {
    if (player.state.status === 'ended') {
      emitEvent({ type: 'complete' });
    }
  }, [emitEvent, player.state.status]);

  // Fire `onReady` exactly once, after the demo has parsed and the player
  // has mounted. Subsequent state transitions flow through `onEvent`;
  // `controls` is stable across renders so the host can
  // cache it directly off this initial handshake.
  useEffect(() => {
    if (readyFiredRef.current || !player.demo) return;
    readyFiredRef.current = true;
    onReady?.({ demo: player.demo, controls: player.controls });
    emitEvent({
      type: 'ready',
      stepIds: player.demo.steps.map((step) => step.id),
    });
    emitEvent({
      type: 'step_view',
      stepId: player.state.currentStepId,
      stepIndex: player.state.currentStepIndex,
    });
  }, [
    emitEvent,
    onReady,
    player.demo,
    player.controls,
    player.state.currentStepId,
    player.state.currentStepIndex,
  ]);

  const backgroundOverride = demoBackgroundOverrideStyle(
    player.demo?.background,
    resolveAsset,
  );
  const mergedStyle = {
    ...themeStyle,
    ...backgroundOverride.style,
    ...style,
  } as CSSProperties;

  const contextValue = useMemo(
    () => ({
      ...player,
      attribution,
      emitEvent,
      resolveAsset,
      shareUrl,
    }),
    [
      player,
      attribution,
      emitEvent,
      resolveAsset,
      shareUrl,
    ],
  );

  return (
    <DemoPlayerContext.Provider value={contextValue}>
      <div
        className={className ?? 'demo-root'}
        style={mergedStyle}
        data-demo-theme={activeThemeId}
        data-demo-background={backgroundOverride.type}
      >
        {children}
      </div>
    </DemoPlayerContext.Provider>
  );
}

function demoBackgroundOverrideStyle(
  background: DemoBackground | undefined,
  resolveAsset: AssetResolver,
): {
  type?: DemoBackground['type'];
  style: Record<string, string>;
} {
  if (!background) return { style: {} };
  if (background.type === 'none') return { type: 'none', style: {} };
  if (background.type === 'color') {
    if (background.from && background.to) {
      return {
        type: 'color',
        style: {
          '--demo-background': `linear-gradient(135deg, ${background.from}, ${background.to})`,
        },
      };
    }
    if (background.color) {
      return {
        type: 'color',
        style: { '--demo-background': background.color },
      };
    }
    return { type: 'color', style: {} };
  }
  const src = background.src ? resolveAsset(background.src) : '';
  return {
    type: 'image',
    style: src
      ? {
          '--demo-background-color': background.color ?? '#f5f5f5',
          '--demo-background-image': `url("${escapeCssUrl(src)}")`,
          '--demo-background-blur': `${backgroundBlur(background.blur)}px`,
        }
      : {},
  };
}

function backgroundBlur(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(48, Math.max(0, value));
}

function escapeCssUrl(value: string): string {
  return value.replace(/["\\\n\r\f]/g, (char) => `\\${char}`);
}

function readableTextColor(background: string): '#0a0a0a' | '#ffffff' {
  const rgb = parseHexColor(background);
  if (!rgb) return '#ffffff';
  const toLinear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgb;
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.48 ? '#0a0a0a' : '#ffffff';
}

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b] = hex;
    if (!r || !g || !b) return null;
    return [r, g, b].map((channel) =>
      Number.parseInt(`${channel}${channel}`, 16),
    ) as [number, number, number];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [0, 2, 4].map((start) =>
      Number.parseInt(hex.slice(start, start + 2), 16),
    ) as [number, number, number];
  }
  return null;
}
