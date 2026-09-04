// `interactive-demo capture` — record a click-through of a live web app.
//
// A thin front-end over `src/capture/`. The step capture functions, the
// start/stop/cancel handlers and the detached listener live there; this file
// only binds the command surface.
import { CAPTURE_USAGE, dispatchCapture } from '../capture/index.js';
import type { ParsedArgs } from '../capture/options.js';

export { CAPTURE_USAGE };

export interface RunCaptureOptions {
  cwd: string;
  subcommand: string | undefined;
  args: ParsedArgs;
}

export async function runCapture(options: RunCaptureOptions): Promise<number> {
  const { cwd, subcommand, args } = options;
  return dispatchCapture({ cwd, subcommand, args });
}
