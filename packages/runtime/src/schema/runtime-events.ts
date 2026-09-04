import type { ButtonAction } from './button';

/** One submitted form field, carrying its author-facing `label` alongside
 *  the internal `id` so downstream consumers can display
 *  "Email" rather than the opaque field id. Producers resolve the label from
 *  the demo config at submit time — the only place the config is reliably
 *  available — so consumers never have to. */
export interface SubmittedFormField {
  id: string;
  label: string;
  value: string;
}

/**
 * Player event stream emitted through `Demo` / `Demo.Root` `onEvent`.
 */
export type DemoEvent =
  | {
      type: 'ready';
      demoId: string;
      stepIds: string[];
      timestamp: number;
    }
  | {
      type: 'step_view';
      demoId: string;
      stepId: string;
      stepIndex: number;
      timestamp: number;
    }
  | {
      type: 'complete';
      demoId: string;
      timestamp: number;
    }
  | {
      type: 'cta_click';
      demoId: string;
      stepId: string;
      widgetId?: string;
      annotationId?: string;
      action: ButtonAction;
      timestamp: number;
    }
  | {
      type: 'form_submit';
      demoId: string;
      stepId: string;
      widgetId: string;
      /** Ordered list of submitted fields, each with its author-facing label
       *  resolved from the demo config (see {@link SubmittedFormField}). */
      fields: SubmittedFormField[];
      timestamp: number;
    }
  | {
      type: 'embed_message';
      demoId: string;
      stepId: string;
      widgetId: string;
      data: unknown;
      timestamp: number;
    }
  | {
      type: 'custom';
      demoId: string;
      name: string;
      stepId?: string;
      widgetId?: string;
      annotationId?: string;
      payload?: unknown;
      timestamp: number;
    };
