// Applies the marked decisions to the tree.
//
//   node migration/apply.mjs --dry              show every change, write nothing
//   node migration/apply.mjs --phase npm-scope  apply ONE transform
//   node migration/apply.mjs                    apply every renaming transform
//
// Phase at a time is the intended way to drive it: each phase has its own gate in the
// spec, so a break is localised to the concept that caused it instead of surfacing at the
// end of a 25,000-site rewrite.
//
// Refusals, all deliberate. Every one of these is a state where continuing could damage
// the tree in a way that is tedious to unpick:
//
//   - a dirty working tree, so the rewrite is always its own reviewable diff
//   - any undecided or unknown row (check.mjs is re-run inline)
//   - any row marked `manual`
//   - an empty target in targets.json for a transform being applied

import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {walk} from './lib/walk.mjs';
import {readDecisions, REPO_ROOT, MIGRATION_DIR} from './lib/shards.mjs';
import {TRANSFORMS, isKnownTransform, rewriteToken, OUT_OF_PHASE} from './lib/transforms.mjs';
import {applyEdits} from './lib/edits.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry');
const phaseIndex = argv.indexOf('--phase');
const phase = phaseIndex === -1 ? null : argv[phaseIndex + 1];

if (phase && !isKnownTransform(phase)) {
  console.error(`unknown phase ${JSON.stringify(phase)}`);
  process.exit(2);
}

const targets = JSON.parse(readFileSync(join(MIGRATION_DIR, 'targets.json'), 'utf8'));
const decisions = readDecisions();

if (decisions.size === 0) {
  console.error('no shards found — run `node migration/scan.mjs` first');
  process.exit(2);
}

// ---- refuse on a dirty tree ----------------------------------------------------------
if (!dryRun) {
  const dirty = execFileSync('git', ['status', '--porcelain'], {cwd: REPO_ROOT})
    .toString()
    .split('\n')
    .filter((l) => l.trim() && !l.includes('migration/'));
  if (dirty.length) {
    console.error('refusing to run: the working tree has uncommitted changes.');
    console.error('commit or stash them first so the rewrite is its own reviewable diff.');
    for (const line of dirty.slice(0, 10)) console.error(`   ${line}`);
    process.exit(1);
  }
}

// ---- refuse on unknown / manual, and on undecided ONLY for a full run -----------------
//
// A phased run touches only the rows carrying that one transform, so an undecided row
// belonging to a LATER phase is simply not its business: blocking on it would mean phase
// 1 could never run until phase 5 had been decided. It is still reported, so the residue
// never goes quiet.
//
// A full run is different. There, "undecided" means an occurrence nobody has ruled on
// would be silently left behind, so it blocks.
const blocking = [];
let undecided = 0;
for (const row of decisions.values()) {
  if (!row.t) {
    undecided++;
    if (!phase) blocking.push(`${row.id}  (undecided)`);
  } else if (!isKnownTransform(row.t)) {
    blocking.push(`${row.id}  (unknown transform ${JSON.stringify(row.t)})`);
  } else if (row.t === 'manual' && (!phase || phase === 'manual')) {
    blocking.push(`${row.id}  (marked manual)`);
  }
}
if (blocking.length) {
  console.error(`refusing to run: ${blocking.length} row(s) are not ready.`);
  for (const line of blocking.slice(0, 15)) console.error(`   ${line}`);
  console.error('run `node migration/check.mjs` for the full list.');
  process.exit(1);
}
if (undecided) console.log(`note  ${undecided} row(s) still undecided; they belong to later phases and are untouched.`);

// ---- collect the edits ---------------------------------------------------------------
const editsByFile = new Map();
const unknownKeys = [];
let skippedRegenerate = 0;
let outOfPhase = 0;

walk((hit) => {
  const row = decisions.get(hit.id);
  if (!row) {
    unknownKeys.push(`${hit.id}  (${hit.file}:${hit.lineNumber + 1})`);
    return;
  }
  if (phase && row.t !== phase) return;

  const transform = TRANSFORMS[row.t];
  if (!transform.renames) {
    if (row.t === 'regenerate') skippedRegenerate++;
    return;
  }

  const replacement = rewriteToken(hit.token, row.t, targets);
  if (replacement === OUT_OF_PHASE) {
    outOfPhase++;
    return;
  }
  const list = editsByFile.get(hit.file) || [];
  list.push({line: hit.lineNumber, start: hit.start, end: hit.end, text: replacement, was: hit.token});
  editsByFile.set(hit.file, list);
});

if (unknownKeys.length) {
  console.error(`refusing to run: ${unknownKeys.length} key(s) in the tree have no decision.`);
  console.error('the classifier changed since the scan — re-run scan.mjs.');
  for (const line of unknownKeys.slice(0, 10)) console.error(`   ${line}`);
  process.exit(1);
}

// ---- write ---------------------------------------------------------------------------
let filesChanged = 0;
let sitesChanged = 0;

for (const [file, edits] of [...editsByFile].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
  const absolute = join(REPO_ROOT, file);
  const lines = readFileSync(absolute, 'utf8').split('\n');

  // Edits are grouped per line, then each line is spliced right-to-left so replacements
  // of a different length never shift the offsets of the ones still to come.
  const byLine = new Map();
  for (const edit of edits) {
    const list = byLine.get(edit.line) || [];
    list.push(edit);
    byLine.set(edit.line, list);
  }

  for (const [lineNumber, lineEdits] of byLine) {
    lines[lineNumber] = applyEdits(lines[lineNumber], lineEdits);
  }

  filesChanged++;
  sitesChanged += edits.length;

  if (dryRun) {
    console.log(`\n${file}  (${edits.length} site${edits.length === 1 ? '' : 's'})`);
    for (const [lineNumber, lineEdits] of [...byLine].slice(0, 3)) {
      console.log(`  ${lineNumber + 1}: ${lineEdits.map((e) => `${e.was} -> ${e.text}`).join(', ')}`);
    }
  } else {
    writeFileSync(absolute, lines.join('\n'));
  }
}

console.log(`\n${dryRun ? 'would change' : 'changed'}  ${sitesChanged} sites in ${filesChanged} files`);
if (skippedRegenerate) console.log(`skipped     ${skippedRegenerate} generated rows — re-run their generators`);
if (outOfPhase) console.log(`out of phase ${outOfPhase} sites whose package is mapped to null in targets.json`);
if (phase) console.log(`phase       ${phase}`);
else console.log('NOTE: file/directory renames are NOT done here — run them after this, per the spec.');
