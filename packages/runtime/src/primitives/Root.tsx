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
   * Escape hatch for hosts with their own URL rule (a CDN, signed URLs):
   * turns a relative media path from the config (`assets/shot.png`) into
   * the URL to fetch. Absolute URLs never reach it. Takes precedence over
   * `baseUrl`.
   */
  resolveAssetUrl?: (path: string) => string;
  /**
   * Where relative media paths in the config (`assets/shot.png`) are
   * served from: the demo's folder as a URL, absolute or site-relative,
   * with or without a trailing slash. Relative paths are joined onto it;
   * absolute URLs pass through untouched.
   */
  baseUrl?: string;
  /**
   * Absolute URL of this demo. Forwarded to context so
   * the minimal controls' copy-link button can copy it. Omit when there is
   * no public URL yet (e.g. an unsaved editor preview) to hide the button.
   */
  shareUrl?: string | null;
};

/** `base` + `path`, with one slash between them and a leading `./` dropped. */
export function joinBaseUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = path.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${b}${p}`;
}

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
  resolveAssetUrl,
  baseUrl,
  shareUrl,
}: RootProps) {
  // Media resolver. Two shapes the runtime sees in `demo.config`
  // (`background.src`, `backgroundImage.src`, `voiceover.src`, widget
  // logo and image, cover backdrop):
  //
  //   1. Absolute URL (`http(s)://`, `data:`, `blob:`, `/…`) — pass-through.
  //   2. Relative path (`assets/foo.png`, `./assets/foo.png`) — the host's
  //      `resolveAssetUrl` if given, else joined onto `baseUrl`, else passed
  //      through for the browser to resolve against the page.
  //
  // The pre-release `asset:<id>` pointer is not resolved by anything any
  // more; it passes through with one warning per id so a stale config is
  // visible rather than silently blank.
  const warnedAssetIdsRef = useRef<Set<string>>(new Set());
  const resolveAsset = useMemo<AssetResolver>(() => {
    return (uri: string): string => {
      if (!uri) return uri;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(uri) && !uri.startsWith('asset:')) {
        return uri;
      }
      if (uri.startsWith('asset:')) {
        if (!warnedAssetIdsRef.current.has(uri)) {
          warnedAssetIdsRef.current.add(uri);
          if (typeof console !== 'undefined') {
            console.warn(
              `[interactive-demo] "${uri}" is an asset pointer, which is no longer supported; ` +
                'reference the file by a path such as assets/<file>.',
            );
          }
        }
        return uri;
      }
      if (resolveAssetUrl) return resolveAssetUrl(uri);
      return baseUrl ? joinBaseUrl(baseUrl, uri) : uri;
    };
  }, [baseUrl, resolveAssetUrl]);

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
