// scripts/lib/go-inputs.mjs is the content digest behind two stamps: the
// resolver binary's (mion-bin/.mion.stamp, scripts/core/build.mjs) and the playground
// wasm's (container/website/scripts/build-playground.mjs). These pin what the
// digest sees, that it is stable, and what the playground wrapper adds on top.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM dev script, no types
import {goInputFiles, goInputsDigest, isGoInput, readStamp, writeStamp} from '../../../scripts/lib/go-inputs.mjs';
// @ts-expect-error plain ESM dev script, no types
import {WASM_INPUTS, isWasmInput, readWasmStamp, wasmInputsDigest} from '../../../scripts/website/playground-wasm-inputs.mjs';
// @ts-expect-error plain ESM dev script, no types
import {gitlinkCommit, isCheckedOutRepo, tsgolintCommit} from '../../../scripts/lib/tsgolint.mjs';

const REPO_ROOT = join(__dirname, '../../..');
const HEX64 = /^[0-9a-f]{64}$/;

const scratch = mkdtempSync(join(tmpdir(), 'go-inputs-'));
afterAll(() => rmSync(scratch, {recursive: true, force: true}));

describe('go-inputs — what the digest sees', () => {
  it('excludes only what the go tool itself ignores', () => {
    expect(isGoInput('ts-go-runtypes/internal/x/x.go')).toBe(true);
    expect(isGoInput('ts-go-runtypes/internal/x/x_test.go')).toBe(false);
    expect(isGoInput('ts-go-runtypes/internal/x/testdata/fixture.ts')).toBe(false);
    expect(isGoInput('ts-go-runtypes/internal/x/asset.json')).toBe(true);
    expect(isGoInput('ts-go-runtypes/go.mod')).toBe(true);
  });

  it('lists files in sorted path order, files and directories alike', () => {
    const files = goInputFiles(REPO_ROOT, ['ts-go-runtypes/go.mod', 'ts-go-runtypes/cmd/mion']) as [string, string][];
    expect(files.length).toBeGreaterThan(1);
    const paths = files.map(([rel]) => rel);
    expect([...paths].sort()).toEqual(paths);
    expect(paths).toContain('ts-go-runtypes/go.mod');
    expect(paths.some((rel) => rel.startsWith('ts-go-runtypes/cmd/mion/'))).toBe(true);
    expect(paths.some((rel) => rel.endsWith('_test.go'))).toBe(false);
  });

  it('is deterministic, and changes with content, with an extra identity, and with the input list', () => {
    const dir = join(scratch, 'tree');
    writeFileSync(join(scratch, 'a.go'), 'package a\n', {flag: 'w'});
    const one = goInputsDigest(scratch, ['a.go']) as string;
    expect(one).toMatch(HEX64);
    expect(goInputsDigest(scratch, ['a.go'])).toBe(one);
    expect(goInputsDigest(scratch, ['a.go'], ['ldflags=x'])).not.toBe(one);
    expect(goInputsDigest(scratch, ['a.go'], ['ldflags=x'])).toBe(goInputsDigest(scratch, ['a.go'], ['ldflags=x']));
    writeFileSync(join(scratch, 'a.go'), 'package a // edited\n');
    expect(goInputsDigest(scratch, ['a.go'])).not.toBe(one);
    // a missing input is skipped, not an error
    expect(goInputsDigest(scratch, ['a.go', 'missing.go'])).toBe(goInputsDigest(scratch, ['a.go']));
    expect(dir).toBeDefined();
  });

  it('round-trips a stamp; a missing stamp reads as empty', () => {
    const stamp = join(scratch, 'nested', 'dir', '.stamp');
    expect(readStamp(stamp)).toBe('');
    writeStamp(stamp, 'abc123');
    expect(readStamp(stamp)).toBe('abc123');
  });
});

describe('go-inputs — the playground wrapper', () => {
  it('the wasm digest is the shared digest over the wasm input list plus the tsgolint commit', () => {
    expect(WASM_INPUTS).toEqual([
      'ts-go-runtypes/cmd/mion-wasm',
      'ts-go-runtypes/internal',
      'ts-go-runtypes/go.mod',
      'ts-go-runtypes/go.sum',
    ]);
    expect(wasmInputsDigest(REPO_ROOT)).toBe(goInputsDigest(REPO_ROOT, WASM_INPUTS, [tsgolintCommit()]));
    expect(isWasmInput).toBe(isGoInput);
    expect(readWasmStamp).toBe(readStamp);
  });
});

describe('go-inputs — the tsgolint commit a build links', () => {
  it('an empty submodule dir is not a checkout, even though git answers from the parent repo', () => {
    const parent = join(scratch, 'parent');
    execFileSync('git', ['init', '-q', parent]);
    const sub = join(parent, 'sub');
    mkdirSync(sub);
    expect(isCheckedOutRepo(sub)).toBe(false);
    execFileSync('git', ['init', '-q', sub]);
    expect(isCheckedOutRepo(sub)).toBe(true);
  });

  it('the recorded gitlink is readable without the submodule and matches the checkout here', () => {
    expect(gitlinkCommit()).toMatch(/^[0-9a-f]{40}$/);
    expect(tsgolintCommit()).toBe(gitlinkCommit());
  });
});
