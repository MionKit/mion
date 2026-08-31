// Harness for the per-branch `StripRunTypeMeta<T>` instantiation-budget test
// (stripmeta.compile.test.ts). Builds the PREAMBLE — the REAL machinery sliced
// VERBATIM out of src/runtypes/stripRunTypeMeta.ts between the
// `#region stripmeta-extract` markers (so the harness can never drift from the
// shipped type) + assertion helpers — and binds it to the shared compiler
// measurer in compileHarness.ts.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, SENTINEL_KEYS_PREAMBLE, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

const STRIPMETA_TS = fileURLToPath(new URL('../../src/runtypes/stripRunTypeMeta.ts', import.meta.url));

/** Slice the machinery out of stripRunTypeMeta.ts between the region markers
 *  and drop the `export` modifiers so it can live in a non-module snippet. **/
function extractStripMetaRegion(): string {
  const source = readFileSync(STRIPMETA_TS, 'utf8');
  const start = source.indexOf('// #region stripmeta-extract');
  const end = source.indexOf('// #endregion stripmeta-extract');
  if (start === -1 || end === -1) {
    throw new Error('stripmeta-extract region markers not found in src/runtypes/stripRunTypeMeta.ts');
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

const PREAMBLE = `${SENTINEL_KEYS_PREAMBLE}\n${extractStripMetaRegion()}\n${ASSERT_PREAMBLE}\n`;

/** Compile `PREAMBLE + snippet` and report errors + raw/net instantiation counts. **/
export const measureStripMeta = makeMeasurer(PREAMBLE);
