// Harness for the per-branch `FromJsonSchema<S>` instantiation-budget test
// (jsonSchema.compile.test.ts). The budget exists to measure the REAL
// type-check cost a consumer pays, so the snippets import the REAL
// `FromJsonSchema` + the REAL format brands straight from source — no sliced
// region, no hand-written stand-ins. `makeMeasurer` runs the actual TypeScript
// compiler; with bundler module resolution it follows those imports into the
// real formats graph, so the instantiation count is the genuine article.
//
// The measured file lives next to this harness (SNIPPET_FILE) so its relative
// imports resolve against the real `src/` tree; the extra libs match
// packages/ts-runtypes/tsconfig.json (the formats value-code names `atob` /
// `console` / `URL` / Temporal, which es2023 alone lacks).

import {fileURLToPath} from 'node:url';
import * as ts from 'typescript';
import {makeMeasurer, type MeasureResult, type MeasurerConfig} from './compileHarness.ts';

export type {MeasureResult};

// The snippet is compiled AT this path, so `../../src/...` reaches the real
// source tree (this harness is itself at test/types/).
const SNIPPET_FILE = fileURLToPath(new URL('./__jsonschema_measure__.ts', import.meta.url));

// Real imports — the SAME modules fromJsonSchema.ts pulls in. `FromJsonSchema`
// + every format brand the compile-test twins name, spelled once so the twins
// (and the door output they compare against) resolve to the shipped types.
const IMPORTS = `import type {FromJsonSchema, ExactJsonSchema} from '../../src/json-schema/fromJsonSchema.ts';
import type {__rtFormatName, __rtFormatParams, __rtNot} from '../../src/runtypes/sentinelKeys.ts';
import type {
  Email,
  EmailAddress,
  UUID,
  UUIDv4,
  StringDate,
  StringTime,
  StringDateTime,
  Domain,
  Hostname,
  Uri,
  IPv4,
  IPv6,
  Url,
  Base64,
  Base32,
  Base16,
  JsonContent,
  JsonContentBase64,
  FormattedArray,
  FormattedObject,
  String as StringFormat,
  Number as NumberFormat,
} from '../../src/formats/index.ts';
import type {OneOf} from '../../src/builders/static.ts';
`;

// Type-level assertion helpers used by the snippets.
const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const PREAMBLE = `${IMPORTS}\n${ASSERT_PREAMBLE}\n`;

// Bundler resolution + the package's libs so the real import graph type-checks;
// merged over the measurer defaults.
const REAL_IMPORT_CONFIG: MeasurerConfig = {
  snippetFile: SNIPPET_FILE,
  options: {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.esnext.temporal.d.ts'],
  },
};

/** Compile `PREAMBLE + snippet` (against the REAL modules) and report errors +
 *  raw/net instantiation counts. **/
export const measureJsonSchema = makeMeasurer(PREAMBLE, REAL_IMPORT_CONFIG);
