// The grouped log against the corpus the Go twin (internal/diagnostics/grouped.go) is pinned to.

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {entryOf, formatGrouped} from '../src/core/groupedLog.ts';
import {Family, Level, Severity} from '../src/core/protocol.ts';
import type {GroupedEntry} from '../src/core/types.ts';

const CORPUS = path.resolve(import.meta.dirname, '../../../ts-go-runtypes/internal/diagnostics/testdata/grouped/cases.json');
const cases = JSON.parse(readFileSync(CORPUS, 'utf8')) as {
  name: string;
  cwd?: string;
  entries: GroupedEntry[] | null;
  want: string;
}[];

describe('formatGrouped', () => {
  it('reads a non-empty corpus', () => expect(cases.length).toBeGreaterThan(5));
  for (const testCase of cases) {
    it(`prints the same bytes as Go: ${testCase.name}`, () => {
      expect(formatGrouped(testCase.entries ?? [], testCase.cwd)).toBe(testCase.want);
    });
  }

  it('reads the slots from the catalog and prints a downgraded finding as a warning', () => {
    const diagnostic = {
      code: 'validate-symbol-root',
      family: Family.RunType,
      severity: Severity.Error,
      level: Level.RuntimeError,
      args: ['Symbol'],
      site: {filePath: 'a.ts', startLine: 3, startCol: 1},
    };
    expect(entryOf(diagnostic, false)).toMatchObject({
      severity: Severity.Error,
      slots: ['type'],
      template: expect.stringContaining('{type}'),
    });
    expect(entryOf(diagnostic, true)).toMatchObject({severity: Severity.Warning, downgraded: true});
    expect(entryOf({...diagnostic, code: 'no-such-code'}, false).template).toMatch(/^Unrecognised diagnostic code/);
  });
});
