// Shared identity of the Go sources the playground WASM is compiled from.
//
// Two consumers deliberately share this one implementation, so they can never
// disagree about what "the wasm is out of date" means:
//   - container/website/scripts/build-playground.mjs stamps the digest beside
//     the wasm it just built, and rebuilds when the digest no longer matches.
//   - packages/run-types/test/playground/nodeResolver.ts re-computes it to
//     decide whether the cached wasm still matches the tree under test.
//
// Content, not mtimes. Copying .cache/rt-wasm/ into a `git worktree add`
// reorders mtimes freely, so an mtime anchor can leave a stale cache looking
// current — which is how a wasm predating the `virtual:rt/` -> `rtmod:/` rename
// once ran a whole suite against dead code and failed four assertions about a
// prefix nobody had touched. A content digest cannot lie about that.

import {createHash} from 'node:crypto';
import {existsSync, globSync, readFileSync, statSync} from 'node:fs';
import {join, sep} from 'node:path';

// Every Go input the wasm links, repo-relative.
export const WASM_INPUTS = ['ts-go-runtypes/cmd/ts-runtypes-wasm', 'ts-go-runtypes/internal', 'ts-go-runtypes/go.mod', 'ts-go-runtypes/go.sum'];

// Only files that can end up IN the binary count. `go build` never compiles
// _test.go, and the go tool ignores testdata/ entirely, so hashing them would
// flip the digest on edits that cannot change the wasm by one byte. That matters
// because the test loader SKIPS on a mismatch: an over-broad digest would drop
// the playground suites on any PR that touched a Go test, trading a loud failure
// for silent coverage loss.
export function isWasmInput(relPath) {
  if (relPath.endsWith('_test.go')) return false;
  return !relPath.split('/').includes('testdata');
}

// Collect (repo-relative path, absolute path) for every input file, in sorted
// path order so the digest is stable across machines and filesystems.
function inputFiles(repoRoot) {
  const files = [];
  for (const input of WASM_INPUTS) {
    const abs = join(repoRoot, input);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) {
      files.push([input, abs]);
      continue;
    }
    for (const rel of globSync('**/*', {cwd: abs})) {
      const relPosix = `${input}/${rel.split(sep).join('/')}`;
      if (!isWasmInput(relPosix)) continue;
      const full = join(abs, rel);
      if (statSync(full).isFile()) files.push([relPosix, full]);
    }
  }
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return files;
}

// sha256 over (path, bytes) for every compiled input. Non-.go files are included
// so a //go:embed asset can't slip through; only the two categories the go tool
// itself ignores are filtered out. Costs ~40ms.
export function wasmInputsDigest(repoRoot) {
  const hash = createHash('sha256');
  for (const [rel, abs] of inputFiles(repoRoot)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(abs));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// The stamp file records the digest of the tree the cached wasm was built from.
// Empty / absent reads as "unknown", which callers must treat as not-fresh: an
// unverifiable cache is exactly the case that used to fail silently.
export function readWasmStamp(stampPath) {
  if (!existsSync(stampPath)) return '';
  return readFileSync(stampPath, 'utf8').trim();
}
