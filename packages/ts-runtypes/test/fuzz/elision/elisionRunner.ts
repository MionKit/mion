// Driver for the elision form-equivalence lane: generate a builder schema
// (builderGen), render BOTH spellings, compile each through the REAL resolver
// (the type lane's ResolverClient harness), and check the oracles:
//
//   E1  every module the static form emits exists BYTE-IDENTICALLY in the
//       value form's output (same type id + same fnHashes ⇒ same entries,
//       whichever spelling — the convergence contract).
//   E2  the static form emits zero reflection payload (no runtypes bundle, no
//       reflection site); the value form keeps both.
//   E3  the static form's compiled functions BEHAVE: no Error diagnostics,
//       validate accepts a conforming value and rejects a root-violating one,
//       and JSON decode(encode(valid)) round-trips (values are JSON-pure by
//       construction, so plain JSON.stringify equality is the comparison).
//
// Each iteration derives shape AND probe values from one mixSeed, so a
// reported violation replays exactly.

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {startSoakBudget} from '../core/soakBudget.ts';
import {openClient, hasBinary, BIN} from '../type/typeFuzzHarness.ts';
import {MARKER_PACKAGE_OVERLAY, evalEntryModules} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {Severity} from '../../../../ts-runtypes-devtools/src/protocol.ts';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
import {
  randomShape,
  renderBuilderExpr,
  validValue,
  invalidValue,
  describeShape,
  DEFAULT_BUILDER_GEN_OPTIONS,
  type Shape,
} from './builderGen.ts';
import {
  checkSharedEntriesIdentical,
  checkStaticHasNoReflection,
  checkValueHasReflection,
  type ElisionViolation,
  type ScanShape,
} from './elisionOracle.ts';

export {hasBinary, BIN};

const FIXTURE = 'g.ts';

const IMPORT_BLOCK = `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, type InferType} from '@ts-runtypes/core';
import {object, array, union, optional, literal, boolean} from '@ts-runtypes/core/builders';
import {string, number} from '@ts-runtypes/core/formats';
`;

/** The static spelling: the builder const's only reference is the type query. **/
export function renderStaticFixture(expr: string): string {
  return `${IMPORT_BLOCK}const rtRoot = ${expr};
type T = InferType<typeof rtRoot>;
export const isT = createValidateFn<T>();
export const encT = createJsonEncoderFn<T>();
export const decT = createJsonDecoderFn<T>();
`;
}

/** The value spelling: the const IS every factory's argument. **/
export function renderValueFixture(expr: string): string {
  return `${IMPORT_BLOCK}const rtRoot = ${expr};
export const isT = createValidateFn(rtRoot);
export const encT = createJsonEncoderFn(rtRoot);
export const decT = createJsonDecoderFn(rtRoot);
`;
}

interface CompiledFixture {
  scan: ScanShape;
  errorDiagnostics: string[];
  /** fn-site cache keys in source order (validate, encoder, decoder). **/
  fnKeys: string[];
}

async function compileFixture(client: ResolverClient, source: string): Promise<CompiledFixture> {
  await client.setSources({...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
  const resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  const diagnostics = resp.diagnostics ?? [];
  const sites = resp.sites ?? [];
  return {
    scan: {modules: resp.entryModules ?? {}, siteFnIds: sites.map((site) => site.fnId ?? '')},
    errorDiagnostics: diagnostics
      .filter((d) => d.severity === Severity.Error)
      .map((d) => `${d.code}(${d.args?.join(', ') ?? ''})`),
    fnKeys: sites.filter((site) => site.fnId).map((site) => `${site.fnId}_${site.id}`),
  };
}

export interface ElisionFuzzOptions {
  seed?: number;
  iterations?: number;
}

export interface ElisionFuzzReport {
  runs: number;
  seed: number;
  violations: ElisionViolation[];
}

async function fuzzOne(client: ResolverClient, seed: number, violations: ElisionViolation[]): Promise<void> {
  let shape!: Shape;
  let valid!: unknown;
  let invalid!: unknown;
  withSeededRandom(seed, () => {
    shape = randomShape(DEFAULT_BUILDER_GEN_OPTIONS);
    valid = validValue(shape);
    invalid = invalidValue(shape);
  });
  const title = describeShape(shape);
  const expr = renderBuilderExpr(shape);

  const staticSide = await compileFixture(client, renderStaticFixture(expr));
  const valueSide = await compileFixture(client, renderValueFixture(expr));

  const push = (violation: ElisionViolation | undefined): void => {
    if (violation) violations.push(violation);
  };
  // E0 — fixture integrity: each spelling declares exactly three createX
  // sites. A miscount means the GENERATOR emitted source that did not express
  // the intended schema (e.g. a wrong builder arity type-erroring to `any`) —
  // caught here so it can never silently weaken E1-E3.
  if (staticSide.fnKeys.length !== 3) {
    violations.push({
      oracle: 'E0-fixture',
      seed,
      title,
      message: `static form resolved ${staticSide.fnKeys.length} fn sites (want 3) — generator emitted a broken fixture`,
    });
    return;
  }
  if (valueSide.fnKeys.length !== 3) {
    violations.push({
      oracle: 'E0-fixture',
      seed,
      title,
      message: `value form resolved ${valueSide.fnKeys.length} fn sites (want 3) — generator emitted a broken fixture`,
    });
    return;
  }
  push(checkStaticHasNoReflection(seed, title, staticSide.scan));
  push(checkValueHasReflection(seed, title, valueSide.scan));
  push(checkSharedEntriesIdentical(seed, title, staticSide.scan.modules, valueSide.scan.modules));

  // E3 — the static form's functions must materialise and behave. Wire through
  // the REAL factories exactly like production: the evaluated entry tuple IS
  // the injected trailing argument.
  if (staticSide.errorDiagnostics.length > 0) {
    violations.push({
      oracle: 'E3-behavior',
      seed,
      title,
      message: `static form produced Error diagnostics: ${staticSide.errorDiagnostics.join('; ')}`,
    });
    return;
  }
  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(staticSide.scan.modules);
  } catch (err) {
    violations.push({oracle: 'E3-behavior', seed, title, message: `static form modules failed to evaluate: ${errMsg(err)}`});
    return;
  }
  const [valKey, encKey, decKey] = staticSide.fnKeys;
  try {
    const isT = createValidateFn(undefined, undefined, tuples[valKey] as never);
    const encT = createJsonEncoderFn(undefined, undefined, tuples[encKey] as never);
    const decT = createJsonDecoderFn(undefined, undefined, tuples[decKey] as never);
    if (isT(valid) !== true) {
      violations.push({
        oracle: 'E3-behavior',
        seed,
        title,
        message: `validate rejected a conforming value: ${JSON.stringify(valid)}`,
      });
    }
    if (isT(invalid) !== false) {
      violations.push({
        oracle: 'E3-behavior',
        seed,
        title,
        message: `validate accepted a root-violating value: ${JSON.stringify(invalid)}`,
      });
    }
    const wire = encT(valid);
    if (typeof wire !== 'string') {
      violations.push({
        oracle: 'E3-behavior',
        seed,
        title,
        message: `encoder returned a non-string for ${JSON.stringify(valid)}`,
      });
    } else {
      const back = decT(wire);
      // Key-order-insensitive comparison: the decoder rebuilds declared props
      // in declared order, which may differ from the probe's insertion order.
      if (canonicalJson(back) !== canonicalJson(valid)) {
        violations.push({
          oracle: 'E3-behavior',
          seed,
          title,
          message: `decode(encode(v)) drifted: in=${JSON.stringify(valid)} out=${JSON.stringify(back)}`,
        });
      }
    }
  } catch (err) {
    violations.push({oracle: 'E3-behavior', seed, title, message: `wiring/probing threw: ${errMsg(err)}`});
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** JSON-pure deep-canonical form: object keys sorted recursively, so equality
 *  ignores property order (arrays keep their order — it is data). **/
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export async function runElisionFuzz(options: ElisionFuzzOptions = {}): Promise<ElisionFuzzReport> {
  const seed = options.seed ?? Date.now() >>> 0;
  const iterations = options.iterations ?? 25;
  const violations: ElisionViolation[] = [];
  const client = openClient();
  let runs = 0;
  try {
    for (let i = 0; i < iterations; i++) {
      runs++;
      await fuzzOne(client, mixSeed(seed, 'elision', i), violations);
    }
  } finally {
    client.close();
  }
  return {runs, seed, violations};
}

export async function runElisionFuzzForDuration(
  durationMs: number,
  options: ElisionFuzzOptions = {}
): Promise<ElisionFuzzReport> {
  const seed = options.seed ?? Date.now() >>> 0;
  const violations: ElisionViolation[] = [];
  const client = openClient();
  let runs = 0;
  const budget = startSoakBudget(durationMs);
  try {
    while (budget.canStart()) {
      await fuzzOne(client, mixSeed(seed, 'elision', runs), violations);
      runs++;
      budget.mark();
    }
  } finally {
    client.close();
  }
  return {runs, seed, violations};
}
