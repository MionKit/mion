// getExePath()'s RT_BIN escape hatch. The launcher is what BOTH lanes call to
// find the resolver — the bundler plugins as the fallback behind their explicit
// `binary` option (unplugin.ts), the lint worker unconditionally
// (eslint/lint-worker.ts) — so this env var is the only way to redirect the
// lint lane at a specific build (validating an unpublished release in a real
// consumer, bisecting a resolver regression, a vendored/air-gapped binary).
//
// A bad value must THROW rather than fall through: silently running a different
// binary than the one asked for would produce caches keyed on another version.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {getExePath} from '@ts-runtypes/bin';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEV_EXE = path.join(REPO_ROOT, 'bin', process.platform === 'win32' ? 'ts-runtypes.exe' : 'ts-runtypes');

// The suite mutates process.env for the module under test (it reads the var on
// every call, so no module reset is needed) — restore it after each case.
const originalRtBin = process.env['RT_BIN'];

function setRtBin(value: string | undefined): void {
  if (value === undefined) delete process.env['RT_BIN'];
  else process.env['RT_BIN'] = value;
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bin-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  setRtBin(originalRtBin);
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true});
});

describe('getExePath — RT_BIN override', () => {
  it('returns the override when it names an executable file', () => {
    setRtBin(DEV_EXE);
    expect(getExePath()).toBe(DEV_EXE);
  });

  it('resolves a relative override against the current working directory', () => {
    const relative = path.relative(process.cwd(), DEV_EXE);
    expect(path.isAbsolute(relative)).toBe(false);
    setRtBin(relative);
    expect(getExePath()).toBe(DEV_EXE);
  });

  it('falls back to the normal lookup when unset, empty, or whitespace', () => {
    setRtBin(undefined);
    const resolved = getExePath();
    expect(resolved).toBe(DEV_EXE);
    setRtBin('');
    expect(getExePath()).toBe(resolved);
    setRtBin('   ');
    expect(getExePath()).toBe(resolved);
  });

  it('throws naming RT_BIN when the path does not exist', () => {
    const missing = path.join(makeTempDir(), 'no-such-binary');
    setRtBin(missing);
    expect(() => getExePath()).toThrow(/RT_BIN=.*does not exist/);
    expect(() => getExePath()).toThrow(new RegExp(missing.replace(/\\/g, '\\\\')));
  });

  it('throws when the path is a directory rather than a file', () => {
    setRtBin(makeTempDir());
    expect(() => getExePath()).toThrow(/RT_BIN=.*is not a file/);
  });

  it.skipIf(process.platform === 'win32')('throws when the file is not executable', () => {
    const notExecutable = path.join(makeTempDir(), 'ts-runtypes');
    fs.writeFileSync(notExecutable, '#!/bin/sh\n', {mode: 0o644});
    setRtBin(notExecutable);
    expect(() => getExePath()).toThrow(/RT_BIN=.*is not executable/);
  });
});

// End-to-end proof through the package's own CLI (bin/cli.js execs whatever
// getExePath returns), so the override is pinned as a real spawn and not just a
// resolved string. The CLI is what a consumer's `ts-runtypes-bin` shim runs.
describe('ts-runtypes-bin CLI — RT_BIN reaches the exec', () => {
  const CLI = path.join(REPO_ROOT, 'packages/ts-runtypes-bin/bin/cli.js');

  it('execs the overridden binary', () => {
    const result = spawnSync(process.execPath, [CLI, '--version'], {
      encoding: 'utf8',
      env: {...process.env, RT_BIN: DEV_EXE},
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ts-runtypes');
  });

  it('fails loudly when the override does not exist', () => {
    const missing = path.join(makeTempDir(), 'no-such-binary');
    const result = spawnSync(process.execPath, [CLI, '--version'], {
      encoding: 'utf8',
      env: {...process.env, RT_BIN: missing},
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RT_BIN=');
  });
});
