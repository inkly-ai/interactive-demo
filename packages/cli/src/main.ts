import mri from 'mri';
import { runAddDemo, runInit } from './commands/init.js';
import { runDev } from './commands/dev.js';
import { runValidate } from './commands/validate.js';
import { runBuild } from './commands/build.js';
import { runVersion } from './commands/version.js';
import { CAPTURE_USAGE, runCapture } from './commands/capture.js';
import { runLogin, runLogout, runStatus } from './commands/login.js';
import { runPublish, runPublishList } from './commands/publish.js';
import { runEmbed } from './commands/embed.js';
import { PROJECT_FILE } from './project.js';

const BIN = 'interactive-demo';

const USAGE = `${BIN} — author, preview and build interactive product demos

Usage:
  ${BIN} init <name>                 Scaffold a new project.
  ${BIN} init --demo <slug>          Add a demo to the current project.
  ${BIN} dev [<path>] [--port <n>]   Start the local preview + editor server.
  ${BIN} validate [--json] [--strict]
                                     Validate the project and demo files.
  ${BIN} build [--out <dir>]         Write a static folder per demo.
  ${BIN} capture <start|stop|…>      Record a click-through of a live web app.
  ${BIN} login [--token <token>]     Log in to the hosting service.
  ${BIN} logout                      Remove the saved credentials.
  ${BIN} publish [<demo>] [--new]    Publish a demo to the hosting service.
  ${BIN} embed [<demo>] [--mode <m>] Print the embed snippet for a hosted demo.
  ${BIN} version                     Print the CLI version.
  ${BIN} help [command]              Show CLI help.

Run \`${BIN} <command> --help\` for more.
`;

const INIT_USAGE = `${BIN} init — scaffold a new project, or add a demo to one

Usage:
  ${BIN} init <name> [--theme <preset>] [--no-starter-demo]
  ${BIN} init --demo <slug> [--from <dir>]

Arguments:
  <name>                 Folder name for the new project (kebab-case).

Options:
  --theme <preset>       Theme preset id to write to ${PROJECT_FILE}.
  --no-starter-demo      Scaffold an EMPTY project (no \`getting-started\`
                         sample demo).
  --demo <slug>          Inside an existing project: add demos/<slug>/ with a
                         starter demo (an intro cover, one content step on a
                         placeholder screenshot, an outro cover).
  --from <dir>           With --demo: import an existing demo folder (one with
                         a demo.config.json) instead of scaffolding. Copies the
                         config, assets.json and assets/ bytes.
`;

const DEV_USAGE = `${BIN} dev — start the local preview server

Usage:
  ${BIN} dev [<path>] [--port <n>]

Arguments:
  <path>        A project root (a directory containing ${PROJECT_FILE}) or a
                bare demo folder (a directory containing demo.config.json).
                Defaults to the current directory. Each demo is served at
                /<slug>/.

Options:
  --port <n>    Preferred port. Defaults to 3000; if taken, the CLI tries the
                next available port. Must be 1-65535.
`;

const VALIDATE_USAGE = `${BIN} validate — validate a project

Usage:
  ${BIN} validate [--json] [--strict]

Options:
  --json       Print machine-readable JSON.
  --strict     Treat warnings as failures.
`;

const BUILD_USAGE = `${BIN} build — write a static folder per demo

Usage:
  ${BIN} build [--out <dir>]

Options:
  --out <dir>  Output folder, relative to the project root (default: dist).

Each demo is written to <out>/<slug>/ as index.html + player.js + player.css
+ assets/, ready to deploy as static files and embed with an iframe.
`;

const VERSION_USAGE = `${BIN} version — print the CLI version

Usage:
  ${BIN} version
  ${BIN} --version
`;

const LOGIN_USAGE = `${BIN} login — log in to the hosting service

Usage:
  ${BIN} login [--token <token>] [--no-open] [--status] [--json]
  ${BIN} logout

Options:
  --token <token>  Save an API token directly instead of logging in through
                   the browser. \`INTERACTIVE_DEMO_API_TOKEN\` does the same.
  --no-open        Print the login URL instead of opening the browser.
  --status         Show where the credentials are stored and whether the token
                   still works. \`--json\` prints it as JSON.
  --local          Use a local dev build of the hosting service
                   (http://localhost:3000). \`INTERACTIVE_DEMO_API_BASE\`
                   overrides the origin in every mode.

Credentials are written to ~/.interactive-demo/credentials.json (owner-only).
`;

const EMBED_USAGE = `${BIN} embed — print the embed snippet for a hosted demo

Usage:
  ${BIN} embed [<path>|--demo <slug>] [--mode inline|popup] [--label <text>] [--json]

Arguments:
  <path>          A demo folder (e.g. demos/intro) or a slug. Optional when the
                  project has exactly one demo.

Options:
  --demo <slug>   Select the demo by slug.
  --mode <mode>   inline (an iframe, the default) or popup (a loader script
                  plus a button that opens the demo in a modal).
  --label <text>  Button text for popup mode. Default "Try the demo".
  --json          Print the snippets as JSON.

Publishes the demo first when it has never been deployed.
`;

const PUBLISH_USAGE = `${BIN} publish — publish a demo to the hosting service

Usage:
  ${BIN} publish [<path>|--demo <slug>] [--new] [--json]
  ${BIN} publish --list [--json]

Arguments:
  <path>         A demo folder (e.g. demos/intro) or a slug. Optional when the
                 project has exactly one demo.

Options:
  --demo <slug>  Select the demo by slug.
  --new          Mint a NEW hosted URL instead of updating the demo's existing
                 deployment in place (the default keeps embeds working).
  --list         Show the hosted URL of every demo in the project.
  --json         Print machine-readable JSON.

Uploads the demo's assets, then freezes the config as a hosted deployment at
/p/<id>. Run \`${BIN} login\` first.
`;

const HELP_USAGE = `${BIN} help — show command help

Usage:
  ${BIN} help [command]
  ${BIN} <command> --help

Commands:
  init       Scaffold a new project, or add a demo with --demo.
  dev        Start the local preview + editor server.
  validate   Validate the project and demo files.
  build      Write a static folder per demo.
  capture    Record a click-through of a live web app as a demo.
  login      Log in to the hosting service (logout removes the credentials).
  publish    Publish a demo to the hosting service.
  version    Print the CLI version.
`;

const HELP_BY_COMMAND: Record<string, string> = {
  build: BUILD_USAGE,
  capture: CAPTURE_USAGE,
  dev: DEV_USAGE,
  help: HELP_USAGE,
  init: INIT_USAGE,
  login: LOGIN_USAGE,
  logout: LOGIN_USAGE,
  publish: PUBLISH_USAGE,
  embed: EMBED_USAGE,
  validate: VALIDATE_USAGE,
  version: VERSION_USAGE,
};

function readOptionalStringOption(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  const value = args[key];
  return typeof value === 'string' ? value : '';
}

export interface MainIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  /** Resolves when the dev server should shut down. Defaults to SIGINT/SIGTERM. */
  waitForShutdown?: () => Promise<void>;
}

const defaultIo: MainIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
};

function waitForSignal(): Promise<void> {
  return new Promise<void>((resolve) => {
    const onSignal = () => resolve();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
}

export async function main(argv: string[], io: MainIo = defaultIo): Promise<number> {
  const args = mri(argv, {
    alias: { h: 'help', p: 'port', v: 'version' },
    boolean: ['help', 'json', 'strict', 'version', 'list', 'local', 'new', 'status'],
    string: [
      'browser',
      'connect-to-browser',
      'demo',
      'from',
      'name',
      'out',
      'port',
      'profile',
      'session',
      'theme',
      'token',
      'url',
      'window-size',
    ],
  });

  const [command, ...rest] = args._ as string[];

  if (args.version && !command) {
    const result = await runVersion({ silent: true });
    io.stdout(`${result.version}${result.isLocalBuild ? ' (local build)' : ''}\n`);
    return 0;
  }

  if (!command) {
    io.stdout(USAGE);
    return args.help ? 0 : 1;
  }

  switch (command) {
    case 'help': {
      const topic = rest[0];
      if (!topic) {
        io.stdout(HELP_USAGE);
        return 0;
      }
      const usage = HELP_BY_COMMAND[topic];
      if (!usage) {
        io.stderr(`${BIN} help: unknown command "${topic}"\n\n${HELP_USAGE}`);
        return 1;
      }
      io.stdout(usage);
      return 0;
    }
    case 'init': {
      if (args.help) {
        io.stdout(INIT_USAGE);
        return 0;
      }
      const demo = readOptionalStringOption(args, 'demo');
      if (demo !== undefined) {
        const from = readOptionalStringOption(args, 'from');
        const slug = demo || rest[0] || '';
        if (!slug) {
          io.stderr(`${BIN} init: --demo needs a <slug>\n\n` + INIT_USAGE);
          return 1;
        }
        try {
          await runAddDemo({ slug, cwd: io.cwd, from: from || undefined });
          return 0;
        } catch (err) {
          io.stderr(`${BIN} init --demo failed: ${(err as Error).message}\n`);
          return 1;
        }
      }
      const name = rest[0];
      if (!name) {
        io.stderr(`${BIN} init: missing <name> argument\n\n` + INIT_USAGE);
        return 1;
      }
      const theme = readOptionalStringOption(args, 'theme');
      // mri negates `--no-starter-demo` to `{ 'starter-demo': false }`.
      const noStarterDemo = args['starter-demo'] === false;
      try {
        await runInit({ name, cwd: io.cwd, theme, noStarterDemo });
        return 0;
      } catch (err) {
        io.stderr(`${BIN} init failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'validate': {
      if (args.help) {
        io.stdout(VALIDATE_USAGE);
        return 0;
      }
      const result = await runValidate({
        cwd: io.cwd,
        json: Boolean(args.json),
        strict: Boolean(args.strict),
      });
      return result.ok ? 0 : 1;
    }
    case 'build': {
      if (args.help) {
        io.stdout(BUILD_USAGE);
        return 0;
      }
      try {
        await runBuild({ cwd: io.cwd, out: readOptionalStringOption(args, 'out') || undefined });
        return 0;
      } catch (err) {
        io.stderr(`${BIN} build failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'version': {
      if (args.help) {
        io.stdout(VERSION_USAGE);
        return 0;
      }
      const result = await runVersion({ silent: true });
      io.stdout(`${result.version}${result.isLocalBuild ? ' (local build)' : ''}\n`);
      return 0;
    }
    case 'dev': {
      if (args.help) {
        io.stdout(DEV_USAGE);
        return 0;
      }
      const portArg = args.port;
      const port =
        typeof portArg === 'number'
          ? portArg
          : typeof portArg === 'string' && portArg !== ''
            ? Number(portArg)
            : 3000;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        io.stderr(`${BIN} dev: invalid --port value; expected an integer from 1 to 65535\n`);
        return 1;
      }
      try {
        const handle = await runDev({ cwd: io.cwd, port, path: rest[0] });
        await (io.waitForShutdown ?? waitForSignal)();
        try {
          await handle.close();
        } catch (err) {
          io.stderr(`${BIN} dev: error during shutdown: ${(err as Error).message}\n`);
        }
        return 0;
      } catch (err) {
        io.stderr(`${BIN} dev failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'capture': {
      if (args.help) {
        io.stdout(CAPTURE_USAGE);
        return 0;
      }
      try {
        // Re-base positionals on the subcommand so `capture start <url>` reads
        // the URL at `_[1]` regardless of how the binary was invoked.
        return await runCapture({ cwd: io.cwd, subcommand: rest[0], args: { ...args, _: rest } });
      } catch (err) {
        io.stderr(`${BIN} capture failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'login': {
      if (args.help) {
        io.stdout(LOGIN_USAGE);
        return 0;
      }
      try {
        if (args.status) {
          await runStatus({ cwd: io.cwd, json: Boolean(args.json) });
          return 0;
        }
        // mri negates `--no-open` to `{ open: false }`.
        await runLogin({
          cwd: io.cwd,
          token: readOptionalStringOption(args, 'token') || undefined,
          local: Boolean(args.local),
          open: args.open !== false,
        });
        return 0;
      } catch (err) {
        io.stderr(`${BIN} login failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'logout': {
      if (args.help) {
        io.stdout(LOGIN_USAGE);
        return 0;
      }
      await runLogout();
      return 0;
    }
    case 'publish': {
      if (args.help) {
        io.stdout(PUBLISH_USAGE);
        return 0;
      }
      try {
        if (args.list) {
          await runPublishList({ cwd: io.cwd, json: Boolean(args.json) });
          return 0;
        }
        await runPublish({
          cwd: io.cwd,
          path: rest[0],
          demo: readOptionalStringOption(args, 'demo') || undefined,
          json: Boolean(args.json),
          new: Boolean(args.new),
        });
        return 0;
      } catch (err) {
        io.stderr(`${BIN} publish failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    case 'embed': {
      if (args.help) {
        io.stdout(EMBED_USAGE);
        return 0;
      }
      const mode = readOptionalStringOption(args, 'mode') || 'inline';
      if (mode !== 'inline' && mode !== 'popup') {
        io.stderr(`${BIN} embed: --mode must be inline or popup\n`);
        return 1;
      }
      try {
        await runEmbed({
          cwd: io.cwd,
          path: rest[0],
          demo: readOptionalStringOption(args, 'demo') || undefined,
          mode,
          label: readOptionalStringOption(args, 'label') || undefined,
          json: Boolean(args.json),
        });
        return 0;
      } catch (err) {
        io.stderr(`${BIN} embed failed: ${(err as Error).message}\n`);
        return 1;
      }
    }
    default:
      io.stderr(`${BIN}: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}
