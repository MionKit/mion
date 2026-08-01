// Seeded driver for the TYPE-MODIFICATION enrich fuzzer. Where enrichFuzzRunner
// drives field edits on a flat hardcoded `User`, this one starts from a RANDOM
// deep type (typeGen) and then drives a random stream of OPERATIONS on it
// (typeModify): rename the whole type, rename / add / delete / retype a property
// anywhere in the tree, or corrupt the source mid-edit. After every operation it
// reconciles the committed mirror with the real `gen --update` binary and asserts
// the reconciler's contracts — most importantly that NOTHING authored is ever
// lost, on a far wider type space than the hand-written cases or the flat fuzzer
// reach.
//
// Frame-free (pure seed → report) so it runs under Vitest AND as a soak, and
// deterministic so a failing seed prefix-shrinks to the shortest reproducer.
//
// Pinned by the default lane over the FULL named type space + mid-edit corruptions
// (these HOLD — the whole-const @rtOrphan carcass handling + graph-parity rename
// matcher are stable):
//   NL  nothing-lost every authored sentinel survives a valid edit — live, carried
//                    across a rename, or preserved verbatim in an @rtOrphanChild carcass
//   RC  rename-carry a ROOT rename (renameRoot / renameRootReshaped, incl. the rename
//                    + reshape the graph-parity matcher carries) moves authored labels
//                    onto the LIVE const, not into a carcass — every label live BEFORE
//                    the step is still live (carcass-stripped) AFTER. Scoped to root
//                    renames: only there is the match a single, unambiguous, non-
//                    cascading drop↔add. Sub-decl / field renames can legitimately
//                    demote (ambiguity, recursive-type id change, nominal enum) and are
//                    covered by NL, not RC.
//   CB  content-blind a twin mirror with EMPTY values, driven through the SAME edits,
//                    reconciles to identical STRUCTURE (and the same control outcome) as
//                    the FILLED one — filling labels never changes which fields move
//                    where or whether it converges
//   R6  convergence  after a valid edit a second `--update` is a byte-identical no-op
//   R10 totality     every `gen --update` is controlled (no panic / internal error / hang)
//   P   parse-safety a failed corruption reconcile leaves the mirror byte-identical
// Type-RENAME ops (renameRoot / renameDecl / renameRootReshaped) run in the default
// lane now that the const-level graph-parity matcher carries rename + reshape; the
// root-rename carry is asserted by RC.

import {existsSync} from 'node:fs';
import {makeFixture, setSource, editMirror, readMirrors, type ReconcileFixture} from '../../util/enrichReconcile.ts';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {genType, type GenOptions} from '../core/typeGen.ts';
import {modifyType, renderRootedSource, rootGeneratedType, type RootedType} from './typeModify.ts';
import {scaffold, update, isControlled, type CliResult} from './enrichCli.ts';

// Deep but bounded — serialisable only (the reconciler scaffolds authorable
// nodes for these), so a scaffold reliably succeeds and every leaf round-trips.
const MOD_GEN_OPTIONS: GenOptions = {
  maxDepth: 3,
  maxBreadth: 3,
  wild: false,
  nonDataTypes: false,
  weirdKeys: true,
  named: true,
};

// Fraction of steps that fire a mid-edit source CORRUPTION (truncate a literal, drop
// a brace, splice garbage). tsgo error-recovers them; the reconciler handles the
// recovered-garbage reconcile without crashing or losing content (the whole-const
// @rtOrphan carcass handling is now stable).
const STEP_INVALID_CHANCE = 0.35;

export type ModRuleId = 'R10' | 'P' | 'R6' | 'NL' | 'RC' | 'CB';

// blankAuthored empties every authored `rt$label` value so two mirror states that differ
// ONLY in authored text compare equal — the normalizer for the content-blindness oracle.
// Labels are the only thing the fuzzer authors (authorLabels); everything else (mock
// pools, rt$errors) stays blank in both the filled and empty twins.
function blankAuthored(mirror: string): string {
  return mirror.replace(/rt\$label: '[^']*'/g, () => "rt$label: ''");
}

// orphanBlockPattern strips @rtOrphan / @rtOrphanChild block comments to leave only
// the LIVE mirror text — mirrors the Go orphanBlockPattern (reconcile.go). The
// carcass's own inner `*/` was comment-sanitized to `* /` when written, so the
// first ` */` is its true terminator.
const orphanBlockPattern = /\/\* @rtOrphan(?:Child)? [\s\S]*? \*\//g;

// liveSentinels returns the authored sentinels still present once every @rtOrphan
// carcass is stripped — i.e. carried onto a LIVE const, not parked in a carcass.
// Runs over the combined both-families text so a carcass in EITHER family is seen.
function liveSentinels(mirrors: string, sentinels: string[]): Set<string> {
  const live = mirrors.replace(orphanBlockPattern, '');
  return new Set(sentinels.filter((sentinel) => live.includes(sentinel)));
}

export interface ModViolation {
  rule: ModRuleId;
  op: string;
  step: number;
  seed: number;
  message: string;
}

export interface ModSequenceResult {
  seed: number;
  log: string[];
  violations: ModViolation[];
  skipped: boolean; // the generated type's initial scaffold wasn't usable
}

function why(result: CliResult): string {
  if (result.timedOut) return 'TIMED OUT (hang)';
  if (result.launchError) return `launch error: ${result.launchError}`;
  return `exit ${result.status}: ${result.stderr.slice(0, 240)}`;
}

// Author friendly `rt$label`s with unique sentinels and return them — the tracers
// for "nothing lost" (labels are type-INDEPENDENT, so the reconciler must carry
// them across structural edits).
//
//   deep=false (default lane): author ONLY the two anchor fields' own labels. They
// Author EVERY scaffolded `rt$label` in the FRIENDLY mirror (including those on
// Map / Set / enum / named sub-consts) with a unique sentinel, and return them.
// With the carcass handling stable, all of these survive every edit — live,
// carried, or parked in a carcass — so the full set is the nothing-lost tracer.
function authorLabels(fixture: ReconcileFixture): string[] {
  const sentinels: string[] = [];
  editMirror(fixture, 'friendly', (text) =>
    text.replace(/rt\$label: ''/g, () => {
      const sentinel = `LBL_${sentinels.length}_x`;
      sentinels.push(sentinel);
      return `rt$label: '${sentinel}'`;
    })
  );
  return sentinels;
}

function missingSentinels(mirrors: string, sentinels: string[]): string[] {
  return sentinels.filter((sentinel) => !mirrors.includes(sentinel));
}

// Run ONE sequence: generate a rooted type, scaffold + author, then apply up to
// `maxSteps` random modifications, asserting the oracles after each. Stops at the
// first violating step so the log is the path to the failure.
export function runOneModSequence(seed: number, maxSteps: number): ModSequenceResult {
  const log: string[] = [];
  const violations: ModViolation[] = [];
  let skipped = false;

  withSeededRandom(seed, () => {
    const gen = genType(MOD_GEN_OPTIONS);
    let rooted: RootedType = rootGeneratedType(gen, seed >>> 0, Math.random);

    const fixture = makeFixture(`tm-${seed >>> 0}`, renderRootedSource(rooted));
    const scaffolded = scaffold(fixture, rooted.rootName);
    if (!isControlled(scaffolded)) {
      // The resolver couldn't handle this generated type at all — out of scope
      // for a RECONCILE fuzzer (the typeFuzz lane owns resolver robustness). Skip.
      skipped = true;
      return;
    }
    if (!existsSync(fixture.friendlyPath) || !existsSync(fixture.mockPath)) {
      skipped = true; // scaffold produced no mirrors (e.g. an empty desired set)
      return;
    }
    const sentinels = authorLabels(fixture);
    if (sentinels.length === 0) {
      skipped = true; // nothing authorable — a degenerate root, skip
      return;
    }

    // The EMPTY twin for the content-blindness (CB) oracle: same source, scaffolded but
    // NOT authored (labels stay blank). Driven through the identical edit stream below,
    // it must reconcile to the same STRUCTURE as the filled fixture. Scaffolded from the
    // same source the filled one was, so it cannot fail here if the filled one didn't.
    const emptyFixture = makeFixture(`tm-${seed >>> 0}-empty`, renderRootedSource(rooted));
    if (
      !isControlled(scaffold(emptyFixture, rooted.rootName)) ||
      !existsSync(emptyFixture.friendlyPath) ||
      !existsSync(emptyFixture.mockPath)
    ) {
      skipped = true;
      return;
    }

    const record = (rule: ModRuleId, op: string, step: number, message: string): void => {
      violations.push({rule, op, step, seed, message});
    };

    try {
      for (let step = 0; step < maxSteps; step++) {
        const allowInvalid = Math.random() < STEP_INVALID_CHANCE;
        const result = modifyType(rooted, Math.random, {allowInvalid});
        rooted = result.rooted;
        log.push(result.op);

        const before = readMirrors(fixture);
        const source = result.rawSource ?? renderRootedSource(rooted);
        setSource(fixture, source);
        setSource(emptyFixture, source);
        const run = update(fixture, rooted.rootName);
        const runEmpty = update(emptyFixture, rooted.rootName);

        // R10 — never a crash, hang, or internal error, on ANY input.
        if (!isControlled(run)) {
          record('R10', result.op, step, `\`${run.argv.join(' ')}\` ${why(run)}`);
          break;
        }
        // Both family mirrors must still EXIST after a controlled reconcile — a
        // successful run that leaves a file missing is a write bug.
        if (!existsSync(fixture.friendlyPath) || !existsSync(fixture.mockPath)) {
          record(
            'R10',
            result.op,
            step,
            `gen exited ${run.status} but a family mirror is GONE — stderr: ${run.stderr.slice(0, 200)}`
          );
          break;
        }
        const after = readMirrors(fixture);

        // CB — content-blindness: the empty twin (same edits, no authored values) must
        // reconcile to the same CONTROL outcome and the same STRUCTURE. The filled run
        // is controlled + present here (checked just above), so the empty twin must be
        // too, and the two mirrors must match once authored text is blanked. Holds for
        // both valid edits and recovered/failed corruptions (the source is identical for
        // both twins, so only a value-dependent reconcile branch could diverge them).
        if (!isControlled(runEmpty) || !existsSync(emptyFixture.friendlyPath) || !existsSync(emptyFixture.mockPath)) {
          record('CB', result.op, step, `empty twin diverged in control: filled ok, empty ${why(runEmpty)}`);
          break;
        }
        const afterEmpty = readMirrors(emptyFixture);
        if (blankAuthored(after) !== blankAuthored(afterEmpty)) {
          if (process.env.RT_FUZZ_TYPEMOD_DEBUG) {
            console.error(
              `\n===== CB DEBUG (${result.op}) =====\n--- source ---\n${source}\n` +
                `--- FILLED (blanked) ---\n${blankAuthored(after)}\n--- EMPTY (blanked) ---\n${blankAuthored(afterEmpty)}\n=====`
            );
          }
          record('CB', result.op, step, 'empty and filled mirrors differ in structure (reconcile not content-blind)');
          break;
        }

        if (result.editClass !== 'valid') {
          // A deliberate source corruption. tsgo's parser ERROR-RECOVERS from many
          // of these (an unterminated literal swallows trailing tokens, a stray
          // token is skipped), so gen may still SUCCEED on a recovered-but-different
          // type. Don't assume the outcome — observe it:
          //   exit 0  → it recovered and wrote a valid mirror; nothing may be lost.
          //   exit ≠0 → a genuine failure; the write must be a byte-identical no-op
          //             (the atomic write means a failed reconcile never tears the file).
          if (run.status === 0) {
            const lost = missingSentinels(after, sentinels);
            if (lost.length > 0) {
              record(
                'NL',
                result.op,
                step,
                `corruption recovered but LOST ${lost.length} label(s): ${lost.slice(0, 4).join(', ')}`
              );
              break;
            }
          } else if (after !== before) {
            if (process.env.RT_FUZZ_TYPEMOD_DEBUG) {
              console.error(
                `\n===== P DEBUG (${result.op}) exit=${run.status} =====\n${run.stderr.slice(0, 400)}\n` +
                  `--- source ---\n${source}\n--- BEFORE ---\n${before}\n--- AFTER ---\n${after}\n=====`
              );
            }
            record(
              'P',
              result.op,
              step,
              `failed reconcile TORE the mirror (exit ${run.status}, expected a byte-identical no-op)`
            );
            break;
          }
          // Restore a known-valid state so the sequence continues from solid ground —
          // for BOTH twins, keeping the empty fixture in lockstep for the next step's CB.
          const validSource = renderRootedSource(rooted);
          setSource(fixture, validSource);
          setSource(emptyFixture, validSource);
          const restore = update(fixture, rooted.rootName);
          const restoreEmpty = update(emptyFixture, rooted.rootName);
          if (!isControlled(restore) || !isControlled(restoreEmpty)) {
            record('R10', `${result.op}:restore`, step, `\`${restore.argv.join(' ')}\` ${why(restore)}`);
            break;
          }
          continue;
        }

        // editClass === 'valid'
        // NL — every authored sentinel must still be somewhere in the file (live,
        // carried across the rename, or parked verbatim in an @rtOrphanChild).
        const lost = missingSentinels(after, sentinels);
        if (lost.length > 0) {
          if (process.env.RT_FUZZ_TYPEMOD_DEBUG) {
            console.error(
              `\n===== NL DEBUG (${result.op}) lost=${lost.join(',')} =====\n--- source ---\n${source}\n` +
                `--- BEFORE ---\n${before}\n--- AFTER ---\n${after}\n=====`
            );
          }
          record('NL', result.op, step, `LOST ${lost.length} authored label(s): ${lost.slice(0, 4).join(', ')}`);
          break;
        }
        // RC — a ROOT rename (renameRoot / renameRootReshaped, incl. the rename +
        // reshape the graph-parity matcher carries) must move authored labels onto the
        // LIVE const, not demote them into an @rtOrphan carcass: every label live BEFORE
        // the step is still live (carcass-stripped) AFTER. This is the bite the older NL
        // oracle lacks — NL passes if a label merely survives in a carcass; RC fails
        // unless it carried.
        //
        // Scoped to ROOT renames on purpose — only there is carry-to-live a CLEAN
        // invariant: the root is a single drop↔add (unambiguous) and nothing references
        // it, so its rename never cascades. Sub-decl and FIELD renames can legitimately
        // demote a label (a same-shape sibling makes the match ambiguous → safe
        // fall-through; renaming a field inside a RECURSIVE type changes that type's id,
        // so a self-referencing field's element type "changes" and correctly
        // re-scaffolds; a nominal enum rename carries via the referential signal but
        // is asserted by Go tests, not here). Those are covered by NL (nothing lost,
        // carcass preserves it), not asserted as a live carry.
        if (result.op.startsWith('renameRoot')) {
          const liveBefore = liveSentinels(before, sentinels);
          const liveAfter = liveSentinels(after, sentinels);
          const demoted = [...liveBefore].filter((sentinel) => !liveAfter.has(sentinel));
          if (demoted.length > 0) {
            if (process.env.RT_FUZZ_TYPEMOD_DEBUG) {
              console.error(
                `\n===== RC DEBUG (${result.op}) demoted=${demoted.join(',')} =====\n--- source ---\n${source}\n` +
                  `--- BEFORE ---\n${before}\n--- AFTER ---\n${after}\n=====`
              );
            }
            record(
              'RC',
              result.op,
              step,
              `rename demoted ${demoted.length} live label(s) into a carcass: ${demoted.slice(0, 4).join(', ')}`
            );
            break;
          }
        }
        // R6 — a valid edit converges: a second --update is a byte-identical no-op.
        const again = update(fixture, rooted.rootName);
        if (!isControlled(again)) {
          record('R10', `${result.op}:again`, step, `\`${again.argv.join(' ')}\` ${why(again)}`);
          break;
        }
        const settled = readMirrors(fixture);
        if (settled !== after) {
          if (process.env.RT_FUZZ_TYPEMOD_DEBUG) {
            console.error(
              `\n===== R6 DEBUG (${result.op}) =====\n--- source ---\n${source}\n` +
                `--- after 1st update ---\n${after}\n--- after 2nd update ---\n${settled}\n=====`
            );
          }
          record('R6', result.op, step, 'a second --update was NOT a byte-identical no-op (not a fixed point)');
          break;
        }
      }
    } catch (err) {
      // A mirror-read / fs throw mid-sequence (e.g. a vanished mirror) is a real
      // robustness failure, not a harness bug — report it, never crash the run.
      const message = err instanceof Error ? err.message : String(err);
      record('R10', log[log.length - 1] ?? '?', log.length - 1, `threw mid-sequence: ${message}`);
    }
  });

  return {seed, log, violations, skipped};
}

export interface ModFuzzReport {
  runs: number;
  skipped: number;
  sequences: number;
  maxSteps: number;
  seed: number;
  violations: ModViolation[];
  firstFailureSeed: number | null;
  // op label (first word) → how many times it ran, so a soak can PROVE which
  // operations were actually exercised instead of trusting they were.
  opCounts: Record<string, number>;
  // Sequences that failed once but did NOT reproduce on a confirm re-run — a
  // transient harness flake (a gen spawn hiccuping under the heavy sweep), not a
  // reconciler bug. Surfaced so a flaky environment is visible, never silent.
  flakes: number;
}

export interface ModFuzzOptions {
  seed: number;
  sequences: number;
  maxSteps: number;
  onViolation?: (violation: ModViolation, seqSeed: number) => void;
  continueOnFailure?: boolean;
}

export function runTypeModFuzz(options: ModFuzzOptions): ModFuzzReport {
  const {seed, sequences, maxSteps} = options;
  const violations: ModViolation[] = [];
  const opCounts: Record<string, number> = {};
  let firstFailureSeed: number | null = null;
  let runs = 0;
  let skipped = 0;
  let flakes = 0;
  for (let i = 0; i < sequences; i++) {
    const seqSeed = mixSeed(seed, 'type-mod', i);
    runs++;
    const result = runOneModSequence(seqSeed, maxSteps);
    if (result.skipped) skipped++;
    for (const label of result.log) {
      const op = label.split(' ')[0];
      opCounts[op] = (opCounts[op] ?? 0) + 1;
    }
    if (result.violations.length > 0) {
      // Confirm-on-reproduce: re-run the exact seed. gen is deterministic, so a
      // REAL reconciler bug reproduces; a transient spawn hiccup under the heavy
      // sweep does not. Only a confirmed, reproducible violation is a failure.
      const confirm = runOneModSequence(seqSeed, maxSteps);
      if (confirm.violations.length === 0) {
        flakes++;
        continue;
      }
      if (firstFailureSeed === null) firstFailureSeed = seqSeed;
      violations.push(...result.violations);
      if (options.onViolation) options.onViolation(result.violations[0], seqSeed);
      if (!options.continueOnFailure) break;
    }
  }
  return {runs, skipped, sequences, maxSteps, seed, violations, firstFailureSeed, opCounts, flakes};
}

export interface ModShrunk {
  seed: number;
  steps: number;
  log: string[];
  violations: ModViolation[];
}

// Prefix-shrink: the smallest step count that still fails. Deterministic — the
// seed replays the same generated type AND the same operation choices, so a
// prefix of length k is exactly the first k operations.
export function shrinkModFailure(seed: number, maxSteps: number): ModShrunk {
  for (let k = 1; k <= maxSteps; k++) {
    const result = runOneModSequence(seed, k);
    if (result.violations.length > 0) return {seed, steps: k, log: result.log, violations: result.violations};
  }
  const full = runOneModSequence(seed, maxSteps);
  return {seed, steps: maxSteps, log: full.log, violations: full.violations};
}

export function formatModReport(report: ModFuzzReport, shrunk: ModShrunk): string {
  const lines: string[] = [];
  lines.push(`type-modification fuzz FAILED after ${report.runs} sequence(s) (base seed 0x${report.seed.toString(16)}).`);
  lines.push('');
  lines.push(`Minimal reproducer — seed 0x${shrunk.seed.toString(16)}, ${shrunk.steps} operation(s):`);
  lines.push(`  ${shrunk.log.join('  →  ')}`);
  lines.push('');
  lines.push('Violations:');
  for (const violation of shrunk.violations) {
    lines.push(`  [${violation.rule}] ${violation.op} (step ${violation.step}): ${violation.message}`);
  }
  lines.push('');
  lines.push(`Replay: RT_FUZZ_TYPEMOD_REPLAY=0x${shrunk.seed.toString(16)}`);
  return lines.join('\n');
}
