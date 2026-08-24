// Harness for the per-branch `DataOnly<T>` instantiation-budget test
// (dataonly.compile.test.ts). Builds the PREAMBLE — the REAL `DataOnly`
// machinery sliced VERBATIM out of src/runtypes/dataOnly.ts between the
// `#region dataonly-extract` markers (so the harness can never drift from the
// shipped type) + a local Temporal ambient/augmentation + assertion helpers —
// and binds it to the shared compiler measurer in compileHarness.ts.
//
// Temporal is mirrored locally (ambient stub + the `DataOnlyNativeExtra`
// augmentation) so the keep-Temporal branch is exercised without pulling the
// package's module graph (which would swamp the instantiation count).

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, SENTINEL_KEYS_PREAMBLE, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

const DATAONLY_TS = fileURLToPath(new URL('../../src/runtypes/dataOnly.ts', import.meta.url));

/** Slice the `DataOnly` machinery out of dataOnly.ts between the region markers
 *  and drop the `export` modifiers so it can live in a non-module snippet. **/
function extractDataOnlyRegion(): string {
  const source = readFileSync(DATAONLY_TS, 'utf8');
  const start = source.indexOf('// #region dataonly-extract');
  const end = source.indexOf('// #endregion dataonly-extract');
  if (start === -1 || end === -1) {
    throw new Error('dataonly-extract region markers not found in src/runtypes/dataOnly.ts');
  }
  return source.slice(start, end).replace(/^export (type|interface) /gm, '$1 ');
}

// Minimal ambient `Temporal` surface (mirrors test/support/temporal-ambient.d.ts) +
// the keep-Temporal augmentation of `DataOnlyNativeExtra`, so the harness
// exercises the same keep-branch the shipped formats/temporal subpath wires up.
const TEMPORAL_PREAMBLE = `
declare namespace Temporal {
  interface Instant { readonly epochMilliseconds: number; toJSON(): string; equals(o: Instant): boolean; }
  interface ZonedDateTime { readonly epochMilliseconds: number; toJSON(): string; }
  interface PlainDate { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; }
  interface PlainTime { readonly hour: number; readonly minute: number; toJSON(): string; }
  interface PlainDateTime { readonly year: number; readonly hour: number; toJSON(): string; }
  interface PlainYearMonth { readonly year: number; readonly month: number; toJSON(): string; }
  interface PlainMonthDay { readonly monthCode: string; readonly day: number; toJSON(): string; }
  interface Duration { readonly years: number; readonly days: number; toJSON(): string; }
}
interface DataOnlyNativeExtra {
  temporalInstant: Temporal.Instant;
  temporalZonedDateTime: Temporal.ZonedDateTime;
  temporalPlainDate: Temporal.PlainDate;
  temporalPlainTime: Temporal.PlainTime;
  temporalPlainDateTime: Temporal.PlainDateTime;
  temporalPlainYearMonth: Temporal.PlainYearMonth;
  temporalPlainMonthDay: Temporal.PlainMonthDay;
  temporalDuration: Temporal.Duration;
}
`;

// Type-level assertion helpers used by the snippets.
const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const PREAMBLE = `${SENTINEL_KEYS_PREAMBLE}\n${TEMPORAL_PREAMBLE}\n${extractDataOnlyRegion()}\n${ASSERT_PREAMBLE}\n`;

/** Compile `PREAMBLE + snippet` and report errors + raw/net instantiation counts. **/
export const measureDataOnly = makeMeasurer(PREAMBLE);
