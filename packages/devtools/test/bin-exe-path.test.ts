// getExePath()'s MION_BIN escape hatch. The launcher is what BOTH lanes call to
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
import {getExePath} from '@mionjs/bin-compiler';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEV_EXE = path.join(REPO_ROOT, 'mion-bin', process.platform === 'win32' ? 'mion.exe' : 'mion');
const CLI_PATH = path.join(REPO_ROOT, 'packages/bin-compiler/bin/cli.js');

// The suite mutates process.env for the module under test (it reads the var on
// every call, so no module reset is needed) — restore it after each case.
const originalRtBin = process.env['MION_BIN'];

function setRtBin(value: string | undefined): void {
  if (value === undefined) delete process.env['MION_BIN'];
  else process.env['MION_BIN'] = value;
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

describe('getExePath — MION_BIN override', () => {
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

  it('throws naming MION_BIN when the path does not exist', () => {
    const missing = path.join(makeTempDir(), 'no-such-binary');
    setRtBin(missing);
    expect(() => getExePath()).toThrow(/MION_BIN=.*does not exist/);
    expect(() => getExePath()).toThrow(new RegExp(missing.replace(/\\/g, '\\\\')));
  });

  it('throws when the path is a directory rather than a file', () => {
    setRtBin(makeTempDir());
    expect(() => getExePath()).toThrow(/MION_BIN=.*is not a file/);
  });

  it.skipIf(process.platform === 'win32')('throws when the file is not executable', () => {
    const notExecutable = path.join(makeTempDir(), 'mion');
    fs.writeFileSync(notExecutable, '#!/bin/sh\n', {mode: 0o644});
    setRtBin(notExecutable);
    expect(() => getExePath()).toThrow(/MION_BIN=.*is not executable/);
  });
});

// End-to-end proof through the package's own CLI (bin/cli.js execs whatever
// getExePath returns), so the override is pinned as a real spawn and not just a
// resolved string. The CLI is what a consumer's `mion` shim runs.
describe('mion CLI — MION_BIN reaches the exec', () => {
  it('execs the overridden binary', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, '--version'], {
      encoding: 'utf8',
      env: {...process.env, MION_BIN: DEV_EXE},
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('mion');
  });

  it('fails loudly when the override does not exist', () => {
    const missing = path.join(makeTempDir(), 'no-such-binary');
    const result = spawnSync(process.execPath, [CLI_PATH, '--version'], {
      encoding: 'utf8',
      env: {...process.env, MION_BIN: missing},
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MION_BIN=');
  });
});

// An installed pro launcher takes over the lookup. Each case runs getExePath in a child whose cwd holds a stub
// `node_modules/@mionkit/pro-bin-compiler`, since vitest workers cannot chdir.
describe('getExePath — @mionkit/pro-bin-compiler', () => {
  const LAUNCHER = path.join(REPO_ROOT, 'packages/bin-compiler/lib/index.js');
  const OWN_VERSION: string = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'packages/bin-compiler/package.json'), 'utf8')
  ).version;

  function projectWithPro(body: string): string {
    const project = makeTempDir();
    const pro = path.join(project, 'node_modules/@mionkit/pro-bin-compiler');
    fs.mkdirSync(path.join(pro, 'lib'), {recursive: true});
    fs.writeFileSync(
      path.join(pro, 'package.json'),
      JSON.stringify({name: '@mionkit/pro-bin-compiler', type: 'module', exports: {'.': {import: './lib/index.js'}}})
    );
    fs.writeFileSync(path.join(pro, 'lib/index.js'), body);
    return project;
  }

  function lookup(cwd: string, env: Record<string, string | undefined> = {}) {
    const script = `import {getExePath} from ${JSON.stringify(LAUNCHER)};\nconsole.log(getExePath());\n`;
    const childEnv: Record<string, string | undefined> = {...process.env, ...env};
    if (env['MION_BIN'] === undefined) delete childEnv['MION_BIN'];
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd, encoding: 'utf8', env: childEnv});
  }

  it('returns the pro launcher binary when its mion version matches', () => {
    const project = projectWithPro(
      `export const mionVersion = ${JSON.stringify(OWN_VERSION)};\nexport function getExePath() { return '/pro/bin/mion-pro'; }\n`
    );
    const result = lookup(project);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('/pro/bin/mion-pro');
  });

  it('MION_BIN beats the pro launcher', () => {
    const project = projectWithPro(
      `export const mionVersion = ${JSON.stringify(OWN_VERSION)};\nexport function getExePath() { return '/pro/bin/mion-pro'; }\n`
    );
    expect(lookup(project, {MION_BIN: DEV_EXE}).stdout.trim()).toBe(DEV_EXE);
  });

  it('throws naming both versions on a mismatch', () => {
    const project = projectWithPro(
      `export const mionVersion = '0.0.1-other';\nexport function getExePath() { return '/pro/bin/mion-pro'; }\n`
    );
    const result = lookup(project);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('0.0.1-other');
    expect(result.stderr).toContain(`@mionjs/bin-compiler is ${OWN_VERSION}`);
  });

  it('propagates a throwing pro launcher', () => {
    const project = projectWithPro(
      `export const mionVersion = ${JSON.stringify(OWN_VERSION)};\nexport function getExePath() { throw new Error('pro launcher broke'); }\n`
    );
    const result = lookup(project);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pro launcher broke');
  });

  it('changes nothing without a pro launcher', () => {
    expect(lookup(makeTempDir()).stdout.trim()).toBe(DEV_EXE);
  });
});
