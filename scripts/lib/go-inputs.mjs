// Content identity of a set of Go inputs, and the stamp file that records it.
//
// Two builds share this one implementation, so they can never disagree about
// what "built from this tree" means:
//   - scripts/core/build.mjs stamps mion-bin/.mion.stamp after it verifies or builds
//     mion-bin/mion, and trusts a matching stamp instead of compiling a reference
//     binary on every gated command (the authoritative build-id compare stays
//     behind `miondevx core build`).
//   - scripts/website/playground-wasm-inputs.mjs computes the playground wasm's
//     digest with it, for the build script's stamp and the test loader's check.
//
// Content, not mtimes. Copying a cache into a `git worktree add` reorders mtimes
// freely, so an mtime anchor can leave a stale artifact looking current; a
// content digest cannot lie about that.

import {createHash} from 'node:crypto';
import {existsSync, globSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, sep} from 'node:path';

// Only files that can end up IN a binary count. `go build` never compiles
// _test.go, and the go tool ignores testdata/ entirely, so hashing them would
// flip the digest on edits that cannot change the binary by one byte.
export function isGoInput(relPath) {
  if (relPath.endsWith('_test.go')) return false;
  return !relPath.split('/').includes('testdata');
}

// Collect (repo-relative path, absolute path) for every input file, in sorted
// path order so the digest is stable across machines and filesystems.
export function goInputFiles(repoRoot, inputs) {
  const files = [];
  for (const input of inputs) {
    const abs = join(repoRoot, input);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) {
      files.push([input, abs]);
      continue;
    }
    for (const rel of globSync('**/*', {cwd: abs})) {
      const relPosix = `${input}/${rel.split(sep).join('/')}`;
      if (!isGoInput(relPosix)) continue;
      const full = join(abs, rel);
      if (statSync(full).isFile()) files.push([relPosix, full]);
    }
  }
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return files;
}

// sha256 over (path, bytes) for every compiled input, then over each `extra`
// identity string (a submodule commit, the ldflags, the toolchain version:
// things the binary depends on that no input file records). Non-.go files are
// included so a //go:embed asset can't slip through. Costs ~50ms for the
// resolver tree.
export function goInputsDigest(repoRoot, inputs, extra = []) {
  const hash = createHash('sha256');
  for (const [rel, abs] of goInputFiles(repoRoot, inputs)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(abs));
    hash.update('\0');
  }
  for (const item of extra) {
    hash.update('\x01');
    hash.update(item);
  }
  return hash.digest('hex');
}

// The stamp file records the digest of the tree an artifact was built from.
// Empty / absent reads as "unknown", which callers must treat as not-fresh: an
// unverifiable artifact is exactly the case that used to fail silently.
export function readStamp(stampPath) {
  if (!existsSync(stampPath)) return '';
  return readFileSync(stampPath, 'utf8').trim();
}

export function writeStamp(stampPath, digest) {
  mkdirSync(dirname(stampPath), {recursive: true});
  writeFileSync(stampPath, `${digest}\n`);
}
