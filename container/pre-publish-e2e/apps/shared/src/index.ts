// The shared feature library: every RunTypes feature family, exercised against
// the PUBLISHED @ts-runtypes/* packages. Consumed as SOURCE by every bundler app
// so that bundler's RunTypes plugin transforms these marker calls during its own
// build. `selfCheck()` runs every family and returns a flat pass/fail report the
// build-output tests assert over.
export type {CheckResult} from './check';
import type {CheckResult} from './check';

export * from './validation';
export * from './type-builders';
export * from './json-schema';
export * from './reflection';
export * from './json';
export * from './binary';
export * from './serialization-edge';
export * from './unknown-keys';
export * from './formats';
export * from './markers';
export * from './mocking';
export * from './standard-schema';
export * from './overrides';
export {friendly, friendlyEs, mockUser} from './enrichment';

import {checkValidation} from './validation';
import {checkTypeBuilders} from './type-builders';
import {checkJsonSchema} from './json-schema';
import {checkReflection} from './reflection';
import {checkJson} from './json';
import {checkBinary} from './binary';
import {checkSerializationEdge} from './serialization-edge';
import {checkUnknownKeys} from './unknown-keys';
import {checkFormats} from './formats';
import {checkMarkers} from './markers';
import {checkMocking} from './mocking';
import {checkStandardSchema} from './standard-schema';
import {checkOverrides} from './overrides';
import {checkEnrichment} from './enrichment';

// The 14 feature families (enrichment is family 11). Order mirrors the spec table.
const FAMILIES: {family: string; run: () => CheckResult[]}[] = [
  {family: 'validation', run: checkValidation},
  {family: 'type-builders', run: checkTypeBuilders},
  {family: 'json-schema', run: checkJsonSchema},
  {family: 'reflection', run: checkReflection},
  {family: 'json', run: checkJson},
  {family: 'binary', run: checkBinary},
  {family: 'serialization-edge', run: checkSerializationEdge},
  {family: 'unknown-keys', run: checkUnknownKeys},
  {family: 'formats', run: checkFormats},
  {family: 'markers', run: checkMarkers},
  {family: 'mocking', run: checkMocking},
  {family: 'standard-schema', run: checkStandardSchema},
  {family: 'overrides', run: checkOverrides},
  {family: 'enrichment', run: checkEnrichment},
];

export interface SelfCheckReport {
  ok: boolean;
  families: number;
  total: number;
  passed: number;
  failures: {family: string; name: string; detail?: string}[];
  results: {family: string; name: string; ok: boolean; detail?: string}[];
}

// selfCheck runs every family and aggregates. Never throws — a family that
// throws is recorded as a failure so a single broken feature can't mask the rest.
export function selfCheck(): SelfCheckReport {
  const results: SelfCheckReport['results'] = [];
  for (const {family, run} of FAMILIES) {
    try {
      for (const result of run()) results.push({family, name: result.name, ok: result.ok, detail: result.detail});
    } catch (error) {
      results.push({family, name: `${family}: threw`, ok: false, detail: String(error)});
    }
  }
  const failures = results.filter((result) => !result.ok).map(({family, name, detail}) => ({family, name, detail}));
  return {
    ok: failures.length === 0,
    families: FAMILIES.length,
    total: results.length,
    passed: results.length - failures.length,
    failures,
    results,
  };
}
