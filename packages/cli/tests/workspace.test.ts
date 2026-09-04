import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsWorkspace, resolveInsideDemo } from '../src/workspace';

describe('LocalFsWorkspace', () => {
  let demoDir: string;
  const ws = new LocalFsWorkspace();

  beforeEach(async () => {
    demoDir = await mkdtemp(join(tmpdir(), 'interactive-demo-workspace-'));
    await writeFile(join(demoDir, 'demo.config.json'), '{"id":"x"}', 'utf8');
    await mkdir(join(demoDir, 'assets'), { recursive: true });
    await writeFile(join(demoDir, 'assets', 'shot.png'), 'png', 'utf8');
  });

  afterEach(async () => {
    await rm(demoDir, { recursive: true, force: true });
  });

  it('lists files with forward-slash paths relative to the demo folder', async () => {
    expect(await ws.listFiles(demoDir)).toEqual(['assets/shot.png', 'demo.config.json']);
  });

  it('reads a file, and returns null for a missing one', async () => {
    expect(await ws.readFile(demoDir, 'demo.config.json')).toBe('{"id":"x"}');
    expect(await ws.readFile(demoDir, 'nope.json')).toBeNull();
  });

  it('writes a file, creating parent folders, and deletes it', async () => {
    await ws.writeFile(demoDir, 'assets/deep/new.txt', 'hello');
    expect(await readFile(join(demoDir, 'assets', 'deep', 'new.txt'), 'utf8')).toBe('hello');
    await ws.deleteFile(demoDir, 'assets/deep/new.txt');
    expect(await ws.readFile(demoDir, 'assets/deep/new.txt')).toBeNull();
    // Deleting a missing file is not an error.
    await ws.deleteFile(demoDir, 'assets/deep/new.txt');
  });

  it('refuses paths that escape the demo folder', () => {
    expect(() => resolveInsideDemo(demoDir, '../outside.txt')).toThrow(/escapes/);
    expect(() => resolveInsideDemo(demoDir, '/etc/passwd')).toThrow(/escapes/);
    expect(resolveInsideDemo(demoDir, 'assets/../demo.config.json')).toBe(join(demoDir, 'demo.config.json'));
  });
});
