// THE driver for the official JSON-Schema-Test-Suite lane. Deliberately a
// single test file: every generated group runs in this one worker, so the
// results aggregate into one results.json for the report script.
//
// Per-group `it`s are SOFT — they record verdicts without asserting them — and
// the trailing reconciliation block is the hard gate: every divergence or
// build rejection must be in known-divergences.json, and every ledger entry
// must still reproduce. Regressions and silent improvements both turn the lane
// red. afterAll writes results.json even on a red run, so
// `node scripts/core/gen-json-schema-suite.mjs report --update-ledger` can
// reconcile from a failing first pass.

import {afterAll, describe, expect, it} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {allModules} from './generated/index.ts';
import {
  ledgerKey,
  observedDivergenceKeys,
  runGroup,
  type GroupResult,
  type LedgerEntry,
  type OfficialGroup,
  type SkippedGroup,
} from './harness.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const readJson = (name: string) => JSON.parse(readFileSync(`${HERE}${name}`, 'utf8'));

const triage = readJson('triage.json') as {suiteCommit: string};
const ledger = readJson('known-divergences.json') as {entries: LedgerEntry[]};

const groupResults: GroupResult[] = [];
const skipped: SkippedGroup[] = [];

afterAll(() => {
  const results = {
    suiteCommit: triage.suiteCommit,
    groups: groupResults.map((g) => (g.outcome === 'ok' ? g : {...g})),
    skipped: skipped.map(({file, group, verdict, reason, caseCount}) => ({file, group, verdict, reason, caseCount})),
  };
  writeFileSync(`${HERE}results.json`, `${JSON.stringify(results, null, 2)}\n`);
});

for (const mod of allModules) {
  const official = mod.groups.filter((g): g is OfficialGroup => g.kind === 'official');
  for (const g of mod.groups) if (g.kind === 'skipped') skipped.push(g);
  // A module whose every group is skipped (e.g. vocabulary.json, fully
  // remote-dependent) gets no describe — an empty suite is a vitest error.
  if (official.length === 0) continue;
  describe(mod.file, () => {
    for (const g of official) {
      it(g.group, () => {
        groupResults.push(runGroup(g));
      });
    }
  });
}

describe('ledger reconciliation', () => {
  it('every divergence and build rejection is in known-divergences.json', () => {
    const ledgered = new Set(ledger.entries.map(ledgerKey));
    const unledgered = observedDivergenceKeys(groupResults).filter((k) => !ledgered.has(k));
    expect(
      unledgered,
      'new divergences — reconcile with: node scripts/core/gen-json-schema-suite.mjs report --update-ledger'
    ).toEqual([]);
  });

  it('every known-divergences.json entry still reproduces', () => {
    const observed = new Set(observedDivergenceKeys(groupResults));
    const stale = ledger.entries.map(ledgerKey).filter((k) => !observed.has(k));
    expect(
      stale,
      'stale ledger entries (now conforming?) — reconcile with: node scripts/core/gen-json-schema-suite.mjs report --update-ledger'
    ).toEqual([]);
  });
});
