// Type-modification fuzz of the FriendlyText/MockData reconciler. The second, wider
// application of the enrich fuzzer (see enrichFuzz.integration.test.ts): instead of
// editing a flat hardcoded `User`, it generates a RANDOM deep type (typeGen, FULL
// named space — objects, arrays, unions, Map/Set, enums, named interfaces) and drives
// random OPERATIONS on it (typeModify) — add / delete / retype / wrap / toggle-optional
// a property, add a named sub-type, and mid-edit source corruptions — reconciling
// through the real `gen --update` binary after every edit. `mion-bin/mion` must be
// built (root `pretest` does this); self-skips if absent.
//
// The default lane pins, over that full space, the reconciler's contracts (all HOLD
// since the whole-const @rtOrphan carcass handling + graph-parity rename matcher
// were made stable):
//   NL  nothing authored is ever lost — exactly the "edit again, nothing lost" property
//   RC  a ROOT rename (incl. rename + reshape) moves authored labels onto the LIVE
//       const, not into an @rtOrphan carcass
//   CB  content-blind: an empty-valued twin driven through the same edits reconciles to
//       identical structure as the filled one (filling labels can't change the result)
//   R6  a valid edit converges (a second --update is a byte-identical no-op)
//   R10 every run is controlled (no crash / internal error / hang)
//   P   a failed corruption reconcile leaves the mirror byte-identical
// A failure is a real reconciler regression, printed as a shrunk, replayable reproducer
// (and shrink-confirmed, so transient spawn flakes never fail the suite). Type-RENAME
// ops (renameRoot / renameDecl / renameRootReshaped) run in the default lane now that
// the const-level graph-parity matcher carries rename + reshape.
//
// Knobs: MION_FUZZ_SEED, MION_FUZZ_TYPEMOD_SEQUENCES, MION_FUZZ_TYPEMOD_MAXSTEPS,
//        MION_FUZZ_TYPEMOD_REPLAY=<seed>  (re-run one failing sequence verbatim),
//        MION_FUZZ_TYPEMOD_REPORT=1       (print run / skip / flake / op-coverage stats).

import {existsSync} from 'node:fs';
import {describe, it, expect, afterAll} from 'vitest';
import {cleanupReconcileLane} from '../../util/enrichReconcile.ts';
import {BIN} from './enrichCli.ts';
import {runTypeModFuzz, runOneModSequence, shrinkModFailure, formatModReport} from './typeModFuzzRunner.ts';
import {entrySeed, parseSeed, FLAKE_CEILING} from '../core/fuzzPolicy.ts';

afterAll(cleanupReconcileLane);

const HAS_BIN = existsSync(BIN);
const SEED = entrySeed('typemod');
// Sequences that failed but did not reproduce on shrink (see the ceiling below).
let flakes = 0;
const SEQUENCES = Number(process.env.MION_FUZZ_TYPEMOD_SEQUENCES ?? 6);
const MAX_STEPS = Number(process.env.MION_FUZZ_TYPEMOD_MAXSTEPS ?? 8);
const REPLAY = process.env.MION_FUZZ_TYPEMOD_REPLAY ? parseSeed(process.env.MION_FUZZ_TYPEMOD_REPLAY, 0) : null;

describe('enrichment type-modification fuzz', () => {
  it.skipIf(!HAS_BIN)(
    'never loses authored content under random type operations',
    () => {
      if (REPLAY !== null) {
        const replayed = runOneModSequence(REPLAY, MAX_STEPS);
        if (replayed.violations.length > 0) {
          const report = {
            runs: 1,
            skipped: 0,
            sequences: 1,
            maxSteps: MAX_STEPS,
            seed: REPLAY,
            violations: replayed.violations,
            firstFailureSeed: REPLAY,
            opCounts: {},
            flakes: 0,
          };
          expect.fail(formatModReport(report, shrinkModFailure(REPLAY, MAX_STEPS)));
        }
        return;
      }

      const report = runTypeModFuzz({seed: SEED, sequences: SEQUENCES, maxSteps: MAX_STEPS});
      if (process.env.MION_FUZZ_TYPEMOD_REPORT) {
        const ops = Object.entries(report.opCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([op, n]) => `${op}=${n}`)
          .join(' ');
        console.error(
          `[typemod] runs=${report.runs} skipped=${report.skipped} flakes=${report.flakes} violations=${report.violations.length}\n[typemod] ops: ${ops}`
        );
      }
      if (report.violations.length > 0) {
        // The shrinker is authoritative: it re-runs the failing seed from k=1. A real
        // bug reproduces there; a transient spawn flake that slipped past the runner's
        // confirm re-run does not. Only fail on a shrink-confirmed violation.
        const shrunk = shrinkModFailure(report.firstFailureSeed!, MAX_STEPS);
        if (shrunk.violations.length > 0) {
          expect.fail(formatModReport(report, shrunk));
        } else {
          console.error(
            `[typemod] a violation at seed 0x${report.firstFailureSeed!.toString(16)} did not reproduce on shrink — treated as a flake`
          );
          flakes++;
        }
      }
      // Guard against a silently-degenerate run: if EVERY sequence skipped (no
      // usable scaffold), the fuzzer asserted nothing — fail loudly so a broken
      // generator can't masquerade as green.
      expect(report.skipped).toBeLessThan(report.runs);
      // The flake filter above is deliberate, but it is also the one way a
      // genuinely NONDETERMINISTIC reconciler bug stays unreportable: it never
      // reproduces on shrink, so it is written off every time. Fail once the
      // rate stops looking like spawn noise.
      expect(
        flakes,
        `${flakes}/${report.runs} sequences failed but did not reproduce on shrink — a nondeterministic reconciler bug looks exactly like this`
      ).toBeLessThanOrEqual(Math.floor(report.runs * FLAKE_CEILING));
    },
    // Scales with the sequence knob (soak runs; ~7s/sequence observed) — a
    // fixed timeout flags a finished sync body and discards its verdict.
    180_000 + SEQUENCES * 15_000
  );
});
