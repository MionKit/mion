// `MockData<T>` — the realistic sample-value enrichment map for a type: per-field
// pools / ranges / element + length / overrides that feed the existing
// `createMockDataFn<T>()` generator (see docs/AI_ENRICHMENT.md). The AI supplies
// realistic values; the mechanical generator stays deterministic.
//
// Same construction as `FriendlyNode` (./friendlyType.ts) and `DataOnly<T>`
// (src/runtypes/dataOnly.ts): depth-bounded tuple decrement, NO `infer` on the
// hot path (`T[number]` / `T[K]`), scalar-before-object gates, homomorphic child
// map. The `#region mockdata-extract` block is sliced VERBATIM by
// test/types/enrichHarness.ts into the instantiation-budget compile test, so
// it must reference only `lib` types + its own declarations.

// #region mockdata-extract — MockData machinery; sliced verbatim between these
// markers by test/types/enrichHarness.ts. Self-contained: `lib` + own decls only.

/** Recursion-budget decrement: `_MockDepth[N]` is `N - 1`. Bounds circular /
 *  mutually-recursive types to a finite instantiation (no TS2589). */
type _MockDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive mock-data node — structural per solution A (docs/AI_ENRICHMENT.md):
 *  composite kinds reflect their structure. Numbers → pool + min/max; strings →
 *  pool; Date → pool + min/max; tuples → per-slot homomorphic `rt$slots` (fixed
 *  length, NO `rt$length`); `Map` → `rt$keys`/`rt$values`/`rt$size`; `Set` →
 *  `rt$values`/`rt$size`; arrays → element node (`rt$items`) + `rt$length`; objects →
 *  homomorphic optional child map + `rt$optional` (present-probability for optional
 *  members); other leaves (boolean, bigint, …) → a value pool. `Map`/`Set` gates
 *  run BEFORE the array check, fronted by a cheap `Readonly{Map,Set}<any…>` test
 *  so `infer` stays off the hot path (mirroring `DataOnly`). NOTE: index
 *  signatures + object-member unions are OUT OF SCOPE here — index-sig objects
 *  still fall through to the homomorphic object map as today. */
export type MockNode<T, Depth extends number = 8> = Depth extends 0
  ? {pool: T[]} // budget spent — keep as a leaf pool
  : // Map BEFORE the array check: cheap `ReadonlyMap<any, any>` gate filters
    // non-Maps so the `infer K, V` never runs off the hot path (per DataOnly).
    T extends ReadonlyMap<any, any>
    ? T extends ReadonlyMap<infer K, infer V>
      ? {rt$keys: MockNode<K, _MockDepth[Depth]>; rt$values: MockNode<V, _MockDepth[Depth]>; rt$size?: number | [number, number]}
      : {pool: T[]} // unreachable — gate guarantees a Map
    : T extends ReadonlySet<any>
      ? T extends ReadonlySet<infer U>
        ? {rt$values: MockNode<U, _MockDepth[Depth]>; rt$size?: number | [number, number]}
        : {pool: T[]} // unreachable — gate guarantees a Set
      : T extends readonly unknown[]
        ? // tuple vs array: a tuple has a literal `length`, an array's `length` is
          // the broad `number`. Tuple → per-slot homomorphic `rt$slots` (fixed
          // length, no `rt$length`); array → `rt$items` element node + `rt$length`.
          number extends T['length']
          ? {rt$items: MockNode<T[number], _MockDepth[Depth]>; rt$length?: number | [number, number]}
          : {rt$slots: {[K in keyof T]: MockNode<T[K], _MockDepth[Depth]>}}
        : T extends number
          ? {pool: number[]; min?: number; max?: number}
          : T extends string
            ? {pool: string[]}
            : T extends Date
              ? {pool: Date[]; min?: Date; max?: Date}
              : T extends RegExp
                ? {pool: RegExp[]}
                : // boolean / bigint BEFORE the object branch and BEFORE the fallback:
                  // `boolean` is `true | false`, so a fallback `{pool: T[]}` would
                  // distribute to `{pool: true[]} | {pool: false[]}`. A branch whose
                  // result element type is FIXED (`boolean` / `bigint`, not `T`)
                  // collapses back to one node on reassembly.
                  T extends boolean
                  ? {pool: boolean[]}
                  : T extends bigint
                    ? {pool: bigint[]}
                    : T extends object
                      ? {[K in keyof T]-?: MockNode<T[K], _MockDepth[Depth]>} & {rt$optional?: number}
                      : {pool: T[]};

/** The mock-data map for `T`, validated against `T` at scan time — every pool /
 *  range value is checked against the field's type + format (the MD003 rule). */
export type MockData<T> = MockNode<T>;
// #endregion mockdata-extract
