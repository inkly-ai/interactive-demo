import { useDemoPlayerContext } from '../context';
import { Markdown } from '../utils/markdown';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export function MobileFooter() {
  const { demo, state, controls } = useDemoPlayerContext();

  const stepCount = demo?.steps.length ?? 0;
  const atFirst = state.currentStepIndex <= 0;
  const atLast = state.currentStepIndex >= stepCount - 1;

  const currentStep = demo?.steps[state.currentStepIndex] ?? null;
  const firstMessageText =
    currentStep && currentStep.kind === 'content'
      ? currentStep.annotations.find(
          (a): a is typeof a & { type: 'message'; text?: string } =>
            a.type === 'message' && typeof a.text === 'string' && a.text.length > 0,
        )?.text ?? null
      : null;

  return (
    <div className="demo-mobile-footer">
      <div className="demo-mobile-footer-message">
        {firstMessageText ? (
          <Markdown text={firstMessageText} />
        ) : stepCount > 0 ? (
          <span className="demo-mobile-footer-step">
            {state.currentStepIndex + 1} of {stepCount}
          </span>
        ) : null}
      </div>
      <div className="demo-mobile-footer-nav">
        <button
          type="button"
          className="demo-mobile-footer-button cursor-pointer"
          aria-label="Previous step"
          onClick={controls.prev}
          disabled={atFirst}
        >
          <ChevronLeftIcon className="demo-icon" />
        </button>
        <button
          type="button"
          className="demo-mobile-footer-button cursor-pointer"
          aria-label="Next step"
          onClick={controls.next}
          disabled={atLast}
        >
          <ChevronRightIcon className="demo-icon" />
        </button>
      </div>
    </div>
  );
}
