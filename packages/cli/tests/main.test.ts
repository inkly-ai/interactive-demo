import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, OPTIONS_BY_COMMAND, type MainIo } from '../src/main';

async function run(args: string[], cwd = process.cwd()) {
  let stdout = '';
  let stderr = '';
  const io: MainIo = {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    cwd,
  };
  const code = await main(args, io);
  return { code, stdout, stderr };
}

describe('interactive-demo help', () => {
  it('prints usage and fails when no command is given', async () => {
    const { code, stdout } = await run([]);
    expect(code).toBe(1);
    expect(stdout).toContain('interactive-demo init <name>');
    expect(stdout).toContain('interactive-demo build');
  });

  it('prints the help index', async () => {
    const { code, stdout } = await run(['help']);
    expect(code).toBe(0);
    expect(stdout).toContain('interactive-demo help — show command help');
    expect(stdout).toContain('init');
    expect(stdout).toContain('dev');
    expect(stdout).toContain('validate');
    expect(stdout).toContain('build');
    // No removed commands (publish/login replace the old sync/snapshot flow).
    for (const gone of ['sync', 'snapshot', 'lock', 'animation', 'capture-html']) {
      expect(stdout).not.toContain(gone);
    }
  });

  it('prints command-specific help', async () => {
    const init = await run(['help', 'init']);
    expect(init.stdout).toContain('--demo <slug>');
    expect(init.stdout).toContain('--no-starter-demo');
    const dev = await run(['dev', '--help']);
    expect(dev.stdout).toContain('interactive-demo dev [<path>] [--port <n>]');
    const build = await run(['help', 'build']);
    expect(build.stdout).toContain('--out <dir>');
  });

  it('lists every command in the help index, each with clean usage', async () => {
    const index = await run(['help']);
    const listed = [...index.stdout.split('Commands:\n')[1]!.matchAll(/^ {2}(\S+)/gm)].map((m) => m[1]!);
    expect(listed).toEqual(
      expect.arrayContaining(['init', 'dev', 'validate', 'build', 'capture', 'login', 'logout', 'publish', 'embed', 'version']),
    );
    const top = await run(['--help']);
    for (const [topic, text] of [
      ['--help', top.stdout],
      ...(await Promise.all(
        [...listed, 'help'].map(async (t) => [t, (await run(['help', t])).stdout] as const),
      )),
    ] as const) {
      expect(text, topic).not.toBe('');
      // A half-replaced sentence shows up as a repeated line, a flag that lost
      // its indent, or a parenthesis opened or closed on its own.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      expect(lines.filter((l, i) => lines.indexOf(l) !== i), topic).toEqual([]);
      expect(text.split('\n').filter((l) => l.startsWith('-')), topic).toEqual([]);
      expect(text.split('(').length, topic).toBe(text.split(')').length);
    }
  });

  it('describes the options each command actually takes', async () => {
    const init = await run(['init', '--help']);
    expect(init.stdout).toMatch(/--demo defaults to the\s+source's name/);
    expect(init.stdout).not.toContain('capture extension');
    expect(init.stdout).not.toContain('a demo.config.json) instead');
    expect((await run(['dev', '--help'])).stdout).toContain('/__demo/editor/');
    expect((await run(['login', '--help'])).stdout).toContain('[--local]');
    const build = await run(['build', '--help']);
    expect(build.stdout).toContain('  --force');
    for (const written of ['player-fonts.css', 'fonts/', 'backgrounds/', 'brand/', '<out>/embed.js']) {
      expect(build.stdout).toContain(written);
    }
  });

  it('rejects unknown commands and help topics', async () => {
    const unknown = await run(['frobnicate']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('unknown command "frobnicate"');
    const topic = await run(['help', 'sync']);
    expect(topic.code).toBe(1);
    expect(topic.stderr).toContain('unknown command "sync"');
  });

  it('rejects an option the command does not take, naming it as typed', async () => {
    // Before this a typo'd --strict was dropped and the run exited 0.
    const typo = await run(['validate', '--strcit'], tmpdir());
    expect(typo.code).toBe(1);
    expect(typo.stdout).toBe('');
    expect(typo.stderr).toContain('interactive-demo validate: unknown option --strcit');
    expect(typo.stderr).toContain('interactive-demo validate --help');

    // An option another command owns is still unknown here.
    const borrowed = await run(['build', '--new', '--json'], tmpdir());
    expect(borrowed.code).toBe(1);
    expect(borrowed.stderr).toContain('unknown options --new, --json');

    const negated = await run(['capture', 'status', '--no-vidoe'], tmpdir());
    expect(negated.code).toBe(1);
    expect(negated.stderr).toContain('unknown option --no-vidoe');

    // --help still answers, whatever else is on the line.
    const help = await run(['validate', '--strcit', '--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('--strict');
  });

  it('takes every option its help text documents', async () => {
    for (const topic of ['init', 'dev', 'validate', 'build', 'capture', 'login', 'publish', 'embed']) {
      const { stdout } = await run([topic, '--help']);
      const documented = new Set([...stdout.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)].map((m) => m[0]));
      documented.delete('--help');
      for (const option of documented) {
        const key = option.replace(/^--(no-)?/, '');
        expect(OPTIONS_BY_COMMAND[topic], `${topic} ${option}`).toContain(key);
      }
    }
  });

  it('rejects port zero at the CLI boundary', async () => {
    const { code, stderr } = await run(['dev', '--port', '0']);
    expect(code).toBe(1);
    expect(stderr).toContain('expected an integer from 1 to 65535');
  });

  it('requires a name for init and a slug for init --demo', async () => {
    const noName = await run(['init']);
    expect(noName.code).toBe(1);
    expect(noName.stderr).toContain('missing <name> argument');
    const noSlug = await run(['init', '--demo']);
    expect(noSlug.code).toBe(1);
    expect(noSlug.stderr).toContain('--demo needs a <slug>');
  });

  it('takes the slug from --from when --demo is omitted', async () => {
    // Run outside a project: reaching the "not inside a project" error proves
    // the slug was derived and the add-demo path was entered, rather than
    // bailing at the argument check the way a bare --demo does.
    const { code, stderr } = await run(['init', '--from', '/tmp/acme-3f91b2.zip'], tmpdir());
    expect(code).toBe(1);
    expect(stderr).not.toContain('--demo needs a <slug>');
    expect(stderr).toContain('Not inside a project');
  });

  it('accepts and ignores a leftover --theme on init, with a warning', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'interactive-demo-main-'));
    try {
      const { code, stderr } = await run(['init', 'themed', '--theme', 'mono'], cwd);
      expect(code).toBe(0);
      expect(stderr).toBe('interactive-demo init: theme presets were removed; --theme is ignored.\n');
      const project = JSON.parse(await readFile(join(cwd, 'themed', 'interactive-demo.json'), 'utf8'));
      expect(project).not.toHaveProperty('theme');
      expect((await run(['init', '--help'])).stdout).not.toContain('--theme');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('prints a package version', async () => {
    const { code, stdout } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});
