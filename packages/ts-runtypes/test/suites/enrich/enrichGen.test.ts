// Entry 1 of the AI-enrichment generation suite: for every case, EXTRACT the
// authored `src` type, GENERATE the FriendlyText / MockData skeleton via the
// batch `gen --files` CLI, and COMPARE (Prettier-normalized) against the
// case-authored `friendly` / `mock` expecteds.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {generateCategory, cleanupTempDir, type CaseComparison} from '../../util/enrichGen.ts';
import {ENRICH_CASES, ENRICH_CATEGORIES} from './cases/index.ts';
import type {EnrichCase} from './cases/types.ts';

afterAll(() => cleanupTempDir('gen'));

for (const {constName, fileBase} of ENRICH_CATEGORIES) {
  const cases = ENRICH_CASES[constName as keyof typeof ENRICH_CASES] as Record<string, EnrichCase>;

  describe(`enrichment gen — ${constName}`, () => {
    let comparisons: Record<string, CaseComparison>;

    beforeAll(async () => {
      comparisons = await generateCategory(fileBase, constName);
    });

    it('produced output for every case (no missing key)', () => {
      expect(Object.keys(comparisons).sort()).toEqual(Object.keys(cases).sort());
    });

    for (const [caseKey, theCase] of Object.entries(cases)) {
      it(`${theCase.title} — friendly`, () => {
        const comparison = comparisons[caseKey];
        expect(comparison, `no comparison for case '${caseKey}'`).toBeDefined();
        expect(comparison.genFriendly).toBe(comparison.expectedFriendly);
      });

      it(`${theCase.title} — mock`, () => {
        const comparison = comparisons[caseKey];
        expect(comparison, `no comparison for case '${caseKey}'`).toBeDefined();
        expect(comparison.genMock).toBe(comparison.expectedMock);
      });
    }
  });
}
