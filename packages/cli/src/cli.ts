import { main } from './main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    process.stderr.write(`interactive-demo: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
