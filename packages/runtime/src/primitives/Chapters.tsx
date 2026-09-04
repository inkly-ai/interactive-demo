import { useDemoPlayerContext } from '../context';

export function Chapters() {
  const { demo, state, controls } = useDemoPlayerContext();

  if (!demo || demo.chapters.length === 0) {
    return null;
  }

  return (
    <nav className="demo-chapters" aria-label="Demo chapters">
      {demo.chapters.map((chapter) => {
        const isActive = chapter.stepIds.includes(state.currentStepId);

        return (
          <button
            key={chapter.id}
            type="button"
            className="demo-chapter-button cursor-pointer"
            aria-current={isActive ? 'step' : undefined}
            onClick={() => controls.seekToChapter(chapter.id)}
          >
            {chapter.title}
          </button>
        );
      })}
    </nav>
  );
}
