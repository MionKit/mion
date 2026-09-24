// Clone fuzz over REAL compiled `createRemoveUnknownKeysFn<T>()` fns (O15-O17). Each factory is called as
// `createX<T>()` on a concrete type, never a generic `T` through a helper, which would inject `unknown`.
// Atomic unions keep at most one member per structural family so the reference dispatch is unambiguous; object
// unions only assert the RUK001 throw; cyclic VALUES are outside the clone contract (the RangeError test).
// Template-literal-keyed index signatures are excluded: the reference interpreter does not model them yet.

import {describe, it, expect} from 'vitest';
import {createRemoveUnknownKeysFn, createValidateFn} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {runCloneFuzz, runCloneFuzzForDuration} from './cloneFuzzRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';
import type {CloneFuzzTarget} from './cloneOracle.ts';

// Class corpus members need a single module-scope identity shared by every
// marker call site AND by the instance-building mock wrapper (same rule as
// suites/cloning/Objects.ts).
class CloneFuzzLedger {
  owner = '';
  balance = 0;
  opened = new Date(0);
  tags: string[] = [];
  summary(): string {
    return `${this.owner}:${this.balance}`;
  }
}

// Circular corpus types live at module scope so the cyclic-value pinning
// test can reuse the same declarations as the fuzz targets.
interface CircTree {
  name: string;
  children?: CircTree[];
}
interface CircPartA {
  tag: string;
  b?: CircPartB;
}
interface CircPartB {
  n: number;
  a?: CircPartA;
}

const targets: CloneFuzzTarget[] = [];

// --- target: flat object of primitives ---
{
  interface FlatUser {
    id: number;
    name: string;
    active: boolean;
  }
  targets.push({
    title: 'FlatUser',
    schema: getRunType<FlatUser>(),
    mock: createMockDataFn<FlatUser>(),
    validate: createValidateFn<FlatUser>(),
    validateStrict: createValidateFn<FlatUser>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<FlatUser>(),
  });
}

// --- target: nested object with an array and a sub-object ---
{
  interface Nested {
    tags: string[];
    meta: {count: number; label: string};
  }
  targets.push({
    title: 'Nested',
    schema: getRunType<Nested>(),
    mock: createMockDataFn<Nested>(),
    validate: createValidateFn<Nested>(),
    validateStrict: createValidateFn<Nested>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<Nested>(),
  });
}

// --- target: optional properties (absent optionals must stay absent) ---
{
  interface OptionalProps {
    a: string;
    b?: number;
    c?: string;
  }
  targets.push({
    title: 'OptionalProps',
    schema: getRunType<OptionalProps>(),
    mock: createMockDataFn<OptionalProps>(),
    validate: createValidateFn<OptionalProps>(),
    validateStrict: createValidateFn<OptionalProps>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<OptionalProps>(),
  });
}

// --- target: declared `undefined`-typed prop (key stays present) ---
{
  interface UndefinedProp {
    a: string;
    c: undefined;
  }
  targets.push({
    title: 'UndefinedProp',
    schema: getRunType<UndefinedProp>(),
    mock: createMockDataFn<UndefinedProp>(),
    validate: createValidateFn<UndefinedProp>(),
    validateStrict: createValidateFn<UndefinedProp>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<UndefinedProp>(),
  });
}

// --- target: class instance with a prototype method ---
{
  const mockPlain = createMockDataFn<CloneFuzzLedger>();
  targets.push({
    title: 'ClassLedger',
    schema: getRunType<CloneFuzzLedger>(),
    // The mock walker builds PLAIN objects for class types (validate is
    // structural); wrap into a real instance so the prototype-preserving
    // `Object.create(Object.getPrototypeOf(v))` rebuild path is exercised.
    mock: () => Object.assign(new CloneFuzzLedger(), mockPlain()),
    validate: createValidateFn<CloneFuzzLedger>(),
    validateStrict: createValidateFn<CloneFuzzLedger>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<CloneFuzzLedger>(),
  });
}

// --- target: root atomic array ---
{
  targets.push({
    title: 'AtomicArray',
    schema: getRunType<string[]>(),
    mock: createMockDataFn<string[]>(),
    validate: createValidateFn<string[]>(),
    validateStrict: createValidateFn<string[]>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<string[]>(),
  });
}

// --- target: root array of objects ---
{
  interface ArrayItem {
    n: number;
    s: string;
  }
  targets.push({
    title: 'ObjectArray',
    schema: getRunType<ArrayItem[]>(),
    mock: createMockDataFn<ArrayItem[]>(),
    validate: createValidateFn<ArrayItem[]>(),
    validateStrict: createValidateFn<ArrayItem[]>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<ArrayItem[]>(),
  });
}

// --- target: tuple with a trailing optional slot ---
{
  type TupleOptional = [string, number?];
  targets.push({
    title: 'TupleOptional',
    schema: getRunType<TupleOptional>(),
    mock: createMockDataFn<TupleOptional>(),
    validate: createValidateFn<TupleOptional>(),
    validateStrict: createValidateFn<TupleOptional>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<TupleOptional>(),
  });
}

// --- target: tuple with a rest tail ---
{
  type TupleRest = [string, ...number[]];
  targets.push({
    title: 'TupleRest',
    schema: getRunType<TupleRest>(),
    mock: createMockDataFn<TupleRest>(),
    validate: createValidateFn<TupleRest>(),
    validateStrict: createValidateFn<TupleRest>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<TupleRest>(),
  });
}

// --- target: tuple mixing a Date slot and an optional object slot ---
{
  type TupleDateObject = [Date, {id: number}?];
  targets.push({
    title: 'TupleDateObject',
    schema: getRunType<TupleDateObject>(),
    mock: createMockDataFn<TupleDateObject>(),
    validate: createValidateFn<TupleDateObject>(),
    validateStrict: createValidateFn<TupleDateObject>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<TupleDateObject>(),
  });
}

// --- target: Map with atomic key/value ---
{
  type MapAtomic = Map<string, number>;
  targets.push({
    title: 'MapAtomic',
    schema: getRunType<MapAtomic>(),
    mock: createMockDataFn<MapAtomic>(),
    validate: createValidateFn<MapAtomic>(),
    validateStrict: createValidateFn<MapAtomic>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<MapAtomic>(),
  });
}

// --- target: Map with object values (per-entry rebuild) ---
{
  type MapObject = Map<string, {total: number}>;
  targets.push({
    title: 'MapObject',
    schema: getRunType<MapObject>(),
    mock: createMockDataFn<MapObject>(),
    validate: createValidateFn<MapObject>(),
    validateStrict: createValidateFn<MapObject>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<MapObject>(),
  });
}

// --- target: Set of atomics ---
{
  type SetAtomic = Set<string>;
  targets.push({
    title: 'SetAtomic',
    schema: getRunType<SetAtomic>(),
    mock: createMockDataFn<SetAtomic>(),
    validate: createValidateFn<SetAtomic>(),
    validateStrict: createValidateFn<SetAtomic>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<SetAtomic>(),
  });
}

// --- target: Set of objects (per-element rebuild) ---
{
  type SetObject = Set<{id: number}>;
  targets.push({
    title: 'SetObject',
    schema: getRunType<SetObject>(),
    mock: createMockDataFn<SetObject>(),
    validate: createValidateFn<SetObject>(),
    validateStrict: createValidateFn<SetObject>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<SetObject>(),
  });
}

// --- target: Date + Temporal properties (re-wrap / re-materialize) ---
{
  interface DateTemporal {
    at: Date;
    day: Temporal.PlainDate;
    instant: Temporal.Instant;
  }
  targets.push({
    title: 'DateTemporal',
    schema: getRunType<DateTemporal>(),
    mock: createMockDataFn<DateTemporal>(),
    validate: createValidateFn<DateTemporal>(),
    validateStrict: createValidateFn<DateTemporal>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<DateTemporal>(),
  });
}

// --- target: RegExp property (not data: shared by reference, like a function) ---
{
  interface RegExpProp {
    pattern: RegExp;
    note: string;
  }
  targets.push({
    title: 'RegExpProp',
    schema: getRunType<RegExpProp>(),
    mock: createMockDataFn<RegExpProp>(undefined, {mock: {nonDataTypes: true}}),
    validate: createValidateFn<RegExpProp>(),
    validateStrict: createValidateFn<RegExpProp>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<RegExpProp>(),
  });
}

// --- target: root record, plain string sig, atomic values ---
{
  type RecordAtomic = Record<string, number>;
  targets.push({
    title: 'RecordAtomic',
    schema: getRunType<RecordAtomic>(),
    mock: createMockDataFn<RecordAtomic>(),
    validate: createValidateFn<RecordAtomic>(),
    validateStrict: createValidateFn<RecordAtomic>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<RecordAtomic>(),
  });
}

// --- target: record with object values nested under a declared prop ---
{
  interface RecordObject {
    id: number;
    bag: Record<string, {w: number}>;
  }
  targets.push({
    title: 'RecordObject',
    schema: getRunType<RecordObject>(),
    mock: createMockDataFn<RecordObject>(),
    validate: createValidateFn<RecordObject>(),
    validateStrict: createValidateFn<RecordObject>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<RecordObject>(),
  });
}

// --- target: literal-union field (immutable members — passthrough arm) ---
{
  interface LiteralUnionField {
    status: 'on' | 'off';
    n: number;
  }
  targets.push({
    title: 'LiteralUnionField',
    schema: getRunType<LiteralUnionField>(),
    mock: createMockDataFn<LiteralUnionField>(),
    validate: createValidateFn<LiteralUnionField>(),
    validateStrict: createValidateFn<LiteralUnionField>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<LiteralUnionField>(),
  });
}

// --- target: Date | null field (atomic-union Date dispatch arm) ---
{
  interface UnionDateNull {
    due: Date | null;
    title: string;
  }
  targets.push({
    title: 'UnionDateNull',
    schema: getRunType<UnionDateNull>(),
    mock: createMockDataFn<UnionDateNull>(),
    validate: createValidateFn<UnionDateNull>(),
    validateStrict: createValidateFn<UnionDateNull>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<UnionDateNull>(),
  });
}

// --- target: string[] | number field (atomic-union array dispatch arm) ---
{
  interface UnionArrayOrNumber {
    data: string[] | number;
  }
  targets.push({
    title: 'UnionArrayOrNumber',
    schema: getRunType<UnionArrayOrNumber>(),
    mock: createMockDataFn<UnionArrayOrNumber>(),
    validate: createValidateFn<UnionArrayOrNumber>(),
    validateStrict: createValidateFn<UnionArrayOrNumber>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<UnionArrayOrNumber>(),
  });
}

// --- target: root atomic union (fully immutable — identity/noop clone) ---
{
  type AtomicUnionRoot = string | number;
  targets.push({
    title: 'AtomicUnionRoot',
    schema: getRunType<AtomicUnionRoot>(),
    mock: createMockDataFn<AtomicUnionRoot>(),
    validate: createValidateFn<AtomicUnionRoot>(),
    validateStrict: createValidateFn<AtomicUnionRoot>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<AtomicUnionRoot>(),
  });
}

// --- target: atomic unions mixing a primitive with a mutable native ---
{
  interface UnionMixedNatives {
    when: string | Date;
    items: string | string[];
  }
  targets.push({
    title: 'UnionMixedNatives',
    schema: getRunType<UnionMixedNatives>(),
    mock: createMockDataFn<UnionMixedNatives>(),
    validate: createValidateFn<UnionMixedNatives>(),
    validateStrict: createValidateFn<UnionMixedNatives>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<UnionMixedNatives>(),
  });
}

// --- target: circular type — self-referencing tree via optional array ---
// The mock recursion decay (optionalProbability / maxMockRecursion) keeps
// the generated values FINITE trees, and recursion runs through OPTIONAL
// positions so a depth bail-out is just an absent optional (still valid).
{
  targets.push({
    title: 'CircularTree',
    schema: getRunType<CircTree>(),
    mock: createMockDataFn<CircTree>(),
    validate: createValidateFn<CircTree>(),
    validateStrict: createValidateFn<CircTree>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<CircTree>(),
  });
}

// --- target: circular type — mutual recursion across two interfaces ---
{
  targets.push({
    title: 'CircularMutual',
    schema: getRunType<CircPartA>(),
    mock: createMockDataFn<CircPartA>(),
    validate: createValidateFn<CircPartA>(),
    validateStrict: createValidateFn<CircPartA>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<CircPartA>(),
  });
}

// --- target: deep composition (objects in arrays in objects, Dates inside) ---
{
  interface DeepComposite {
    org: {
      teams: Array<{name: string; members: Array<{id: number; joined: Date}>}>;
    };
    founded: Date;
  }
  targets.push({
    title: 'DeepComposite',
    schema: getRunType<DeepComposite>(),
    mock: createMockDataFn<DeepComposite>(),
    validate: createValidateFn<DeepComposite>(),
    validateStrict: createValidateFn<DeepComposite>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<DeepComposite>(),
  });
}

// --- target: function-valued prop (declared member kept, shared by ref) ---
{
  interface FnProp {
    name: string;
    onClick: () => void;
  }
  const strictFnProp = createValidateFn<Omit<FnProp, 'onClick'>>(undefined, {checkUnknowns: true});
  targets.push({
    title: 'FnProp',
    schema: getRunType<FnProp>(),
    // nonDataTypes makes the mock carry a REAL function so the shared-by-
    // reference contract is exercised (default mocks skip non-data members).
    mock: createMockDataFn<FnProp>(undefined, {mock: {nonDataTypes: true}}),
    validate: createValidateFn<FnProp>(),
    // The clone keeps function members (RUK010), which the strict validator rejects; drop the declared one first.
    validateStrict: (value) => {
      const {onClick: _onClick, ...data} = value as FnProp;
      return strictFnProp(data);
    },
    clone: createRemoveUnknownKeysFn<FnProp>(),
  });
}

// --- target: bigint + symbol props (by-value vs opaque-by-reference) ---
{
  interface BigintSymbol {
    big: bigint;
    sym: symbol;
    label: string;
  }
  targets.push({
    title: 'BigintSymbol',
    schema: getRunType<BigintSymbol>(),
    mock: createMockDataFn<BigintSymbol>(),
    validate: createValidateFn<BigintSymbol>(),
    validateStrict: createValidateFn<BigintSymbol>(undefined, {checkUnknowns: true}),
    clone: createRemoveUnknownKeysFn<BigintSymbol>(),
  });
}

// Object-bearing unions: the factory is a RUK001 alwaysThrow, so that throw is the only oracle.
const throwTargets: Array<{title: string; createClone: () => unknown}> = [
  {
    title: 'DisjointObjectUnion',
    // @mion-downgrade-error RUK001
    createClone: () => createRemoveUnknownKeysFn<{a: string} | {b: number}>(),
  },
  {
    title: 'DiscriminatedUnion',
    // @mion-downgrade-error RUK001
    createClone: () => createRemoveUnknownKeysFn<{kind: 'a'; va: string} | {kind: 'b'; vb: number}>(),
  },
];

describe('fuzz / cloning — oracle sweep over compiled createRemoveUnknownKeysFn', () => {
  it('finds no oracle violations across all targets', () => {
    const report = runCloneFuzz(targets, {seed: entrySeed('cloning'), iterations: 100});
    if (report.violations.length > 0 || report.crashes.length > 0) {
      const summary = report.violations
        .slice(0, 25)
        .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      value=${v.value}`)
        .join('\n');
      throw new Error(
        `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} runs:\n${summary}` +
          (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '') +
          (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
      );
    }
    expect(report.runs).toBe(targets.length * 100);
  });

  it('object-bearing unions stay RUK001 alwaysThrow factories', () => {
    for (const target of throwTargets) {
      expect(target.createClone, target.title).toThrow(/RUK001/);
    }
  });

  it('cyclic VALUES overflow the stack — the accepted failure mode', () => {
    // Cyclic VALUES are outside the clone contract (corpus values are
    // trees) and the compiled clone deliberately carries NO cycle
    // detection — per explicit user decision the RangeError stack overflow
    // is the accepted, documented failure mode. This test pins it.
    const clone = createRemoveUnknownKeysFn<CircTree>();
    const node: CircTree = {name: 'loop'};
    node.children = [node];
    expect(() => clone(node)).toThrow(RangeError);
  });

  // Autonomous soak: opt-in via `MION_FUZZ_CLONE_SOAK_MS=<ms>`. Runs continuously
  // for the given duration, logging every violation as it is found. Skipped in
  // normal CI runs.
  const soakMs = Number(process.env.MION_FUZZ_CLONE_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — clone-fuzz continuously and log all findings',
    () => {
      const report = runCloneFuzzForDuration(targets, soakMs, {seed: entrySeed('cloning')}, (v) => {
        console.error(`[fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    value=${v.value}`);
      });
      console.error(`[fuzz] clone soak finished: ${report.runs} runs, ${report.violations.length} violation(s)`);
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
