import { useDemoPlayerContext } from '../context';

export function StepIndicator() {
  const { demo, state } = useDemoPlayerContext();

  if (!demo) {
    return null;
  }

  return (
    <span className="demo-step-indicator">
      {state.currentStepIndex + 1} / {demo.steps.length}
    </span>
  );
}
