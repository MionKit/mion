// Entry 2 of the AI-enrichment generation suite: synthesize a `.rt.ts` per case
// from the authored `src` + `friendly` + `mock` spans, run `ts-runtypes check`,
// and assert ZERO findings. These maps are valid + tsc-checked, so `check` must
// not false-positive across the type ranges. (The "check catches real errors"
// direction stays on the Go unit tests with deliberately-broken maps.) See
// docs/AI_ENRICHMENT_TEST_PLAN.md.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {checkCategory, cleanupTempDir, type CaseCheck} from '../../util/enrichGen.ts';
import {ENRICH_CASES, ENRICH_CATEGORIES} from './cases/index.ts';
import type {EnrichCase} from './cases/types.ts';

afterAll(() => cleanupTempDir('check'));

// Completeness codes — an unfilled @todo (FT020/MD020) or a blank scaffold value
// (FT023/MD023). This suite's spans use blank placeholders, so these are expected;
// they are gated by `--require-complete`, orthogonal to the content checks here.
const COMPLETENESS_CODES = new Set(['FT020', 'MD020', 'FT023', 'MD023']);

for (const {constName, fileBase} of ENRICH_CATEGORIES) {
  const cases = ENRICH_CASES[constName as keyof typeof ENRICH_CASES] as Record<string, EnrichCase>;

  describe(`enrichment check — ${constName}`, () => {
    let checks: Record<string, CaseCheck>;

    beforeAll(() => {
      checks = checkCategory(fileBase, constName);
    });

    it('checked every case (no missing key)', () => {
      expect(Object.keys(checks).sort()).toEqual(Object.keys(cases).sort());
    });

    for (const [caseKey, theCase] of Object.entries(cases)) {
      it(`${theCase.title} — check reports zero content findings`, () => {
        const check = checks[caseKey];
        expect(check, `no check result for case '${caseKey}'`).toBeDefined();
        // These authored spans use `''` / `[]` placeholders for the value slots —
        // the suite checks CONTENT validity across the type ranges, not
        // completeness — so drop the completeness findings (unfilled @todo / blank
        // value) the `--require-complete` gate raises. Only a content/drift
        // false-positive should ever surface here.
        const content = check.findings.filter((finding) => !COMPLETENESS_CODES.has(finding.code));
        expect(content, JSON.stringify(content)).toEqual([]);
      });
    }
  });
}
