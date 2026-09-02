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
import {fieldLine} from './i18nModel.ts';

// Finding 2 (seed 0xd242d897, the release-gate soak): a field dropped from the
// source, parked by --update in an @rtOrphan carcass, then re-added under the
// SAME name left the parked copy and the live line both starting with
// `delta: {`, and the harness's own line lookup threw on the ambiguity. The
// lookup now skips carcass lines; two LIVE lines still fail loudly.
describe('i18n fuzz harness field lookup', () => {
  const translation = [
    'export const User_es = {',
    "  rt$label: 'Usuario',",
    '  /* @rtOrphan dropped 2026-09-02',
    "  delta: {rt$label: 'FZT_1', type: 'FZT_2'},",
    '   */',
    "  alpha: {rt$label: '', type: ''},",
    "  delta: {rt$label: '', type: ''},",
    '};',
  ].join('\n');

  it('resolves a re-added field to its live line, not the parked carcass copy', () => {
    expect(fieldLine(translation, 'delta').index).toBe(6);
    expect(fieldLine(translation, 'alpha').index).toBe(5);
  });

  it('still refuses two live declarations of the same field', () => {
    const doubled = `${translation}\n  delta: {rt$label: '', type: ''},`;
    expect(() => fieldLine(doubled, 'delta')).toThrow(/matched 2 live lines/);
  });
});

describe('i18n sync fuzz regressions', () => {
  it.skipIf(!existsSync(BIN))(
    'seed 0x26e88c65: authored leaf survives drop, re-add with new type id, double prune, update',
    () => {
      const result = runOneI18nSequence(0x26e88c65, 12);
      expect(result.violations).toEqual([]);
    }
  );
});
