import { createContext, useContext, type ReactNode } from 'react';
import type { Dispatch } from 'react';
import type { ZodError } from 'zod';
import type {
  AssetEntry,
  DemoEvent,
  Demo,
} from './schema';
import type {
  Action,
  PlayerControls,
  PlayerState,
  PublicPlayerState,
} from './engine';

/**
 * Resolves a media reference (a relative path, or any raw URL — see pass-through rules
 * in `Root.tsx`) to something an `<img>`/`<video>` `src` can actually
 * fetch. Always provided by `Root`; falls back to identity when the host
 * doesn't supply an assets manifest + url builder.
 */
export type AssetResolver = (uri: string) => string;
export type DemoEventInput = DemoEvent extends infer Event
  ? Event extends DemoEvent
    ? Omit<Event, 'demoId' | 'timestamp'>
    : never
  : never;

export type DemoPlayerContextValue = {
  demo: Demo | null;
  state: PublicPlayerState;
  internalState: PlayerState;
  controls: PlayerControls;
  errors: ZodError | null;
  dispatch: Dispatch<Action>;
  /**
   * Optional attribution slot rendered on cover screens. Filled by the
   * host rather than the demo author, so it stays out of demo config.
   */
  attribution: ReactNode;
  /**
   * Internal runtime event emitter. Root normalizes every event with demo id
   * and timestamp before forwarding it to the public `onEvent` prop.
   */
  emitEvent: (event: DemoEventInput) => void;
  /**
   * Resolves a media reference to a fetchable URL. Always non-null —
   * `Root` supplies a pass-through fallback when no host resolver is
   * configured. Read via the `useAssetUrl` hook rather than the raw
   * context so call sites don't have to short-circuit on falsy inputs.
   */
  resolveAsset: AssetResolver;
  /**
   * Absolute URL of this demo, supplied by the host
   * (the player package is framework-agnostic and sandboxed, so it can't
   * derive the public URL itself). The minimal controls' copy-link button
   * copies this. Null/undefined hides that button.
   */
  shareUrl?: string | null;
};

export const DemoPlayerContext =
  createContext<DemoPlayerContextValue | null>(null);

export function useDemoPlayerContext(): DemoPlayerContextValue {
  const context = useContext(DemoPlayerContext);

  if (!context) {
    throw new Error('Demo primitives must be rendered inside Demo.Root.');
  }

  return context;
}

/**
 * Resolve a media reference (or any other string the host wants to
 * pass through unchanged) to a fetchable URL. Hook form so call sites
 * read the player context exactly once per render and stay
 * rules-of-hooks-clean.
 *
 * Falsy input → empty string. The DOM treats `src=""` as "no source",
 * matching how `<img src={undefined}>` would behave; consumers don't
 * need to add their own short-circuit.
 */
export function useAssetUrl(uri: string | null | undefined): string {
  const context = useContext(DemoPlayerContext);
  if (!uri) return '';
  if (!context) return uri;
  return context.resolveAsset(uri);
}

export type { AssetEntry };
