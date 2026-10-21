// Event-driven fuzz of the FriendlyText i18n translate pipeline — random
// translator edits (author / prune arms / clear @todo) interleaved with SOURCE
// TYPE edits (add / drop fields, format params carrying the constraint set),
// reconciled by the real binary's src-derived driver, with the
// value-preserving oracles (T1 idempotence, T2 never-copy-mirror-text, T3
// authored-leaf preservation, T4 orphan-keeps-value, T5 locale-owned arms, T6
// kind stability, T7 @todo/prune discipline, T10 totality) asserted after
// every reconcile. Every oracle mirrors a case enrichTranslate.test.ts /
// translate_test.go proves on hand-written inputs, so a failure here is a real
// regression. Spawns mion-bin/mion; self-skips when the binary is absent.
//
// Knobs:  MION_FUZZ_SEED, MION_FUZZ_I18N_SEQUENCES, MION_FUZZ_I18N_MAXCMDS,
//         MION_FUZZ_I18N_REPLAY=<seed>  (re-run one failing sequence verbatim).

import {existsSync} from 'node:fs';
import {describe, it, expect, afterAll} from 'vitest';
import {cleanupReconcileLane} from '../../util/enrichReconcile.ts';
import {BIN} from './enrichCli.ts';
import {runI18nFuzz, runOneI18nSequence, shrinkI18nFailure, formatI18nReport} from './i18nFuzzRunner.ts';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';

afterAll(cleanupReconcileLane);

const HAS_BIN = existsSync(BIN);
const SEED = entrySeed('i18n');
const SEQUENCES = Number(process.env.MION_FUZZ_I18N_SEQUENCES ?? 6);
const MAX_COMMANDS = Number(process.env.MION_FUZZ_I18N_MAXCMDS ?? 10);
const REPLAY = process.env.MION_FUZZ_I18N_REPLAY ? parseSeed(process.env.MION_FUZZ_I18N_REPLAY, 0) : null;

describe('FriendlyText i18n sync fuzz', () => {
  it.skipIf(!HAS_BIN)(
    'keeps (source type, translation) consistent under random edit sequences',
    () => {
      if (REPLAY !== null) {
        const replayed = runOneI18nSequence(REPLAY, MAX_COMMANDS);
        if (replayed.violations.length > 0) {
          const report = {
            runs: 1,
            sequences: 1,
            maxCommands: MAX_COMMANDS,
            seed: REPLAY,
            violations: replayed.violations,
            firstFailureSeed: REPLAY,
          };
          expect.fail(formatI18nReport(report, shrinkI18nFailure(REPLAY, MAX_COMMANDS)));
        }
        return;
      }

      const report = runI18nFuzz({seed: SEED, sequences: SEQUENCES, maxCommands: MAX_COMMANDS});
      if (report.violations.length > 0) {
        const shrunk = shrinkI18nFailure(report.firstFailureSeed!, MAX_COMMANDS);
        expect.fail(formatI18nReport(report, shrunk));
      }
      expect(report.runs).toBe(SEQUENCES);
    },
    // Scales with the sequence knob — see enrichFuzz/typeModFuzz (same
    // sync-body timeout-flag hazard on soak-sized runs).
    180_000 + SEQUENCES * 8_000
  );
});
