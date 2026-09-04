import { useEffect, useRef } from 'react';

export function useTick(
  isRunning: boolean,
  onTick: (deltaMs: number) => void,
): void {
  const onTickRef = useRef(onTick);
  const lastTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!isRunning) {
      lastTimeRef.current = null;
      return undefined;
    }

    const tick = (time: number) => {
      const lastTime = lastTimeRef.current ?? time;
      lastTimeRef.current = time;
      // Clamp the per-frame delta. When the tab is backgrounded then
      // refocused, rAF stops firing, so the first frame after refocus
      // carries a multi-second delta that can jump an autoplay demo
      // straight to `ended`. Capping at 250ms keeps normal-frame behavior
      // identical (frames are ~16ms) while neutralizing the refocus spike.
      const delta = Math.min(time - lastTime, 250);
      onTickRef.current(delta);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      lastTimeRef.current = null;
    };
  }, [isRunning]);
}
