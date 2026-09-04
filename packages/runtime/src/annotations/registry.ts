import type { ComponentType } from 'react';
import type { Annotation } from '../schema';
import { Blur } from './Blur';
import { Message } from './Message';
import { Text } from './Text';

export type AnnotationProps<T extends Annotation = Annotation> = {
  annotation: T;
  onAdvance: () => void;
  containerSize: { width: number; height: number };
};

export type AnnotationRenderer<T extends Annotation = Annotation> =
  ComponentType<AnnotationProps<T>>;

export type AnnotationRendererMap = Partial<
  Record<Annotation['type'], AnnotationRenderer>
>;

export const builtInAnnotations: Record<
  Annotation['type'],
  AnnotationRenderer
> = {
  message: Message as AnnotationRenderer,
  blur: Blur as AnnotationRenderer,
  text: Text as AnnotationRenderer,
};
