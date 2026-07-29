// Harness for the per-branch `FromJsonSchema<S>` instantiation-budget test
// (jsonSchema.compile.test.ts). Builds the PREAMBLE — the REAL inference
// machinery sliced VERBATIM out of src/json-schema/fromJsonSchema.ts between
// the `#region jsonschema-extract` markers (so the harness can never drift from
// the shipped type) + structural stand-ins for the format brand aliases the
// region references + assertion helpers — and binds it to the shared compiler
// measurer in compileHarness.ts.
//
// The brand stand-ins mirror the REAL `TypeFormat` shape (typeFormat.ts: base &
// two optional readonly sentinel props) with one distinct row per referenced
// alias, so the dispatch cost measured here matches the shipped brands without
// pulling the formats module graph (which would swamp the instantiation count).
// Brand-level correctness against the real aliases is proven at runtime by the
// convergence suites; this harness verifies the DISPATCH picks the right row
// and the mapping logic stays within budget.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

const FROM_JSON_SCHEMA_TS = fileURLToPath(new URL('../../src/json-schema/fromJsonSchema.ts', import.meta.url));

/** Slice the inference machinery out of fromJsonSchema.ts between the region
 *  markers and drop the `export` modifiers so it can live in a non-module
 *  snippet. **/
function extractJsonSchemaRegion(): string {
  const source = readFileSync(FROM_JSON_SCHEMA_TS, 'utf8');
  const start = source.indexOf('// #region jsonschema-extract');
  const end = source.indexOf('// #endregion jsonschema-extract');
  if (start === -1 || end === -1) {
    throw new Error('jsonschema-extract region markers not found in src/json-schema/fromJsonSchema.ts');
  }
  return source.slice(start, end).replace(/^export (type|interface) /gm, '$1 ');
}

// Structural stand-ins for the brand names the region references from OUTSIDE
// itself — the real TypeFormat sentinel shape plus one distinct (Name, Params)
// identity per format alias (mirroring formats/: uuid carries a version param,
// ip a version number). StringFormat/NumberFormat need no stand-in: the region
// itself declares them over TypeFormat.
const BRAND_PREAMBLE = `
type TypeFormat<Base, Name extends string, Params extends object> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type Email = TypeFormat<string, 'email', {}>;
type UUIDv4 = TypeFormat<string, 'uuid', {version: '4'}>;
type StringDate = TypeFormat<string, 'date', {}>;
type StringTime = TypeFormat<string, 'time', {}>;
type StringDateTime = TypeFormat<string, 'dateTime', {}>;
type Domain = TypeFormat<string, 'domain', {}>;
type IPv4 = TypeFormat<string, 'ip', {version: 4}>;
type IPv6 = TypeFormat<string, 'ip', {version: 6}>;
type Url = TypeFormat<string, 'url', {}>;
`;

// Type-level assertion helpers used by the snippets.
const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const PREAMBLE = `${BRAND_PREAMBLE}\n${extractJsonSchemaRegion()}\n${ASSERT_PREAMBLE}\n`;

/** Compile `PREAMBLE + snippet` and report errors + raw/net instantiation counts. **/
export const measureJsonSchema = makeMeasurer(PREAMBLE);
