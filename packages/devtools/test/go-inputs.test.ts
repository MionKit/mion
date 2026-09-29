// scripts/lib/go-inputs.mjs is the content digest behind the Go binary stamps (scripts/core/build.mjs)
// and the playground wasm's (container/website/scripts/build-playground.mjs).
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM dev script, no types
import {goInputFiles, goInputsDigest, isGoInput, readStamp, writeStamp} from '../../../scripts/lib/go-inputs.mjs';
// @ts-expect-error plain ESM dev script, no types
import {WASM_INPUTS, isWasmInput, readWasmStamp, wasmInputsDigest} from '../../../scripts/website/playground-wasm-inputs.mjs';
import {
  EXTRACT_INPUTS,
  RESOLVER_INPUTS,
  extractDigest,
  goBinCacheKey,
  goIdentity,
  goVersionLdflags,
  pendingPatches,
  pinnedGoVersion,
  resolverDigest,
  // @ts-expect-error plain ESM dev script, no types
} from '../../../scripts/core/build.mjs';
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
      'ts-go-runtypes/go.work',
      'ts-go-runtypes/go.work.sum',
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

describe('go-inputs — the CI cache key for the prebuilt binaries', () => {
  // Key and stamp must match between the building job and every restoring one (no Go, no submodule, or a runner's Go).
  it('is computed with node and git only, and matches the in-process key', () => {
    const dir = join(scratch, 'no-go-bin');
    mkdirSync(dir);
    symlinkSync(process.execPath, join(dir, 'node'));
    symlinkSync(execFileSync('which', ['git'], {encoding: 'utf8'}).trim(), join(dir, 'git'));
    const key = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts/core/build.mjs'), '--cache-key'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {...process.env, PATH: dir},
    }).trim();
    expect(key).toMatch(/^mion-go-bins-[a-z0-9]+-[a-z0-9]+-[0-9a-f]{32}$/);
    expect(key).toBe(goBinCacheKey());
  });

  it('names the pinned Go, the platform and the tsgolint commit, never the Go on PATH', () => {
    const identity = goIdentity();
    expect(identity[0]).toBe(pinnedGoVersion());
    expect(pinnedGoVersion()).toMatch(/^go\d+\.\d+\.\d+$/);
    expect(identity).toContain(`${process.platform}/${process.arch}`);
    expect(identity).toContain(tsgolintCommit());
  });

  // The wasm is built with the pinned Go, so a Go bump must miss the cached one.
  it('keys the cached playground wasm on the pinned Go version and the tsgolint commit', () => {
    const action = readFileSync(join(REPO_ROOT, '.github/actions/cache-playground-wasm/action.yml'), 'utf8');
    expect(action).toContain("'ts-go-runtypes/.go-version'");
    expect(action).toContain('rt-wasm-${{ steps.tsgolint.outputs.sha }}-');
  });

  // constants.Version is folded into typeIDs, so a version bump must never restore an old binary.
  it('carries the root package.json version and a fixed-length tsgo sha in the ldflags the key hashes', () => {
    const version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;
    expect(goVersionLdflags()).toContain(`constants.Version=${version} `);
    // `--short` grows with the object count, which would split one commit into two keys.
    expect(goVersionLdflags()).toMatch(/constants\.TsgoVersion=[0-9a-f]{7}$/);
    expect(resolverDigest(goVersionLdflags().replace(version, '0.0.0-other'))).not.toBe(resolverDigest());
  });

  // The builder applies every patch; the jobs that restore have no submodule at all.
  it('names only the patches left unapplied', () => {
    expect(pendingPatches(['0001-a.patch=applied', '0002-b.patch=pending'])).toEqual(['0002-b.patch=pending']);
    expect(pendingPatches(['0001-a.patch=applied'])).toEqual([]);
  });

  it('gives two checkouts of one commit, with no submodule, the same key', () => {
    const keyIn = (dir: string) =>
      execFileSync(process.execPath, [join(dir, 'scripts/core/build.mjs'), '--cache-key'], {cwd: dir, encoding: 'utf8'}).trim();
    const checkouts = [join(scratch, 'checkout-a'), join(scratch, 'nested/checkout-b')];
    for (const dir of checkouts) execFileSync('git', ['-C', REPO_ROOT, 'worktree', 'add', '--detach', '-q', dir, 'HEAD']);
    try {
      expect(keyIn(checkouts[0])).toBe(keyIn(checkouts[1]));
    } finally {
      for (const dir of checkouts) execFileSync('git', ['-C', REPO_ROOT, 'worktree', 'remove', '--force', dir]);
    }
  }, 120_000);

  // A job that restored the wasm has no Go: the playground build must still run, and ask for Go only to rebuild.
  it('runs the playground build without Go, which asks for Go only when the wasm stamp is stale', () => {
    const site = readFileSync(join(REPO_ROOT, 'scripts/website/site.mjs'), 'utf8');
    const ensure = site.slice(
      site.indexOf('function ensurePlayground('),
      site.indexOf('\n}\n', site.indexOf('function ensurePlayground('))
    );
    expect(ensure).toContain('build-playground.mjs');
    expect(ensure).not.toContain("which('go')");
    const build = readFileSync(join(REPO_ROOT, 'container/website/scripts/build-playground.mjs'), 'utf8');
    const stale = build.slice(build.indexOf('function buildWasmIfStale()'));
    expect(stale.indexOf('if (!wasmMaybeStale())')).toBeLessThan(stale.indexOf("if (!which('go'))"));
  });

  it('keys the resolver and the extractor on their own inputs', () => {
    expect(RESOLVER_INPUTS[0]).toBe('ts-go-runtypes/cmd/mion');
    expect(EXTRACT_INPUTS).toEqual(['ts-go-runtypes/cmd/extract-fn-bodies', ...RESOLVER_INPUTS.slice(1)]);
    expect(resolverDigest()).not.toBe(extractDigest());
  });
});
