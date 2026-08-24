// Harness for the per-branch `FriendlyText<T>` / `MockData<T>` instantiation-budget
// tests (friendlyText.compile.test.ts / mockData.compile.test.ts). Builds the
// PREAMBLE by slicing the REAL machinery VERBATIM out of
// src/enrich/{friendlyText,mockData}.ts between the `#region …-extract`
// markers (so the harness can never drift from the shipped types) + the
// type-level assertion helpers, and binds each to the shared compiler measurer
// in compileHarness.ts. Each region is self-contained (lib + own decls), so no
// package module graph is pulled in (which would swamp the instantiation count).

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, SENTINEL_KEYS_PREAMBLE, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

const FRIENDLY_TS = fileURLToPath(new URL('../../src/enrich/friendlyText.ts', import.meta.url));
const MOCK_TS = fileURLToPath(new URL('../../src/enrich/mockData.ts', import.meta.url));

/** Slice a `#region <name> … #endregion <name>` block out of a source file and
 *  drop `export` modifiers so it can live in a non-module snippet. **/
function extractRegion(file: string, name: string): string {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`// #region ${name}`);
  const end = source.indexOf(`// #endregion ${name}`);
  if (start === -1 || end === -1) {
    throw new Error(`region ${name} markers not found in ${file}`);
  }
  return source.slice(start, end).replace(/^export (type|interface) /gm, '$1 ');
}

// Type-level assertion helpers used by the snippets.
const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const FRIENDLY_PREAMBLE = `${SENTINEL_KEYS_PREAMBLE}\n${extractRegion(FRIENDLY_TS, 'friendlytext-extract')}\n${ASSERT_PREAMBLE}\n`;
const MOCK_PREAMBLE = `${SENTINEL_KEYS_PREAMBLE}\n${extractRegion(MOCK_TS, 'mockdata-extract')}\n${ASSERT_PREAMBLE}\n`;

/** Compile `FRIENDLY_PREAMBLE + snippet`; report errors + raw/net instantiations. **/
export const measureFriendly = makeMeasurer(FRIENDLY_PREAMBLE);
/** Compile `MOCK_PREAMBLE + snippet`; report errors + raw/net instantiations. **/
export const measureMock = makeMeasurer(MOCK_PREAMBLE);
