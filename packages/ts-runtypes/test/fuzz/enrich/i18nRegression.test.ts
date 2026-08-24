// Deterministic pins of i18n fuzz findings — each replays one shrunk sequence
// verbatim (same seed, same command budget) and expects a clean run, so the
// bug it found stays fixed without needing the soak.
//
// Finding 1 (docs/done/i18n-sync-authored-leaf-lost-on-prune-update.md):
// a field dropped from the source, authored in T meanwhile, then RE-ADDED with
// a different type id (its format params changed) made updateT carcass the
// whole field subtree and re-scaffold it blank — the authored leaf bravo.type
// was lost (T3). Fixed in the mirror merge: a friendly-family field whose
// child id changed but whose structural template did not now merges in place.
import {existsSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {BIN} from './enrichCli.ts';
import {runOneI18nSequence} from './i18nFuzzRunner.ts';

describe('i18n sync fuzz regressions', () => {
  it.skipIf(!existsSync(BIN))(
    'seed 0x26e88c65: authored leaf survives drop, re-add with new type id, double prune, update',
    () => {
      const result = runOneI18nSequence(0x26e88c65, 12);
      expect(result.violations).toEqual([]);
    }
  );
});
