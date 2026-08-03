// Single source of truth for the shared cases: the `CaseKey` union (drives
// per-competitor totality) + `iterateCases()` (drives the runner).
//
// The suites are the marker-free slim copies that live alongside this file —
// they carry samples + metadata only, with ZERO `ts-runtypes`
// imports, so a competitor importing `shared/cases` never transitively pulls
// the marker package.

import {VALIDATION_SUITE} from './validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from './format-validation/index.ts';
import {REALWORLD} from './realworld/index.ts';
import type {SharedCase} from './types.ts';

// The JSON Schema cases are NOT a suite of their own: each half lives in the
// suite that benches it, as the group `JSON_SCHEMA` (the same way DATETIME is a
// group in both validation and format-validation). ./json-schema/index.ts keeps
// the merged document map for ajv and the typecost document columns.
export type SuiteName = 'validation' | 'format-validation' | 'realworld';

// `${GROUP}.${case}` over every group in a suite object (`{ATOMIC: {...}, ...}`).
type GroupKeys<S> = {[G in keyof S]: `${G & string}.${keyof S[G] & string}`}[keyof S];

export type CaseKey =
  | GroupKeys<typeof VALIDATION_SUITE>
  | GroupKeys<typeof FORMAT_VALIDATION_SUITE>
  | `REALWORLD.${keyof typeof REALWORLD & string}`;

export interface IteratedCase {
  key: CaseKey;
  suite: SuiteName;
  group: string;
  name: string;
  case: SharedCase;
}

type Groups = Record<string, Record<string, SharedCase>>;

function collect(suite: SuiteName, groups: Groups, out: IteratedCase[]): void {
  for (const [group, cases] of Object.entries(groups)) {
    for (const [name, sharedCase] of Object.entries(cases)) {
      out.push({key: `${group}.${name}` as CaseKey, suite, group, name, case: sharedCase});
    }
  }
}

const ALL: IteratedCase[] = [];
collect('validation', VALIDATION_SUITE as unknown as Groups, ALL);
collect('format-validation', FORMAT_VALIDATION_SUITE as unknown as Groups, ALL);
collect('realworld', {REALWORLD} as unknown as Groups, ALL);

export function iterateCases(): readonly IteratedCase[] {
  return ALL;
}
