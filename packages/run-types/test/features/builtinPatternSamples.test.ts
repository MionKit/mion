/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The patterns used to check their own mockSamples at load, through a side-effect import in
// formats/index.ts; that import shipped the whole pattern table to every browser, so the check lives here.

import {describe, expect, it} from 'vitest';
import * as patterns from '../../src/formats/string/string-patterns.ts';

type Pattern = {source: string; flags?: string; mockSamples?: readonly string[]; message?: string};

const entries = Object.entries(patterns as Record<string, Pattern>).filter(([name]) => name.endsWith('_PATTERN'));

describe('built-in string patterns', () => {
  it('exports a pattern table for the format types to reference', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.each(entries)('%s accepts every mockSample it declares', (name, pattern) => {
    // g/y make .test advance lastIndex, so drop them, exactly as registerFormatPattern does.
    const tester = new RegExp(pattern.source, (pattern.flags ?? '').replace(/[gy]/g, ''));
    for (const sample of pattern.mockSamples ?? []) {
      expect(tester.test(sample), `${name}: ${JSON.stringify(sample)} does not match /${pattern.source}/`).toBe(true);
    }
  });
});
