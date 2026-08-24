/** One case in the cloning suite (`createCloneExactShapeFn<T>()`). Mirrors the
 *  serialization suite's case shape: declarative data + marker-based thunks,
 *  so the same cases feed the vitest runners, the website docs export, and
 *  benchmarks.
 *
 *  The contract under test — a proper deep clone of the DECLARED shape:
 *  undeclared keys dropped by construction, the input never mutated, and
 *  `clone(x) !== x` for every object-typed position (prototype preserved).
 *  Only primitives (compare by value; freshness is meaningless) and opaque
 *  unshaped values (functions, resource handles, `any`/`unknown`) pass
 *  through — those cases set `passThrough`. **/

/** Case-file thunk return: `createCloneExactShapeFn<T>()` returns the
 *  T-narrowed `CloneExactShapeFn<T>`, which strictFunctionTypes won't accept
 *  where `CloneExactShapeFn<unknown>` is expected (contravariant parameter).
 *  The suite erases `T` at the case boundary instead of casting per case. **/
export type AnyCloneFn = (value: any) => any;

export interface CloningCase {
  title: string;
  description?: string;

  /** User-facing notes on non-obvious clone behavior — the cloning
   *  counterpart of `validateNotes` / `serializeNotes`: pass-through
   *  categories, union dispatch, prototype preservation, … **/
  cloneNotes?: string | string[];

  /** Clone-fn thunk. Full type setup inline
   *  (`() => createCloneExactShapeFn<T>()`) so the marker plugin injects the
   *  runtype hash at the call site. **/
  clone: () => AnyCloneFn;

  /** Sample inputs. The builder MUST be deterministic — the asserts call it
   *  twice and use the second graph as an untouched twin to prove the input
   *  was not mutated. Reference-compared pass-through values (functions)
   *  must therefore be module-level consts, not rebuilt per call.
   *
   *  `expected` is set only when the clone differs from the input — an input
   *  carrying undeclared keys that the clone drops. Omitted → the clone must
   *  deep-equal the input. **/
  getTestData: () => {values: unknown[]; expected?: unknown[]};

  /** Primitives and opaque unshaped values pass through: the identity
   *  assertion flips from "shares nothing mutable" to `clone(x) === x`. **/
  passThrough?: boolean;

  /** When `createCloneExactShapeFn<T>()` is rendered as an alwaysThrow cache
   *  entry by the Go pipeline (object-bearing unions, CES001). Tests assert
   *  the throw at the thunk-invocation site. **/
  factoryThrows?: boolean;

  /** Optional extra assertions for behavior the generic checks can't express
   *  from data alone (a prototype method still working, RegExp lastIndex,
   *  …). Runs once per sample after the generic asserts. **/
  verifyClone?: (out: unknown, input: unknown) => void;
}
