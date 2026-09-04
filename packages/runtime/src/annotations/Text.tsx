import type { CSSProperties } from 'react';
import type { TextAnnotation } from '../schema';
import type { AnnotationProps } from './registry';
import { Markdown } from '../utils/markdown';

export function Text({ annotation }: AnnotationProps<TextAnnotation>) {
  const style = {
    '--x': annotation.x,
    '--y': annotation.y,
    fontSize: annotation.fontSize,
    color: annotation.color ?? 'var(--demo-fg)',
  } as CSSProperties;

  return (
    <div className="demo-annotation-point demo-text-annotation" style={style}>
      <Markdown text={annotation.text} />
    </div>
  );
}
