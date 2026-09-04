import type { CSSProperties } from 'react';
import type { BlurAnnotation } from '../schema';
import type { AnnotationProps } from './registry';

export function Blur({ annotation }: AnnotationProps<BlurAnnotation>) {
  const style = {
    '--x': annotation.x,
    '--y': annotation.y,
    '--w': annotation.w,
    '--h': annotation.h,
    '--blur': `${annotation.intensity}px`,
  } as CSSProperties;

  return (
    <div
      className="demo-annotation-region demo-blur-annotation"
      style={style}
      aria-hidden="true"
    />
  );
}
