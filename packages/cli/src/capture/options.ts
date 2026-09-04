import { isAbsolute, resolve } from 'node:path';

/** Parsed command-line arguments as produced by `mri`. */
export interface ParsedArgs {
  [key: string]: unknown;
  _: unknown[];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function jsonOut(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function stringOption(args: ParsedArgs, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  const value = args[key];
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value : '';
}

export function numberOption(args: ParsedArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return fallback;
}

export function booleanOption(args: ParsedArgs, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    return args[key] !== false;
  }
  return fallback;
}

export function parseWindowSizeOption(
  value: string | undefined,
): { width: number; height: number } | null {
  if (!value) return null;
  const match = /^\s*(\d+)\s*[x,]\s*(\d+)\s*$/i.exec(value);
  if (!match) throw new Error('--window-size must look like 1440x900');
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function requireString(args: ParsedArgs, key: string, usageHint: string): string {
  const value = stringOption(args, key);
  if (!value) throw new Error(`missing --${key} <value>\n\n${usageHint}`);
  return value;
}

export function resolveArgPath(cwd: string, value: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value);
}
