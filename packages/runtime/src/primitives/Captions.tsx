import { useDemoPlayerContext } from '../context';

export type CaptionsProps = {
  className?: string;
};

export function Captions({ className }: CaptionsProps) {
  const { demo, state } = useDemoPlayerContext();
  const caption = state.activeCaption;

  // Captions only render on `kind: 'content'` steps. Cover steps
  // don't have captions in the schema.
  const currentStep = demo?.steps[state.currentStepIndex];
  if (!currentStep || currentStep.kind !== 'content') return null;
  if (!state.captionsEnabled) return null;
  if (!caption) return null;

  return (
    <div className={className ?? 'demo-caption'} aria-live="polite">
      {caption.text}
    </div>
  );
}
