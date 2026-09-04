// Internal entry point for the detached auto-capture listener process.
//
// This is NOT a public CLI command — it has no entry in `main.ts` and never
// appears in the command surface. `interactive-demo capture start` spawns it as
// a separate, detached process (see `spawnListener`) so capture continues on
// every click while the foreground `start` returns immediately.
//
// It is built as its own bundle (`dist/capture-listener.js`, a sibling of
// `dist/cli.js`) and invoked directly with node + `--session <id>`.
import mri from 'mri';
import { runListen } from '../capture/listener.js';
import type { ParsedArgs } from '../capture/options.js';

async function main(): Promise<void> {
  const args = mri(process.argv.slice(2)) as unknown as ParsedArgs;
  process.exit(await runListen(args));
}

main().catch((err) => {
  process.stderr.write(`capture listener failed: ${(err as Error).message}\n`);
  process.exit(1);
});
