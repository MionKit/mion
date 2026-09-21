// `MockData<T>` — the per-field pools / ranges / lengths that feed `createMockDataFn<T>()` (see
// docs/AI_ENRICHMENT.md): the AI supplies realistic values, the generator stays deterministic. Same
// construction as `FriendlyNode` and `DataOnly<T>` (src/runtypes/dataOnly.ts): depth-bounded tuple
// decrement, NO `infer` on the hot path, scalar-before-object gates, homomorphic child map. The
// `#region mockdata-extract` block is sliced VERBATIM by test/types/enrichHarness.ts, so it must
// reference only `lib` types + its own declarations.

// #region mockdata-extract — MockData machinery; sliced verbatim between these
// markers by test/types/enrichHarness.ts. Self-contained: `lib` + own decls only.

/** Recursion-budget decrement, bounding circular / mutually-recursive types to a finite instantiation. */
type _MockDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive mock-data node — structural per solution A (docs/AI_ENRICHMENT.md): composite kinds reflect
 *  their structure. An object's `rt$optional` is the present-probability for its optional members. The
 *  `Map` / `Set` gates run BEFORE the array check, fronted by a cheap test so `infer` stays off the hot
 *  path (mirroring `DataOnly`). Index signatures and object-member unions are OUT OF SCOPE: an index-sig
 *  object falls through to the object map. */
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

/** The mock-data map for `T`: every pool / range value is checked against the field's type and format
 *  at scan time (the MD003 rule). */
export type MockData<T> = MockNode<T>;
// #endregion mockdata-extract
