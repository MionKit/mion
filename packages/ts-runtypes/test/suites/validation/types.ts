import type {GetValidationErrorsFn, RTValidationError, MockTypeFn, StandardSchemaV1, RTValidationIssue} from '@ts-runtypes/core';

/** Thunk that returns the variant's function, OR the `'not-supported'`
 *  sentinel marking the variant as deliberately unsupported on this case
 *  (e.g. a value-first schema for a case that needs an `ValidateOptions` flag
 *  the value-first builders can't carry).
 *
 *  - Field omitted entirely → "not implemented" gap (test title suffixed
 *    with `(not implemented)`, no warning).
 *  - `'not-supported'` sentinel → known design limitation (test title
 *    suffixed with `(not supported)`, assert emits a once-per-(case, variant)
 *    `console.warn`).
 *  - Function → normal variant; assert runs it. **/
export type Thunk<T> = (() => T) | 'not-supported';

/** Validator-field thunk type. `ValidateFn<T>` is a type guard
 *  (`value is DataOnly<T>`) whose asserted type TS checks INVARIANTLY, so a
 *  field typed `ValidateFn<any>` accepts every concrete `ValidateFn<T>` EXCEPT
 *  `ValidateFn<never>` — the symbol cases, where `DataOnly<symbol>` is `never`
 *  and `any` is not assignable to `never`. We therefore widen to the plain
 *  boolean-returning call shape, the common supertype every `ValidateFn<T>`
 *  (including `ValidateFn<never>`) satisfies — a type guard is assignable to a
 *  `=> boolean` function. The validator's real typing is still checked at the
 *  thunk's `createValidateFn<T>()` call site; the asserts only invoke it for its
 *  boolean result. **/
type AnyValidateFn = (value: unknown) => boolean;
type ValidateThunk = Thunk<AnyValidateFn>;

/** Standard Schema factory-field thunk. Widened to `StandardSchemaV1<unknown>`
 *  for the same invariance reason as `AnyValidateFn`: `DataOnly<symbol>` is
 *  `never`, and `StandardSchemaV1<never>` is not assignable to a
 *  `StandardSchemaV1<any>` field. The asserts only read
 *  `schema['~standard'].validate` (param `unknown`), so the output type never
 *  matters to them; the real per-`T` typing is still checked at the thunk's
 *  `createStandardSchema<T>()` call site. **/
type AnyStandardSchema = StandardSchemaV1<unknown>;
type StandardSchemaThunk = Thunk<AnyStandardSchema>;

/** One atomic-type case in the shared suite.
 *
 *  HARDENING CONTRACT: every testing-function thunk below is REQUIRED — a case
 *  must declare each one as either a real thunk OR the `'not-supported'`
 *  sentinel (the variant is then a documented opt-out; explain the reason in
 *  `validateNotes`). This guarantees every `createX` form is consciously
 *  accounted for per case rather than silently missing. Only non-thunk metadata
 *  (`description`, `validateNotes`, `getExpectedErrors`, `mockTypeExpect`, and
 *  the divergence/throw flags) stays optional. */
export interface ValidationCase {
  title: string;
  description?: string;
  /** User-facing notes about validate validation behavior — surfaces
   *  in the auto-generated docs. Use for clarifications a consumer
   *  would want to know: TS-semantic divergences (e.g., `object`
   *  accepting arrays, function-typed props being skipped), edge
   *  cases the validator rejects despite passing `typeof` (NaN,
   *  Infinity, Invalid Date), and any non-obvious behavior. Prefix
   *  divergence-from-strict-TS notes with `TS DIVERGENCE:` for easy
   *  doc filtering. Single sentence → string; multiple distinct
   *  points → array. */
  validateNotes?: string | string[];
  /** Plugin-rewritten thunk returning the validate validator — STATIC
   *  form. Caller supplies `T` explicitly via the type argument. */
  validate: ValidateThunk;
  /** Plugin-rewritten thunk returning the validate validator — REFLECT
   *  form. Calls `createValidateFn(value)` with a runtime value annotated
   *  to type T; the type checker infers T from the annotation, the
   *  value itself is discarded at runtime. Paired with `validate` per
   *  the CLAUDE.md "Marker test coverage rule" to verify both call
   *  shapes produce the same validator end-to-end. **/
  validateReflect: ValidateThunk;
  /** Plugin-rewritten thunk returning the validator rebuilt from the
   *  serialized `RTCompiledFnData.code` body via
   *  `new Function('utl', code)(rtUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `validate` (static form). **/
  deserializeValidate: ValidateThunk;
  /** Reflect-form companion to `deserializeValidate`. **/
  deserializeValidateReflect: ValidateThunk;
  /** DATA-ONLY form: `() => createValidateFn<DataOnly<T>>()` — the SAME `T` as
   *  `validate`, wrapped in `DataOnly<…>`. Proves the `DataOnly` type mapping
   *  drops exactly what the AOT validator emitter drops: a `DataOnly<T>` call
   *  site must resolve to the SAME structural id (hence the SAME cached
   *  factory, by reference) as the bare-`T` call site. Asserted in the
   *  id-integrity DataOnly suite via `.toBe(validate())`. Wrap `DataOnly` at the
   *  literal call site (NOT behind a generic helper) — the plugin resolves the
   *  type argument where it is written. Set `dataOnlyDivergent` for the
   *  root-level non-data kinds whose ids cannot converge. **/
  validateDataOnly: ValidateThunk;
  /** SCHEMA form: `() => createValidateFn(<value-first builder schema>)`. Builds
   *  the validator from a `define` builder result (a `RunType` value) instead of
   *  reflecting a type — the value-first authoring path. Run against the same
   *  samples as `validate`. Required on every case: supply a thunk, or the
   *  `'not-supported'` sentinel to mark a case whose schema variant CANNOT be
   *  authored value-first (e.g. depends on an `ValidateOptions` flag the builders
   *  can't carry) — the assert then logs once and the title shows
   *  `(not supported)`. **/
  validateSchema: ValidateThunk;
  /** Plugin-rewritten thunk returning the getValidationErrors validator —
   *  STATIC form. Caller supplies `T` explicitly. Same dispatch and
   *  caching as `validate` but the validator returns `RTValidationError[]`
   *  instead of a boolean (matches the `RTFunctions.validationErrors`). */
  getValidationErrors: Thunk<GetValidationErrorsFn>;
  /** Plugin-rewritten thunk returning the getValidationErrors validator —
   *  REFLECT form. `T` inferred from a runtime value's declared type. */
  getValidationErrorsReflect: Thunk<GetValidationErrorsFn>;
  /** Plugin-rewritten thunk returning the getValidationErrors validator
   *  rebuilt from the serialized `RTCompiledFnData.code` body via
   *  `new Function('utl', code)(rtUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `getValidationErrors` (static form). */
  deserializeGetValidationErrors: Thunk<GetValidationErrorsFn>;
  /** Reflect-form companion to `deserializeGetValidationErrors`. */
  deserializeGetValidationErrorsReflect: Thunk<GetValidationErrorsFn>;
  /** DATA-ONLY form: `() => createGetValidationErrorsFn<DataOnly<T>>()`. Companion to
   *  `validateDataOnly` for the getValidationErrors family — must resolve the SAME
   *  cached factory as the bare-`T` `getValidationErrors` thunk. **/
  getValidationErrorsDataOnly: Thunk<GetValidationErrorsFn>;
  /** SCHEMA form: `() => createGetValidationErrorsFn(<value-first builder schema>)`.
   *  Companion to `validateSchema` for the getValidationErrors family. Required on every
   *  case; supports the same `'not-supported'` sentinel for a case whose schema
   *  variant CANNOT be authored value-first. **/
  getValidationErrorsSchema: Thunk<GetValidationErrorsFn>;
  /** Expected error arrays for invalid samples — index-parallel to
   *  `getSamples().invalid`. Outer array length must match
   *  `invalid.length`; entry i is the `RTValidationError[]` the validator
   *  should produce for `invalid[i]`. Valid samples always expect `[]`.
   *  Omit on cases that don't declare `getValidationErrors`. */
  getExpectedErrors?: () => RTValidationError[][];

  /** STANDARD SCHEMA form: `() => createStandardSchema<T>()` — the SAME `T` as
   *  `validate`. Adapts the validator pair to the Standard Schema v1 contract;
   *  the assert checks the `{value}` / `{issues}` discrimination and the issue
   *  shape. A SINGLE method (static form only): the static / reflect / schema
   *  call-shape mechanics are already covered by the validate +
   *  getValidationErrors families and the dedicated
   *  `test/standard/createStandardSchema.test.ts`, so this suite exercises just
   *  the static form across every type. Required (`'not-supported'` sentinel
   *  allowed, e.g. for `factoryThrows` cases handled by the assert). **/
  standardSchema: StandardSchemaThunk;
  /** Expected Standard Schema ISSUES for invalid samples — index-parallel to
   *  `getSamples().invalid`, ONE `StandardSchemaIssue[]` per negative value (a
   *  value may yield several issues). Valid samples are never listed (they
   *  always yield `{value}`). The consumer-facing sibling of
   *  `getExpectedErrors`. When OMITTED, the assert DERIVES it from
   *  `getExpectedErrors` via `runTypeErrorsToIssues` (the exact mapping the
   *  factory uses), so cases that already pinned raw errors need not re-author
   *  the Standard form; author it explicitly to pin a consumer-facing shape
   *  independently (e.g. a format case with no `getExpectedErrors`). */
  getExpectedStandardErrors?: () => RTValidationIssue[][];

  /** Plugin-rewritten thunk returning the mock generator — STATIC
   *  form. Caller supplies `T` explicitly. The adapter generates N
   *  values (default 20) and asserts each passes `validate<T>()`. */
  mockType: Thunk<MockTypeFn<unknown>>;
  /** Plugin-rewritten thunk returning the mock generator — REFLECT
   *  form. `T` inferred from a runtime value's declared type. */
  mockTypeReflect: Thunk<MockTypeFn<unknown>>;
  /** Adapter expectation for the mock case:
   *  - `'value'` (default) — every generated value must pass `validate<T>()`.
   *  - `'throw'` — calling the mock fn must throw (e.g. `never`).
   *  - `'skip'` — the mock fn runs but its output is not validate-checked
   *    (e.g. function kinds where the mock returns `undefined`). **/
  mockTypeExpect?: 'value' | 'throw' | 'skip';

  /** When true, every adapter thunk (validate / getValidationErrors / mockType
   *  and their deserialize / reflect variants) is expected to throw
   *  on invocation. Used for kinds that are unsupported at root —
   *  the Go pipeline renders the factory as an `alwaysThrow` entry,
   *  so the very first `createXxx<T>()` call surfaces the build-time
   *  diagnostic at runtime. See docs/UNSUPPORTED-KINDS.md.
   *
   *  `getSamples` / `getExpectedErrors` are not consulted when this
   *  flag is set — the test stops at the throw assertion. **/
  factoryThrows?: boolean;

  /** Opt a case out of the id-integrity suite (`assertValidatorIdIntegrity`):
   *  its value-first schema form and type-first form are KNOWN not to resolve the
   *  same structural id, by design. Reserved for cases where convergence is
   *  genuinely impossible — leave UNSET for cases that should converge so a
   *  regression surfaces as a failure. (Note: option cases like `noLiterals` /
   *  `noIsArrayCheck` are NOT divergent — they converge once the schema thunk
   *  mirrors the same option, e.g. `createValidateFn(RT.literal(2), {noLiterals: true})`.) **/
  idDivergent?: boolean;

  /** Opt a case out of the DataOnly-equivalence suite
   *  (`assertDataOnlyEquivalence`): `createValidateFn<DataOnly<T>>()` is KNOWN not to
   *  validate the same way as `createValidateFn<T>()`, by design, because `DataOnly`
   *  is a purely STRUCTURAL projection and `T` is validated by NATIVE or NOMINAL
   *  identity (which a structural mapping can't preserve), or `T` has a shape the
   *  mapping can't reconstruct. Known divergent families:
   *   - root-level non-data kinds where `DataOnly<T>` collapses to `never`
   *     (bare function type, callable interface, `symbol`);
   *   - native-identity leaves the emitter treats atomically but `DataOnly`
   *     maps structurally (the TC39 `Temporal.*` types and `Temporal.X & {brand}`
   *     format types);
   *   - nominal `class` types (DataOnly projects the instance to a plain object,
   *     so the validated kind becomes `objectLiteral` instead of `class`);
   *   - degenerate tuple shapes the homomorphic mapped type can't preserve
   *     (a trailing rest `...T[]`, a self-referential slot, or a function slot
   *     the emitter keeps as a `notSupported`/`undefined` node).
   *  Leave UNSET for every case that SHOULD converge so a DataOnly↔emitter
   *  regression surfaces as a failure. **/
  dataOnlyDivergent?: boolean;

  /** Pure sample data — same for every adapter. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}
