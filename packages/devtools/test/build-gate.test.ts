// The stamp fast path of scripts/core/build.mjs: the entry point runs every
// gated command through main(['all'], {trustStamp: true}), which must cost a
// digest (no reference build) on a warm tree, and must fall back to the full
// build-id compare the moment the stamp disagrees. Needs the bootstrapped host
// like every plugin test (Go toolchain + the submodule): `node scripts/core/build.mjs go`
// is the first thing it runs.
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const REPO_ROOT = join(__dirname, '../../..');
const STAMP = join(REPO_ROOT, 'bin/.mion.stamp');
const BUILD = join(REPO_ROOT, 'scripts/core/build.mjs');

const run = (code: string): {status: number | null; out: string} => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {cwd: REPO_ROOT, encoding: 'utf8'});
  return {status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}`};
};
const trusted = (): {status: number | null; out: string} =>
  run(`const {main} = await import(${JSON.stringify(BUILD)}); main(['go'], {trustStamp: true});`);
const refTemps = (): string[] => readdirSync(join(REPO_ROOT, 'bin')).filter((name) => name.startsWith('.rt-build-ref-'));

describe('build gate — the bin/mion stamp', () => {
  let original = '';
  beforeAll(() => {
    // The authoritative check (never trusts the stamp) leaves a fresh stamp behind.
    const result = spawnSync(process.execPath, [BUILD, 'go'], {cwd: REPO_ROOT, encoding: 'utf8'});
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
    expect(out).toContain('bin/mion is up to date (stamp)');
    expect(out).not.toContain('Verifying bin/mion matches current source');
    expect(refTemps()).toEqual([]);
  }, 60_000);

  it('a stamp that disagrees forces the full build-id compare, then re-stamps', () => {
    writeFileSync(STAMP, 'not-the-digest\n');
    const {status, out} = trusted();
    expect(status, out).toBe(0);
    expect(out).toContain('Verifying bin/mion matches current source');
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
