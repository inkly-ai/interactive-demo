import { useEffect, useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject } from 'react';
import type { Demo } from '../schema';
import type { AssetResolver } from '../context';
import type { Action, PlayerState } from './reducer';

type UseAudioOptions = {
  demo: Demo | null;
  state: PlayerState;
  dispatch: Dispatch<Action>;
  resolveAsset?: AssetResolver;
  enabled?: boolean;
};

function getAudioElement(ref: MutableRefObject<HTMLAudioElement | null>) {
  if (ref.current) {
    return ref.current;
  }

  if (typeof Audio === 'undefined') {
    return null;
  }

  ref.current = new Audio();
  return ref.current;
}

function playAudio(audio: HTMLAudioElement): void {
  const result = audio.play();

  if (result && typeof result.catch === 'function') {
    result.catch((err: unknown) => {
      // NotAllowedError is the expected pre-gesture autoplay rejection.
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        return;
      }
      console.error('[demo-react] audio play() failed:', err);
    });
  }
}

function isUnresolvedAssetUri(
  authoredSrc: string | null,
  resolvedSrc: string,
): boolean {
  return (
    !!authoredSrc &&
    authoredSrc.startsWith('asset:') &&
    resolvedSrc === authoredSrc
  );
}

export function useAudio({
  demo,
  state,
  dispatch,
  resolveAsset,
  enabled = true,
}: UseAudioOptions): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTimeUpdateRef = useRef(-Infinity);
  const currentStep = useMemo(
    () => demo?.steps[state.currentStepIndex] ?? null,
    [demo, state.currentStepIndex],
  );
  // Authored voiceover URI as-written (asset:<id> | relative repo path |
  // absolute URL). Used as the "is there audio?" gate and as a stable
  // dep for the effects below — its identity changes only when the demo
  // author edits the field. The actual `audio.src` we feed the element
  // is the resolved form (see `resolvedVoiceoverSrc`).
  const voiceoverSrc = currentStep?.voiceover?.src ?? null;
  // Resolved URL: `asset:<id>` → fetchable URL via the host resolver,
  // relative + raw URLs pass through. Audio is owned by the player
  // controller, which runs before Root's context provider exists, so the
  // resolver is passed directly by Root instead of read from context.
  const resolvedVoiceoverSrc = voiceoverSrc
    ? (resolveAsset?.(voiceoverSrc) ?? voiceoverSrc)
    : '';

  useEffect(() => {
    if (!enabled || !demo || (!voiceoverSrc && !audioRef.current)) {
      return undefined;
    }

    const audio = getAudioElement(audioRef);
    if (!audio) {
      return undefined;
    }

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        dispatch({
          type: 'AUDIO_LOADED',
          durationMs: audio.duration * 1000,
        });
      }
    };

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastTimeUpdateRef.current < 100) {
        return;
      }

      lastTimeUpdateRef.current = now;
      dispatch({
        type: 'AUDIO_TIME',
        currentTime: audio.currentTime * 1000,
      });
    };

    const handleError = () => {
      const err = audio.error;
      console.error(
        `[demo-react] audio error for ${audio.src || '(no src)'}:`,
        err ? { code: err.code, message: err.message } : 'unknown',
      );
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
    };
  }, [demo, dispatch, enabled, voiceoverSrc]);

  useEffect(() => {
    if (!enabled || !demo) {
      return;
    }

    if (!voiceoverSrc && !audioRef.current) {
      dispatch({ type: 'AUDIO_TIME', currentTime: 0 });
      return;
    }

    const audio = getAudioElement(audioRef);
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    lastTimeUpdateRef.current = -Infinity;
    dispatch({ type: 'AUDIO_TIME', currentTime: 0 });

    if (
      !voiceoverSrc ||
      isUnresolvedAssetUri(voiceoverSrc, resolvedVoiceoverSrc)
    ) {
      audio.removeAttribute('src');
      return;
    }

    audio.src = resolvedVoiceoverSrc;
    audio.load();

    if (state.isPlaying) {
      playAudio(audio);
    } else if (state.status !== 'ended' && (demo.chrome?.autoplay ?? false)) {
      // The step carries a voiceover but the player is parked (first load,
      // or the viewer advanced while paused). Auto-start so the narration
      // is heard on entry instead of sitting silent. We dispatch PLAY
      // rather than calling playAudio() directly so `state.isPlaying` stays
      // truthful — the pause button, the step timer, and any video
      // background follow from the same flag. `state.isPlaying` /
      // `state.status` are read as an entry-time snapshot (kept out of the
      // deps, like `isPlaying` above) so a mid-step play/pause toggle
      // doesn't re-run the load/reset. Skipped when the demo has ended,
      // since PLAY from the 'ended' state restarts at step 0. Gated on
      // `chrome.autoplay`: when autoplay is off, the documented "park at
      // each step" contract takes precedence over voiceover auto-start.
      dispatch({ type: 'PLAY' });
    }
    // `state.isPlaying` / `state.status` are intentionally entry-time
    // snapshots, not deps — re-running this on a play/pause toggle would
    // reset the audio position mid-step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    demo,
    dispatch,
    enabled,
    resolvedVoiceoverSrc,
    state.currentStepId,
    voiceoverSrc,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !demo ||
      !voiceoverSrc ||
      isUnresolvedAssetUri(voiceoverSrc, resolvedVoiceoverSrc)
    ) {
      return;
    }

    const audio = getAudioElement(audioRef);
    if (!audio) {
      return;
    }

    if (state.isPlaying) {
      playAudio(audio);
    } else {
      audio.pause();
    }
  }, [demo, enabled, resolvedVoiceoverSrc, state.isPlaying, voiceoverSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = state.isMuted;
  }, [state.isMuted, voiceoverSrc]);
}
