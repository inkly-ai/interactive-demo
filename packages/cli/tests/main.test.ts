import { describe, expect, it } from 'vitest';
import { main, type MainIo } from '../src/main';

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
    // No remote-service commands, no capture yet, no removed commands.
    for (const gone of ['sync', 'snapshot', 'login', 'lock', 'animation', 'capture-html']) {
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

  it('rejects unknown commands and help topics', async () => {
    const unknown = await run(['frobnicate']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('unknown command "frobnicate"');
    const topic = await run(['help', 'sync']);
    expect(topic.code).toBe(1);
    expect(topic.stderr).toContain('unknown command "sync"');
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

  it('prints a package version', async () => {
    const { code, stdout } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});
