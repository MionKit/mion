// Harness for the official JSON-Schema-Test-Suite lane: the group shapes the
// GENERATED modules under generated/ push into (see
// scripts/core/gen-json-schema-suite.mjs), the per-group runner, and the
// ledger/result bookkeeping official.test.ts drives.
//
// Verdict taxonomy (a group carries exactly one):
//   ok                → a real call site was generated; runGroup produces
//                       per-case verdicts (or build-rejected at runtime).
//   remote            → the schema needs the suite's localhost:1234 server.
//   proto-literal     → a __proto__ key cannot be emitted as an object literal.
//   unsupported-input → the door's ExactJsonSchema contract rejects the
//                       document at the type level (triage probe).
//   transform-halt    → hand-quarantined (quarantine.json): the group kills a
//                       whole module's transform instead of failing its entry.
//   build-rejected    → runtime-only outcome, never pre-classified: the
//                       resolver marked the entry Error, so building or calling
//                       the validator throws (failOnError: false keeps the lane
//                       booting; the throw is the diagnostic surface).

export interface SuiteCase {
  description: string;
  data: unknown;
  valid: boolean;
}

export interface OfficialGroup {
  kind: 'official';
  file: string;
  group: string;
  schema: unknown;
  build: () => (value: unknown) => boolean;
  tests: SuiteCase[];
}

export interface SkippedGroup {
  kind: 'skipped';
  file: string;
  group: string;
  verdict: string;
  reason: string;
  caseCount: number;
}

export type SuiteGroup = OfficialGroup | SkippedGroup;

export function officialGroup(
  file: string,
  group: string,
  schema: unknown,
  build: () => (value: unknown) => boolean,
  tests: SuiteCase[]
): SuiteGroup {
  return {kind: 'official', file, group, schema, build, tests};
}

export function skippedGroup(file: string, group: string, verdict: string, reason: string, caseCount: number): SuiteGroup {
  return {kind: 'skipped', file, group, verdict, reason, caseCount};
}

/** observed is a boolean verdict, or 'threw: …' when the validator threw on
 *  this value (either way a string observed never equals a boolean expected,
 *  so a throw always reads as a divergence unless ledgered). **/
export interface CaseResult {
  description: string;
  expected: boolean;
  observed: boolean | string;
}

export type GroupResult =
  | {file: string; group: string; outcome: 'ok'; cases: CaseResult[]}
  | {file: string; group: string; outcome: 'build-rejected'; reason: string; caseCount: number};

const trimError = (err: unknown) =>
  String(err instanceof Error ? err.message : err)
    .replace(/\s+/g, ' ')
    .slice(0, 200);

/** Build the group's validator and run every case. A throw while BUILDING is
 *  build-rejected outright; per-case throws are recorded per case, and a group
 *  whose every case threw identically collapses to build-rejected (that is the
 *  alwaysThrow shape of an Error-severity entry — one diagnostic, not N). **/
export function runGroup(g: OfficialGroup): GroupResult {
  let validate: (value: unknown) => boolean;
  try {
    validate = g.build();
  } catch (err) {
    return {file: g.file, group: g.group, outcome: 'build-rejected', reason: trimError(err), caseCount: g.tests.length};
  }
  const cases: CaseResult[] = g.tests.map((t) => {
    try {
      return {description: t.description, expected: t.valid, observed: validate(t.data) === true};
    } catch (err) {
      return {description: t.description, expected: t.valid, observed: `threw: ${trimError(err)}`};
    }
  });
  const firstThrow = typeof cases[0]?.observed === 'string' ? cases[0].observed : undefined;
  if (firstThrow !== undefined && cases.every((c) => c.observed === firstThrow)) {
    return {
      file: g.file,
      group: g.group,
      outcome: 'build-rejected',
      reason: firstThrow.replace(/^threw: /, ''),
      caseCount: g.tests.length,
    };
  }
  return {file: g.file, group: g.group, outcome: 'ok', cases};
}

// ── ledger reconciliation (the two-way pin) ──────────────────────────────────

export interface LedgerEntry {
  file: string;
  group: string;
  case: string;
  expected: unknown;
  observed: unknown;
  byDesign: boolean;
  note: string;
}

export const ledgerKey = (e: {file: string; group: string; case: string}) => `${e.file} :: ${e.group} :: ${e.case}`;

/** Every divergence the run produced, keyed like the ledger: one entry per
 *  mismatching case, one '*' entry per build-rejected group. Mirrors
 *  divergencesFromResults in scripts/core/gen-json-schema-suite.mjs. **/
export function observedDivergenceKeys(groups: GroupResult[]): string[] {
  const keys: string[] = [];
  for (const g of groups) {
    if (g.outcome === 'build-rejected') {
      keys.push(ledgerKey({file: g.file, group: g.group, case: '*'}));
      continue;
    }
    for (const c of g.cases) {
      if (c.observed !== c.expected) keys.push(ledgerKey({file: g.file, group: g.group, case: c.description}));
    }
  }
  return keys.sort();
}
