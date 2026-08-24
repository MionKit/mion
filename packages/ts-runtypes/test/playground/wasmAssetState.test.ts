/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {isWasmInput, wasmInputsDigest} from '../../../../scripts/website/playground-wasm-inputs.mjs';
import {wasmAssetState} from './nodeResolver.ts';

// The gate this pins: a playground WASM cache that EXISTS but predates the Go
// tree must be treated as unusable, not loaded. Before the stamp existed, the
// suites ran against it and failed four assertions naming a module prefix
// nobody had changed, which reads as broken tests rather than a stale artifact.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const dirs: string[] = [];

function cacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rt-wasm-state-'));
  dirs.push(dir);
  return dir + sep;
}

// The two files assetsBuilt requires; contents are irrelevant to the gate.
function writeAssets(dir: string): void {
  writeFileSync(`${dir}ts-runtypes.wasm`, 'not really wasm');
  writeFileSync(`${dir}wasm_exec.js`, '// not really wasm_exec');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe('playground WASM asset state', () => {
  it('reports missing when the host never built the assets', () => {
    expect(wasmAssetState(cacheDir(), REPO_ROOT)).toBe('missing');
  });

  it('reports stale when the assets exist with no stamp at all', () => {
    const dir = cacheDir();
    writeAssets(dir);
    // The pre-stamp world: build-playground used to touch an EMPTY file as an
    // mtime anchor, so an unstamped cache is exactly the cache that broke.
    writeFileSync(`${dir}.wasm-stamp`, '');
    expect(wasmAssetState(dir, REPO_ROOT)).toBe('stale');
  });

  it('reports stale when the stamp records a different tree', () => {
    const dir = cacheDir();
    writeAssets(dir);
    writeFileSync(`${dir}.wasm-stamp`, `${'0'.repeat(64)}\n`);
    expect(wasmAssetState(dir, REPO_ROOT)).toBe('stale');
  });

  it('reports ready only when the stamp matches the tree digest', () => {
    const dir = cacheDir();
    writeAssets(dir);
    writeFileSync(`${dir}.wasm-stamp`, `${wasmInputsDigest(REPO_ROOT)}\n`);
    expect(wasmAssetState(dir, REPO_ROOT)).toBe('ready');
  });

  it('digests the Go tree deterministically, and the digest tracks its content', () => {
    expect(wasmInputsDigest(REPO_ROOT)).toBe(wasmInputsDigest(REPO_ROOT));
    // A tree with none of the inputs present hashes to the empty digest, so a
    // missing checkout can never accidentally match a real one.
    expect(wasmInputsDigest(cacheDir())).not.toBe(wasmInputsDigest(REPO_ROOT));
  });
});

// The gate SKIPS on a mismatch, so anything counted as an input that cannot
// actually change the wasm costs real coverage: touch one Go test file and the
// playground suites vanish from the run. `go build` compiles neither of these.
describe('what counts as a wasm input', () => {
  it('ignores _test.go, which go build never compiles', () => {
    expect(isWasmInput('ts-go-runtypes/internal/compiler/resolver/atomic_test.go')).toBe(false);
    expect(isWasmInput('ts-go-runtypes/internal/compiler/resolver/atomic.go')).toBe(true);
  });

  it('ignores testdata/, which the go tool skips entirely', () => {
    expect(isWasmInput('ts-go-runtypes/internal/cachegen/testdata/golden.json')).toBe(false);
    expect(isWasmInput('ts-go-runtypes/internal/cachegen/runtype.go')).toBe(true);
  });

  it('keeps non-Go files that a //go:embed could pull in', () => {
    expect(isWasmInput('ts-go-runtypes/internal/diagnostics/catalog.json')).toBe(true);
    expect(isWasmInput('ts-go-runtypes/go.sum')).toBe(true);
  });

  it('does not match a directory merely containing the word testdata', () => {
    expect(isWasmInput('ts-go-runtypes/internal/testdata-helpers/gen.go')).toBe(true);
  });
});
