// Event-driven fuzz of the FriendlyText/MockData sync pipeline — the first real
// application of the fuzzy-testing framework
// (.claude/skills/fuzzy-testing/framework-fuzzy-testing.md §6).
//
// It generalises the hand-written enrichReconcile.test.ts cases to RANDOM edit
// sequences: every oracle (R1/R2/R3/R5/R6/R7a/R8/R10) asserts a behaviour that
// suite already proves, so a failure here is a real regression. Spawns the Go
// binary like the other enrich e2e tests, so `bin/mion` must be built
// (the root `pretest` does this); the test self-skips if the binary is absent.
//
// Knobs:  RT_FUZZ_SEED, RT_FUZZ_ENRICH_SEQUENCES, RT_FUZZ_ENRICH_MAXCMDS,
//         RT_FUZZ_ENRICH_REPLAY=<seed>  (re-run one failing sequence verbatim).

import {existsSync} from 'node:fs';
import {describe, it, expect, afterAll} from 'vitest';
import {cleanupReconcileLane} from '../../util/enrichReconcile.ts';
import {BIN} from './enrichCli.ts';
import {runEnrichFuzz, runOneSequence, shrinkFailure, formatReport} from './enrichFuzzRunner.ts';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';

afterAll(cleanupReconcileLane);

const HAS_BIN = existsSync(BIN);
const SEED = entrySeed('enrich');
const SEQUENCES = Number(process.env.RT_FUZZ_ENRICH_SEQUENCES ?? 6);
const MAX_COMMANDS = Number(process.env.RT_FUZZ_ENRICH_MAXCMDS ?? 8);
const REPLAY = process.env.RT_FUZZ_ENRICH_REPLAY ? parseSeed(process.env.RT_FUZZ_ENRICH_REPLAY, 0) : null;

describe('enrichment sync fuzz', () => {
  it.skipIf(!HAS_BIN)(
    'keeps (type, mirror) consistent under random edit sequences',
    () => {
      if (REPLAY !== null) {
        const replayed = runOneSequence(REPLAY, MAX_COMMANDS);
        if (replayed.violations.length > 0) {
          const report = {
            runs: 1,
            sequences: 1,
            maxCommands: MAX_COMMANDS,
            seed: REPLAY,
            violations: replayed.violations,
            firstFailureSeed: REPLAY,
          };
          expect.fail(formatReport(report, shrinkFailure(REPLAY, MAX_COMMANDS)));
        }
        return;
      }

      const report = runEnrichFuzz({seed: SEED, sequences: SEQUENCES, maxCommands: MAX_COMMANDS});
      if (report.violations.length > 0) {
        const shrunk = shrinkFailure(report.firstFailureSeed!, MAX_COMMANDS);
        expect.fail(formatReport(report, shrunk));
      }
      expect(report.runs).toBe(SEQUENCES);
    },
    // Scales with the sequence knob: a soak-sized run (e.g. 400 sequences /
    // ~3.3s each observed) must not be flagged by a fixed batch timeout —
    // sync bodies cannot be preempted, so the flag lands AFTER the work and
    // discards the verdict.
    120_000 + SEQUENCES * 8_000
  );
});
