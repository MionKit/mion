// Harness for the recursive-schema (`Self` / `SubstituteSelf` / `Recursive`)
// instantiation-budget test (substituteSelf.compile.test.ts). Slices that
// machinery VERBATIM out of src/builders/static.ts between the
// `#region substituteself-extract` markers (so it can't drift from the shipped
// type) and binds it — plus assertion helpers — to the shared compiler measurer
// in compileHarness.ts. Self-contained: the region names only es2023 lib types.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

const STATIC_TS = fileURLToPath(new URL('../../src/builders/static.ts', import.meta.url));

/** Slice the `Self` / `SubstituteSelf` / `Recursive` machinery out of static.ts
 *  between the region markers and drop `export` so it lives in a script snippet. **/
function extractRegion(): string {
  const source = readFileSync(STATIC_TS, 'utf8');
  const start = source.indexOf('// #region substituteself-extract');
  const end = source.indexOf('// #endregion substituteself-extract');
  if (start === -1 || end === -1) {
    throw new Error('substituteself-extract region markers not found in src/builders/static.ts');
  }
  return source.slice(start, end).replace(/^export (type|interface) /gm, '$1 ');
}

const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const PREAMBLE = `${extractRegion()}\n${ASSERT_PREAMBLE}\n`;

/** Compile `PREAMBLE + snippet` and report errors + raw/net instantiation counts. **/
export const measureSubstituteSelf = makeMeasurer(PREAMBLE);
