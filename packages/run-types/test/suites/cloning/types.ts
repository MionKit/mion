/** Cloning-suite case, shaped like the serialization suite's so it also feeds the docs export and benchmarks.
 *  Only primitives and opaque values (functions, handles, `any`) pass through; those cases set `passThrough`. **/

/** Erases `T` once: strictFunctionTypes rejects `RemoveUnknownKeysFn<T>` where the `<unknown>` form is expected. **/
export type AnyCloneFn = (value: any) => any;

export interface CloningCase {
  title: string;
  description?: string;

  /** User-facing notes on non-obvious clone behavior — the cloning
   *  counterpart of `validateNotes` / `serializeNotes`: pass-through
   *  categories, union dispatch, prototype preservation, … **/
  cloneNotes?: string | string[];

  /** Inline `() => createRemoveUnknownKeysFn<T>()` so the plugin injects the runtype at the call site. **/
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

  /** The factory is an alwaysThrow (object-bearing unions, RUK001); tests assert the throw when calling the thunk. **/
  factoryThrows?: boolean;

  /** Optional extra assertions for behavior the generic checks can't express
   *  from data alone (a prototype method still working, RegExp lastIndex,
   *  …). Runs once per sample after the generic asserts. **/
  verifyClone?: (out: unknown, input: unknown) => void;
}
