// The stamp fast path of scripts/core/build.mjs: main(['all'], {trustStamp: true}) must cost a digest on a
// warm tree and fall back to the build-id compare when the stamp disagrees. Needs Go + the submodule, so CI
// runs it in go-fuzz, never in js-lint.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
// @ts-expect-error untyped .mjs
import {hostGoArch} from '../../../scripts/lib/proc.mjs';

const REPO_ROOT = join(__dirname, '../../..');
const STAMP = join(REPO_ROOT, 'mion-bin/.mion.stamp');
const BUILD = join(REPO_ROOT, 'scripts/core/build.mjs');
const isMac = process.platform === 'darwin';
const GOARCH: string = hostGoArch();
const LINUX_BIN = join(REPO_ROOT, `mion-bin/mion-linux-${GOARCH}`);
const LINUX_STAMP = join(REPO_ROOT, `mion-bin/.mion-linux-${GOARCH}.stamp`);

const run = (code: string, env?: NodeJS.ProcessEnv): {status: number | null; out: string} => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {cwd: REPO_ROOT, encoding: 'utf8', env});
  return {status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}`};
};
const trusted = (targets = ['go'], env?: NodeJS.ProcessEnv): {status: number | null; out: string} =>
  run(`const {main} = await import(${JSON.stringify(BUILD)}); main(${JSON.stringify(targets)}, {trustStamp: true});`, env);
// A PATH with node and git only: a CI job that restored the binaries and never set Go up.
const noGoPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'no-go-'));
  symlinkSync(process.execPath, join(dir, 'node'));
  symlinkSync(spawnSync('which', ['git'], {encoding: 'utf8'}).stdout.trim(), join(dir, 'git'));
  return dir;
};
const withoutGo = (): NodeJS.ProcessEnv => ({...process.env, PATH: noGoPath()});
// A Mac cross-builds the linux slots, so a test that needs one filled and stamped builds it first, with Go.
const fillLinuxSlots = (targets = ['linux-go']): void => {
  const {status, out} = trusted(targets);
  expect(status, out).toBe(0);
};
const refTemps = (): string[] => readdirSync(join(REPO_ROOT, 'mion-bin')).filter((name) => name.startsWith('.rt-build-ref-'));

describe('build gate — the mion-bin/mion stamp', () => {
  let original = '';
  beforeAll(() => {
    // The authoritative check (never trusts the stamp) leaves a fresh stamp behind.
    const result = spawnSync(process.execPath, [BUILD, 'go', 'extract'], {cwd: REPO_ROOT, encoding: 'utf8'});
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(STAMP)).toBe(true);
    original = readFileSync(STAMP, 'utf8');
  }, 300_000);
  afterAll(() => {
    if (original) writeFileSync(STAMP, original);
  });

  it('a trusted call on a matching stamp skips the reference build', () => {
    const {status, out} = trusted();
    expect(status, out).toBe(0);
    expect(out).toContain('mion-bin/mion is up to date (stamp)');
    expect(out).not.toContain('Verifying mion-bin/mion matches current source');
    expect(refTemps()).toEqual([]);
  }, 60_000);

  it('a matching stamp is trusted with no Go on PATH, as a job that restored the binary from the cache', () => {
    const {status, out} = trusted(['go'], withoutGo());
    expect(status, out).toBe(0);
    expect(out).toContain('mion-bin/mion is up to date (stamp)');
  }, 60_000);

  // The smoke job copies the restored binaries into the linux slots the containers mount.
  it(
    'fills the linux slots from trusted binaries with no Go on PATH',
    () => {
      if (isMac) fillLinuxSlots(['linux-go', 'linux-extract']);
      const {status, out} = trusted(['linux-go', 'linux-extract'], withoutGo());
      expect(status, out).toBe(0);
      expect(out).toContain('mion-bin/extract-fn-bodies is up to date (stamp)');
      if (isMac) expect(out).toContain(`mion-bin/mion-linux-${GOARCH} is up to date (stamp)`);
      if (isMac) expect(out).toContain(`mion-bin/extract-fn-bodies-linux-${GOARCH} is up to date (stamp)`);
    },
    isMac ? 300_000 : 60_000
  );

  it.runIf(isMac)(
    'a linux slot stamp that disagrees forces the cross-build compare, then re-stamps',
    () => {
      fillLinuxSlots();
      const linuxOriginal = readFileSync(LINUX_STAMP, 'utf8');
      writeFileSync(LINUX_STAMP, 'not-the-digest\n');
      const {status, out} = trusted(['linux-go']);
      expect(status, out).toBe(0);
      expect(out).not.toContain(`mion-bin/mion-linux-${GOARCH} is up to date (stamp)`);
      expect(out).toContain(`mion-bin/mion-linux-${GOARCH} is up to date with source`);
      expect(readFileSync(LINUX_STAMP, 'utf8')).toBe(linuxOriginal);
      expect(refTemps()).toEqual([]);
    },
    300_000
  );

  it.runIf(isMac)(
    'a matching linux slot stamp beside an empty slot is not trusted: the slot is cross-built and stamped',
    () => {
      fillLinuxSlots();
      const linuxOriginal = readFileSync(LINUX_STAMP, 'utf8');
      writeFileSync(LINUX_BIN, '');
      const {status, out} = trusted(['linux-go']);
      expect(status, out).toBe(0);
      expect(out).not.toContain(`mion-bin/mion-linux-${GOARCH} is up to date (stamp)`);
      expect(out).toContain(`Built mion-bin/mion-linux-${GOARCH}.`);
      expect(statSync(LINUX_BIN).size).toBeGreaterThan(0);
      expect(readFileSync(LINUX_STAMP, 'utf8')).toBe(linuxOriginal);
    },
    300_000
  );

  it.runIf(isMac)(
    'an explicit linux-go build ignores a matching linux slot stamp and compares',
    () => {
      fillLinuxSlots();
      const {status, out} = run(`const {main} = await import(${JSON.stringify(BUILD)}); main(['linux-go']);`);
      expect(status, out).toBe(0);
      expect(out).not.toContain(`mion-bin/mion-linux-${GOARCH} is up to date (stamp)`);
      expect(out).toContain(`mion-bin/mion-linux-${GOARCH} is up to date with source`);
    },
    300_000
  );

  it.runIf(isMac)(
    'with no Go on PATH, a linux slot stamp that disagrees fails loudly',
    () => {
      fillLinuxSlots();
      const linuxOriginal = readFileSync(LINUX_STAMP, 'utf8');
      writeFileSync(LINUX_STAMP, 'not-the-digest\n');
      const {status, out} = trusted(['linux-go'], withoutGo());
      writeFileSync(LINUX_STAMP, linuxOriginal);
      expect(status).not.toBe(0);
      expect(out).toContain(`Go toolchain not found on PATH (needed to build mion-bin/mion-linux-${GOARCH})`);
    },
    300_000
  );

  it('with no Go on PATH, a stamp that disagrees fails loudly instead of trusting the binary', () => {
    writeFileSync(STAMP, 'not-the-digest\n');
    const {status, out} = trusted(['go'], withoutGo());
    writeFileSync(STAMP, original);
    expect(status).not.toBe(0);
    expect(out).toContain('Go toolchain not found on PATH (needed to build mion-bin/mion)');
  }, 60_000);

  it('a stamp that disagrees forces the full build-id compare, then re-stamps', () => {
    writeFileSync(STAMP, 'not-the-digest\n');
    const {status, out} = trusted();
    expect(status, out).toBe(0);
    expect(out).toContain('Verifying mion-bin/mion matches current source');
    expect(out).not.toContain('(stamp)');
    expect(readFileSync(STAMP, 'utf8')).toBe(original);
    expect(refTemps()).toEqual([]);
  }, 300_000);

  it('the digest folds in the ldflags, so a version bump invalidates the stamp', () => {
    const {status, out} = run(
      `const {resolverDigest} = await import(${JSON.stringify(BUILD)}); console.log(resolverDigest(), resolverDigest(), resolverDigest('-X other=1'));`
    );
    expect(status, out).toBe(0);
    const [a, b, c] = out.trim().split('\n').at(-1)!.split(' ');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  }, 60_000);
});
