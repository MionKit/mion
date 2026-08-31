// Measurement core for the BUILDER / FORMAT call-site cost budgets — what a
// consumer's editor and every `tsc` run pay to type-check a schema written with
// the value-first surface (`TF.string({…})`, `RT.object({…})`, …).
//
// Reuses `makeMeasurer` from ./compileHarness.ts rather than copying it, so the
// counting, the empty-snippet baseline subtraction and the snippet-relative error
// lines stay identical across every budget suite in the repo. The one thing this
// measurer does differently from the sliced-preamble ones is REAL module
// resolution: a builder call site resolves an overload set, and a sliced stand-in
// cannot stand in for that. The snippet is a virtual file at a real path inside
// this package, so `@mionjs/run-types/*` self-resolves through the package's own
// `exports` map exactly as a consumer's import would.
//
// ── Why TWO numbers per case ─────────────────────────────────────────
//
// A single call's net instantiation count is NOT the cost that scales. Measured
// on the current tree, `TF.string({minLength: 5, maxLength: 20})` costs 187 at
// the first call site and 9 at every one after it: ~95% of what a one-call
// measurement reports is a ONE-TIME cost (instantiating the overload set and the
// params interface) that a file pays once no matter how many fields it declares.
// A real schema file is one import and many calls, so optimising the one-call
// number optimises the wrong thing.
//
// So every case reports both, each with its own budget:
//   fixed     — net instantiations at n=1 (what a file pays to touch the builder)
//   marginal  — (net(n=8) - net(n=4)) / 4 (what each additional call adds)
//
// Container builders (`object` / `array` / `tuple` / `record`) additionally
// report a PER-MEMBER slope, because their cost scales with the schema's shape
// rather than with the number of call sites.
//
// ── The lazy-checker trap ────────────────────────────────────────────
//
// Every case body must CONSUME what the builder returned — read it back through
// `InferType` into an annotated const. Declaring a type measures nothing: the
// checker stays lazy and the case looks free. The model-pipeline budget spec
// records the same trap.

import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, type MeasureResult} from './compileHarness.ts';

export type {MeasureResult};

/** Virtual snippet file. Never written to disk (the measurer's host serves it
 *  from memory) but the PATH is real, which is what makes `@mionjs/run-types`
 *  and its subpaths self-resolve to src through the `source` condition. **/
const SNIPPET_FILE = fileURLToPath(new URL('./__builderCostCase__.ts', import.meta.url));

/** Every module a case may need, imported once. Being the preamble, this is the
 *  baseline: resolving these costs 0 net on its own, so a case's net is the type
 *  work its own body triggered and nothing else. **/
const IMPORT_HEADER = `
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import type {InferType} from '@mionjs/run-types';
import * as TFT from '@mionjs/run-types/formats/temporal';

export {};
`;

/** A resolving program configured the way a consumer's is. `skipLibCheck` keeps
 *  lib .d.ts errors out of the list without hiding any instantiation cost. **/
export const RESOLVING_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['source'],
  lib: ['lib.es2023.d.ts'],
  types: [],
  allowImportingTsExtensions: true,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
};

/** Compile `IMPORT_HEADER + snippet` against the real module graph; report the
 *  snippet's own errors plus raw / net instantiations. **/
export const measureSnippet = makeMeasurer(IMPORT_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: SNIPPET_FILE,
  diagnosticsScope: 'snippet',
});

/** What one call-site case costs: the one-time cost of touching the builder, and
 *  the cost each additional call adds. **/
export interface CallCost {
  fixed: number;
  marginal: number;
  errors: string[];
}

/** Call counts the marginal slope is read from. Two points far enough apart that
 *  the slope is stable, and both past the first call so neither carries the
 *  fixed cost. **/
const MARGINAL_LOW = 4;
const MARGINAL_HIGH = 8;

/** Measure a repeated call site. `mk(i)` renders call number `i` — it MUST bind
 *  to a distinct name per `i` and consume the result, and should vary a param
 *  value so the cases are not deduplicated into one cached instantiation. **/
export function measureCall(mk: (i: number) => string): CallCost {
  const render = (n: number) => Array.from({length: n}, (_, i) => mk(i)).join('\n');
  const one = measureSnippet(render(1));
  const low = measureSnippet(render(MARGINAL_LOW));
  const high = measureSnippet(render(MARGINAL_HIGH));
  return {
    fixed: one.netInstantiations,
    marginal: (high.netInstantiations - low.netInstantiations) / (MARGINAL_HIGH - MARGINAL_LOW),
    errors: [...one.errors, ...low.errors, ...high.errors],
  };
}

/** What one container case costs per member it holds. **/
export interface MemberCost {
  /** Net instantiations for the smallest measured container. **/
  base: number;
  /** Net instantiations each additional member adds. **/
  perMember: number;
  errors: string[];
}

const MEMBERS_LOW = 8;
const MEMBERS_HIGH = 16;

/** Measure how a container builder scales with the number of members it holds.
 *  `mk(count)` renders ONE call holding `count` members, and must consume the
 *  result. The slope is what a real schema pays as it grows.
 *
 *  `low` / `high` override the two sample points. They exist because a builder
 *  with fixed-arity overloads changes REGIME partway: `union` resolves an
 *  overload up to 8 members and falls back to `UnionOf<T>` past that, so a slope
 *  read across 8 → 16 measures the one-off cost of crossing that boundary, not a
 *  per-member cost. Sample such a builder entirely inside one regime. **/
export function measureMembers(mk: (count: number) => string, low = MEMBERS_LOW, high = MEMBERS_HIGH): MemberCost {
  const small = measureSnippet(mk(low));
  const large = measureSnippet(mk(high));
  return {
    base: small.netInstantiations,
    perMember: (large.netInstantiations - small.netInstantiations) / (high - low),
    errors: [...small.errors, ...large.errors],
  };
}
