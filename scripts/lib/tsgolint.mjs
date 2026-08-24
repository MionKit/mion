// tsgolint.mjs — shared helpers for the pinned oxc-project/tsgolint submodule.
//
// The pin (ts-go-runtypes/tsgolint.pin.json) is the single source of truth for the
// tsgolint revision our TypeScript 7 checker (the nested typescript-go) is built
// from. Two commands share the mechanics here: `bump-tsgolint` moves the submodule
// to a NEW revision and WRITES the pin; `ensure-tsgolint` READS the pin and checks
// the submodule out to it, re-applying the shim patches. The submodule gitlink and
// the pin always encode the same commit — a bump moves both. Zero-dep (node
// built-ins + proc.mjs).

import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {GO_ROOT, REPO_ROOT} from './env.mjs';
import {capture, die, red, run, yellow} from './proc.mjs';

export const TSGOLINT = join(GO_ROOT, 'third_party/tsgolint');
export const TSGO = join(TSGOLINT, 'typescript-go');
export const PATCHES = join(TSGOLINT, 'patches');
export const PIN_FILE = join(GO_ROOT, 'tsgolint.pin.json');

// Repo-relative path for human-facing hints (absolute paths are noise).
export const rel = (path) => (path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length + 1) : path);

const PIN_COMMENT =
  'Single source of truth for the pinned oxc-project/tsgolint revision (its nested typescript-go is our TypeScript 7 checker). ' +
  '`pnpm rtx core ensure-tsgolint` checks the submodule out to `commit` and re-applies the shim patches; ' +
  '`pnpm rtx core bump-tsgolint` updates this file and the submodule gitlink together. `ref` is the `git describe` it resolved to (informational).';

export function readPin() {
  try {
    const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8'));
    return pin && pin.commit ? pin : null;
  } catch {
    return null;
  }
}
export function writePin({commit, ref}) {
  writeFileSync(PIN_FILE, JSON.stringify({'//': PIN_COMMENT, commit, ref}, null, 2) + '\n');
}

// ── submodule git state (all non-throwing) ──────────────────────────────────
export const submoduleInitialised = () => capture('git', ['-C', TSGOLINT, 'rev-parse', '--git-dir']).status === 0;
export const headCommit = () => capture('git', ['-C', TSGOLINT, 'rev-parse', 'HEAD']).stdout.trim();
export const shortCommit = (ref = 'HEAD') => capture('git', ['-C', TSGOLINT, 'rev-parse', '--short', ref]).stdout.trim();
export const describe = (dir = TSGOLINT) => capture('git', ['-C', dir, 'describe', '--tags', '--always']).stdout.trim();
// Resolve any ref (tag/branch/sha) to a full commit sha; '' if unknown.
export const resolveCommit = (ref) => capture('git', ['-C', TSGOLINT, 'rev-parse', `${ref}^{commit}`]).stdout.trim();

export const fetchTsgolint = () => run('git', ['-C', TSGOLINT, 'fetch', 'origin', '--tags']) === 0;

// Detach-checkout tsgolint to `ref` and sync the nested typescript-go it pins.
// Non-throwing: returns true on success. (No fetch — the caller fetches if needed.)
//
// --force on the submodule update is REQUIRED: typescript-go's working tree carries
// the shim patches (uncommitted edits), and a plain `submodule update` aborts rather
// than overwrite them. --force discards those edits so the new pinned commit checks
// out; the caller re-applies the patches afterwards via ensurePatches().
export function checkout(ref) {
  if (run('git', ['-C', TSGOLINT, 'checkout', '--detach', ref]) !== 0) return false;
  return run('git', ['-C', TSGOLINT, 'submodule', 'update', '--init', '--force', 'typescript-go']) === 0;
}

// Highest semver release tag origin knows (post-fetch); '' if none.
export function latestReleaseTag() {
  const tags = capture('git', ['-C', TSGOLINT, 'tag', '--list', 'v*', '--sort=-v:refname']).stdout.trim();
  return tags ? tags.split('\n')[0].trim() : '';
}

// ── shim patches ─────────────────────────────────────────────────────────────
// The patches CURRENTLY in the tree, sorted 0001..000N. They ride inside the
// tsgolint repo, so a new revision brings its own matched set — always re-read.
export function patchFiles() {
  try {
    return readdirSync(PATCHES)
      .filter((name) => name.endsWith('.patch'))
      .sort()
      .map((name) => join(PATCHES, name));
  } catch {
    return [];
  }
}
// Applied ⇔ it reverse-applies cleanly (mirrors setup.sh's idempotent probe).
const isApplied = (patch) => capture('git', ['-C', TSGO, 'apply', '--reverse', '--check', patch]).status === 0;

// Apply any not-yet-applied shim patches (idempotent). Returns {applied, already}.
// Dies with the manual-recovery flow if a patch neither applies nor is applied.
export function ensurePatches() {
  const files = patchFiles();
  if (files.length === 0) die(`tsgolint: no *.patch files under ${rel(PATCHES)}.`, 1);
  const pending = files.filter((patch) => !isApplied(patch));
  if (pending.length === 0) return {applied: 0, already: files.length};
  if (run('git', ['-C', TSGO, 'apply', '--3way', ...pending]) === 0) return {applied: pending.length, already: files.length - pending.length};
  reportPatchFailure();
}
function reportPatchFailure() {
  console.error(red('\ntsgolint: patch application FAILED - typescript-go moved under the shim patches.'));
  console.error(yellow("Resolve manually (SETUP.md -> Patching tsgolint's typescript-go):"));
  console.error(`  cd ${rel(TSGO)}`);
  console.error(`  git apply --3way --reject ${rel(PATCHES)}/*.patch`);
  console.error('  # fix each .rej, commit in the nested repo, then refresh the patch:');
  console.error('  git add -A && git commit -m "ts-runtypes: <desc>"');
  console.error(`  git format-patch -1 -o ${rel(PATCHES)}`);
  die('', 1);
}
