// check-tree.mjs — the repo hygiene sweeps that read EVERY tracked file.
//
// These three used to live only inside repo-contracts.test.ts, which runs in the
// js-lint job. That was fine while js-lint ran on every commit, and became a hole
// the moment lanes started skipping by content (scripts/ci/lanes.mjs): a sweep that
// reads docs/, .claude/ and the root prose files cannot be gated on paths that
// deliberately exclude them, or an offending edit lands unseen.
//
// So they run here instead, from the `lanes` job, which always runs and installs
// nothing: git plus node, no workspace, no build. The rules themselves are still
// unit-tested in repo-contracts.test.ts, which imports these same functions, so
// there is exactly one implementation of each.
//
// Usage: `pnpm run check:tree`, or `node scripts/ci/check-tree.mjs`.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError, success} from '../lib/proc.mjs';

// A path under docs/todos/ or docs/done/ ending in a spec filename. Specs get
// deleted, so any reference to one rots; the rule is that nothing names them.
export const SPEC_REFERENCE = /docs\/(todos|done)\/[a-z0-9-]+\.md/;
// Where naming a spec is legitimate: the two spec directories themselves, the
// changelog (history), the vendored submodule and every isolated dependency tree.
export const SPEC_REFERENCE_EXEMPT = /^(docs\/(todos|done)\/|CHANGELOG\.md$|ts-go-runtypes\/third_party\/)|(^|\/)(_deps|node_modules)\//;

// Pure over (path, text) so the rule is testable without a checkout.
export const specReferenceOffenders = (entries) =>
  entries
    .filter(({file}) => !SPEC_REFERENCE_EXEMPT.test(file))
    .filter(({text}) => SPEC_REFERENCE.test(text))
    .map(({file}) => file);

// -I skips binaries, and git grep only sees tracked files, so ignored build output
// never trips any of this.
const grepFiles = (args) =>
  capture('git', ['grep', '-I', '-l', ...args], {cwd: REPO_ROOT})
    .stdout.trim()
    .split('\n')
    .filter(Boolean);

export function specReferences() {
  const candidates = grepFiles(['-E', SPEC_REFERENCE.source, '--', '.']);
  return specReferenceOffenders(candidates.map((file) => ({file, text: readFileSync(join(REPO_ROOT, file), 'utf8')})));
}

// The packages moved out of a separate repository and the old URL kept surviving in
// package.json fields and READMEs. docs/ is exempt: it records history. The needle is
// split so this file never matches itself.
export function oldRepoReferences() {
  return grepFiles([['MionKit', 'ts-run-types'].join('/'), '--', '.', ':!docs', ':!ts-go-runtypes/third_party']);
}

// A literal NUL makes git classify a file as BINARY: no line diffs, no auto-merge.
// Two files carried one, and the rtUtils.ts one blocked a rebase.
const NUL_SCANNED = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.go', '*.json', '*.md'];

export function nulBytes() {
  const listed = capture('git', ['ls-files', '-z', '--', ...NUL_SCANNED], {cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024});
  if (listed.status !== 0) die(`git ls-files failed: ${listed.stderr.trim()}`);
  const files = listed.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('ts-go-runtypes/third_party/') && !file.includes('/testdata/'));
  // A sweep that silently matched nothing would pass forever; the floor catches it.
  if (files.length < 500) die(`the NUL sweep listed only ${files.length} files, so its pathspecs stopped matching`);
  return files.filter((file) => readFileSync(join(REPO_ROOT, file)).includes(0));
}

export const SWEEPS = [
  {name: 'no file outside docs/todos and docs/done names a spec', run: specReferences, fix: 'put the reasoning in the file that needs it; a spec gets deleted and the reference rots'},
  {name: 'no tracked file outside docs/ names the old repository', run: oldRepoReferences, fix: 'point it at MionKit/mion'},
  {name: 'no tracked source carries a literal NUL byte', run: nulBytes, fix: 'strip the NUL; git treats the file as binary and a rebase cannot merge it'},
];

export function main() {
  const failed = [];
  for (const sweep of SWEEPS) {
    const offenders = sweep.run();
    if (offenders.length === 0) continue;
    failed.push(sweep.name);
    note(`${sweep.name} — ${offenders.length} offender(s), ${sweep.fix}:`);
    for (const file of offenders) console.error(`  ${file}`);
  }
  if (failed.length > 0) die(`check-tree: ${failed.length} sweep(s) failed`);
  success(`check-tree: all ${SWEEPS.length} whole-tree sweeps clean`);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
