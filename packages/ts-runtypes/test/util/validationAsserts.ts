// Per-variant assertion helpers for the validation adapters. Each helper
// exercises EXACTLY ONE thunk on a ValidationCase (one cell of the
// family × form matrix), so the validation/* and format-validation/*
// suites can register one it() per variant — a failing test name
// (`<title> — validate/deserialize-reflect`) pinpoints which form broke,
// and other forms in the same case keep running instead of being
// short-circuited by the first failing expect().
//
// A thunk field on a case can be in three states; titleFor() surfaces
// the state in the it() name so the test tree is self-documenting:
//   - function           → no suffix; assert runs the function
//   - undefined          → " (not implemented)"; assert silently early-returns
//   - 'not-supported'    → " (not supported)";   assert silently early-returns

import {expect} from 'vitest';
import {runTypeErrorsToIssues, createFriendlyText} from '@ts-runtypes/core';
import type {RTValidationError} from '@ts-runtypes/core';
import type {Thunk, ValidationCase} from '../suites/validation/types.ts';
import type {FormatValidationCase} from '../suites/format-validation/types.ts';

/** Assert-input shape: a {@link ValidationCase} with every thunk field made
 *  OPTIONAL (only `title` + `getSamples` stay required). The suites enforce the
 *  full required-thunk contract via `satisfies Record<string, ValidationCase>`;
 *  the asserts only READ the thunks (skipping any that are absent or
 *  `'not-supported'` via `resolveThunk`), so the minimal `ValueFirstCase` mirror
 *  used by the value-first-define suite — which intentionally carries a subset —
 *  can still flow through the shared helpers. **/
export type AssertableCase = Partial<ValidationCase> & Pick<ValidationCase, 'title' | 'getSamples'>;

/** Number of values to draw per mock case. Larger = better coverage;
 *  smaller = faster CI. 20 is enough to surface most random-pool drift
 *  bugs without bloating test runtimes. **/
export const MOCK_ITERATIONS = 20;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    return String(value);
  }
}

/** Resolves a thunk field to its callable form, or `undefined` if the case
 *  doesn't declare a working thunk (either omitted entirely or marked
 *  `'not-supported'`). Use at the top of every per-variant assert to skip
 *  both gaps with a single check. **/
function resolveThunk<T>(thunk: Thunk<T> | undefined): (() => T) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

/** The (family, form) coordinates that actually exist on a ValidationCase.
 *  Invalid combos like 'validate/format' or 'mockType/schema' are not in the
 *  union — passing one is a TS error at the test-file call site. **/
export type VariantKey =
  | `validate/${'static' | 'reflect' | 'deserialize-static' | 'deserialize-reflect' | 'schema'}`
  | `getValidationErrors/${'static' | 'reflect' | 'deserialize-static' | 'deserialize-reflect' | 'schema' | 'format'}`
  | `mockType/${'static' | 'reflect'}`
  | 'standardSchema';

/** Resolves a variant key to the case's matching thunk field (function,
 *  `'not-supported'`, or `undefined`). 'getValidationErrors/format' points at the
 *  same static thunk as 'getValidationErrors/static' but is asserted with
 *  format-payload semantics by the format-validation suites. **/
function thunkFor(c: AssertableCase, key: VariantKey): Thunk<unknown> | undefined {
  switch (key) {
    case 'validate/static':
      return c.validate;
    case 'validate/reflect':
      return c.validateReflect;
    case 'validate/deserialize-static':
      return c.deserializeValidate;
    case 'validate/deserialize-reflect':
      return c.deserializeValidateReflect;
    case 'validate/schema':
      return c.validateSchema;
    case 'getValidationErrors/static':
      return c.getValidationErrors;
    case 'getValidationErrors/reflect':
      return c.getValidationErrorsReflect;
    case 'getValidationErrors/deserialize-static':
      return c.deserializeGetValidationErrors;
    case 'getValidationErrors/deserialize-reflect':
      return c.deserializeGetValidationErrorsReflect;
    case 'getValidationErrors/schema':
      return c.getValidationErrorsSchema;
    case 'getValidationErrors/format':
      return c.getValidationErrors;
    case 'mockType/static':
      return c.mockType;
    case 'mockType/reflect':
      return c.mockTypeReflect;
    case 'standardSchema':
      return c.standardSchema;
  }
}

/** Build the it() title for one variant. The key is used directly as the
 *  suffix (`<case title> — <family>/<form>`), with a state marker appended
 *  when the case's thunk is missing or marked as a known limitation:
 *   - function          → no suffix
 *   - `'not-supported'` → " (not supported)"
 *   - undefined         → " (not implemented)"
 *  Both gap markers surface in the test tree without anyone having to read
 *  the test body. **/
export function titleFor(c: AssertableCase, key: VariantKey): string {
  const value = thunkFor(c, key);
  const base = `${c.title} — ${key}`;
  if (value === 'not-supported') return `${base} (not supported)`;
  if (!value) return `${base} (not implemented)`;
  return base;
}

// =========================================================================
// validate family — 5 variants
// =========================================================================

/** Static form: createValidateFn<T>(). **/
export function assertValidateStatic(c: AssertableCase): void {
  const factory = resolveThunk(c.validate);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [static]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const validateStatic = factory();
  valid.forEach((v, i) => {
    expect(validateStatic(v), `${c.title} [static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(validateStatic(v), `${c.title} [static]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Reflect form: createValidateFn(value). T inferred from a runtime value's
 *  declared type; the value itself is discarded at runtime. **/
export function assertValidateReflect(c: AssertableCase): void {
  const factory = resolveThunk(c.validateReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [reflect]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const validateReflect = factory();
  valid.forEach((v, i) => {
    expect(validateReflect(v), `${c.title} [reflect]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(validateReflect(v), `${c.title} [reflect]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Deserialize-static form: validator rebuilt from the serialized
 *  RTCompiledFnData.code body via `new Function('utl', code)(rtUtils)`. **/
export function assertValidateDeserializeStatic(c: AssertableCase): void {
  const factory = resolveThunk(c.deserializeValidate);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const deserializedStatic = factory();
  valid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Deserialize-reflect form: same as deserialize-static but T inferred
 *  from a runtime value's declared type. **/
export function assertValidateDeserializeReflect(c: AssertableCase): void {
  const factory = resolveThunk(c.deserializeValidateReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const deserializedReflect = factory();
  valid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Backwards-compat shim used by the value-first-define suite, which is
 *  not restructured into per-variant it()s. Runs all 5 validate variants
 *  in sequence so the single it() in that suite exercises the same matrix
 *  the validation suite splits across five it()s. **/
export function assertValidate(c: AssertableCase): void {
  assertValidateStatic(c);
  assertValidateReflect(c);
  assertValidateDeserializeStatic(c);
  assertValidateDeserializeReflect(c);
  assertValidateSchema(c);
}

/** Schema form: createValidateFn(<value-first builder schema>). Proves the
 *  value-first authoring path resolves a validator that agrees with the
 *  type-first surface on the same samples. **/
export function assertValidateSchema(c: AssertableCase): void {
  const factory = resolveThunk(c.validateSchema);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [schema]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const validateSchema = factory();
  valid.forEach((v, i) => {
    expect(validateSchema(v), `${c.title} [schema]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(validateSchema(v), `${c.title} [schema]: invalid[${i}] should fail`).toBe(false);
  });
}

// =========================================================================
// getValidationErrors family — 5 variants
// =========================================================================

/** Static form: createGetValidationErrorsFn<T>(). **/
export function assertGetValidationErrorsStatic(c: AssertableCase): void {
  const factory = resolveThunk(c.getValidationErrors);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [static]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const getErrStatic = factory();
  valid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Reflect form: createGetValidationErrorsFn(value). **/
export function assertGetValidationErrorsReflect(c: AssertableCase): void {
  const factory = resolveThunk(c.getValidationErrorsReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [reflect]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const getErrReflect = factory();
  valid.forEach((v, i) => {
    expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Deserialize-static form: validator rebuilt from RTCompiledFnData.code. **/
export function assertGetValidationErrorsDeserializeStatic(c: AssertableCase): void {
  const factory = resolveThunk(c.deserializeGetValidationErrors);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const deserializedStatic = factory();
  valid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Deserialize-reflect form. **/
export function assertGetValidationErrorsDeserializeReflect(c: AssertableCase): void {
  const factory = resolveThunk(c.deserializeGetValidationErrorsReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const deserializedReflect = factory();
  valid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Schema form: createGetValidationErrorsFn(<value-first builder schema>).
 *  A value-first leaf builder reflects the FORMAT of a type (e.g. `string()`
 *  → `TF.String<{}>`), so its error detail may carry format metadata the
 *  bare type-first error doesn't — we therefore assert the CONTRACT
 *  (valid → no errors; invalid → at least one error) rather than deep-equality
 *  with the type-first `expected`, which the static pass above already pins. **/
export function assertGetValidationErrorsSchema(c: AssertableCase): void {
  const factory = resolveThunk(c.getValidationErrorsSchema);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [schema]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const getErrSchema = factory();
  valid.forEach((v, i) => {
    expect(getErrSchema(v), `${c.title} [schema]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrSchema(v).length, `${c.title} [schema]: invalid[${i}] → at least one error`).toBeGreaterThan(0);
  });
}

// =========================================================================
// mockType family — 2 variants
// =========================================================================

/** Drives one mock fn for MOCK_ITERATIONS iterations and asserts each
 *  generated value passes the case's static validate. **/
function runMockPass(c: AssertableCase, mockFn: () => unknown, label: string): void {
  // expectMode === 'skip' means we exercise the mock generator but can't
  // validate output — either because the kind has no validate semantic
  // (functions) or because the paired validate factory is alwaysThrow
  // (root symbol). Either way, skip the validate call so it doesn't blow up.
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'skip') {
    for (let i = 0; i < MOCK_ITERATIONS; i++) mockFn();
    return;
  }
  const validateFactory = resolveThunk(c.validate);
  if (!validateFactory) {
    throw new Error(`case ${c.title}: mockType needs paired validate thunk to validate`);
  }
  const isValid = validateFactory();
  for (let i = 0; i < MOCK_ITERATIONS; i++) {
    const generated = mockFn();
    const ok = isValid(generated);
    if (!ok) {
      throw new Error(
        `${c.title} [${label}]: iteration ${i} — generated value did not pass validate. value=${safeStringify(generated)}`
      );
    }
  }
}

/** Static form: createMockDataFn<T>(). **/
export function assertMockTypeStatic(c: AssertableCase): void {
  const factory = resolveThunk(c.mockType);
  if (!factory) return;
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'throw') {
    const mockFn = factory();
    expect(() => mockFn(), `${c.title} [static]: mock fn should throw`).toThrow();
    return;
  }
  runMockPass(c, factory(), 'static');
}

/** Reflect form: createMockDataFn(value). **/
export function assertMockTypeReflect(c: AssertableCase): void {
  const factory = resolveThunk(c.mockTypeReflect);
  if (!factory) return;
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'throw') {
    const mockFn = factory();
    expect(() => mockFn(), `${c.title} [reflect]: mock fn should throw`).toThrow();
    return;
  }
  runMockPass(c, factory(), 'reflect');
}

// =========================================================================
// format-validation getValidationErrors — 4 variants (static / reflect /
// deserialize-static / deserialize-reflect), all asserting the format payload
// =========================================================================

/** Shared core for the format-payload getValidationErrors asserts. All four forms
 *  resolve a getValidationErrors factory that differs ONLY in how T is supplied
 *  (type-first, reflected from a value, or rebuilt from compiled data) and assert
 *  the SAME format payload — proving a bounded/branded format survives every
 *  resolution path and still reports the same `format` error (name, optional `val`,
 *  optional `formatPath` tail) via the case's index-parallel `expectedFormatErrors`.
 *  Matches on the format payload, not a full RTValidationError deep-equal — robust
 *  against incidental fields in the envelope. **/
function assertFormatGetValidationErrorsVia(
  c: FormatValidationCase,
  thunk: ValidationCase['getValidationErrors'],
  label: string
): void {
  const factory = resolveThunk(thunk);
  if (!factory) return;
  if (!c.expectedFormatErrors) throw new Error(`case ${c.title}: missing expectedFormatErrors thunk`);

  const {valid, invalid} = c.getSamples();
  const expected = c.expectedFormatErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: expectedFormatErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  const getErr = factory();

  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title} [${label}]: valid[${i}] → no errors`).toEqual([]);
  });

  invalid.forEach((v, i) => {
    const errors = getErr(v);
    expect(errors.length, `${c.title} [${label}]: invalid[${i}] should produce at least one error`).toBeGreaterThan(0);

    const exp = expected[i];
    if (!exp) return;

    const formatErr = errors.find((entry) => entry.format?.name === exp.name)?.format;
    expect(formatErr, `${c.title} [${label}]: invalid[${i}] should carry a '${exp.name}' format error`).toBeDefined();

    if (exp.val !== undefined) {
      expect(formatErr?.val, `${c.title} [${label}]: invalid[${i}] format.val`).toEqual(exp.val);
    }
    if (exp.formatPathTail !== undefined) {
      const path = formatErr?.formatPath;
      expect(path?.[path.length - 1], `${c.title} [${label}]: invalid[${i}] format.formatPath tail`).toBe(exp.formatPathTail);
    }
  });
}

/** Static form — type-first `createGetValidationErrorsFn<Format…>()`. **/
export function assertFormatGetValidationErrorsStatic(c: FormatValidationCase): void {
  assertFormatGetValidationErrorsVia(c, c.getValidationErrors, 'format');
}
/** Reflect form — `createGetValidationErrorsFn(value)`, T inferred from a value. **/
export function assertFormatGetValidationErrorsReflect(c: FormatValidationCase): void {
  assertFormatGetValidationErrorsVia(c, c.getValidationErrorsReflect, 'format-reflect');
}
/** Deserialize-static form — getValidationErrors rebuilt from RTCompiledFnData.code. **/
export function assertFormatGetValidationErrorsDeserializeStatic(c: FormatValidationCase): void {
  assertFormatGetValidationErrorsVia(c, c.deserializeGetValidationErrors, 'format-deserialize-static');
}
/** Deserialize-reflect form. **/
export function assertFormatGetValidationErrorsDeserializeReflect(c: FormatValidationCase): void {
  assertFormatGetValidationErrorsVia(c, c.deserializeGetValidationErrorsReflect, 'format-deserialize-reflect');
}

// =========================================================================
// value-first-suite contract helper (kept as-is, consumed elsewhere)
// =========================================================================

/** Lightweight getValidationErrors contract used by the value-first suite: valid
 *  samples produce no errors, invalid samples produce at least one. A value-first
 *  leaf builder reflects the FORMAT of a type, so its error detail may carry
 *  metadata the bare type-first error doesn't — assert the contract, not a
 *  deep-equal against an expected-errors table (the validation suite pins those). **/
export function assertGetValidationErrorsContract(c: AssertableCase): void {
  const factory = resolveThunk(c.getValidationErrors);
  if (!factory) throw new Error(`case ${c.title}: missing getValidationErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const getErr = factory();
  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title} [getValidationErrors]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErr(v).length, `${c.title} [getValidationErrors]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
  });
}

// =========================================================================
// Standard Schema adapter — createStandardSchema<T>()
// =========================================================================

/** Exercises `createStandardSchema<T>()` against the case samples (single
 *  static form). Valid samples must come back as `{value}` with the input
 *  passed through BY REFERENCE (the adapter never strips/coerces); each invalid
 *  sample must come back as `{issues}` whose entries equal the expected
 *  consumer-facing issue list.
 *
 *  Expected issues per invalid value come from `getExpectedStandardErrors`
 *  (authored), else are DERIVED from `getExpectedErrors` via the same
 *  `runTypeErrorsToIssues` mapping the factory uses. Independently, when the
 *  case's static `getValidationErrors` resolves, a CONSISTENCY check asserts the
 *  adapter faithfully maps that validator's raw output — so every type is
 *  cross-checked even without an authored Standard expectation. **/
export function assertStandardSchema(c: AssertableCase): void {
  const factory = resolveThunk(c.standardSchema);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [standardSchema]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const validate = factory()['~standard'].validate;

  valid.forEach((v, i) => {
    const result = validate(v);
    if (result instanceof Promise) throw new Error(`${c.title} [standardSchema]: validate must be synchronous`);
    expect(result.issues, `${c.title} [standardSchema]: valid[${i}] → no issues`).toBeUndefined();
    // value is the input by reference (DataOnly is type-level only; nothing stripped).
    if (!result.issues) expect(result.value, `${c.title} [standardSchema]: valid[${i}] → value by reference`).toBe(v);
  });

  // Expected issues, one entry per invalid value: authored wins, else derive
  // from the raw expected errors.
  const expected = c.getExpectedStandardErrors
    ? c.getExpectedStandardErrors()
    : c.getExpectedErrors
      ? c.getExpectedErrors().map((errs) => runTypeErrorsToIssues(errs))
      : undefined;
  if (expected && expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedStandardErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  // Consistency source — the case's own static getValidationErrors, mapped the
  // same way the factory maps it.
  const getErrFactory = resolveThunk(c.getValidationErrors);
  const getErr = getErrFactory ? getErrFactory() : undefined;

  invalid.forEach((v, i) => {
    const result = validate(v);
    if (result instanceof Promise) throw new Error(`${c.title} [standardSchema]: validate must be synchronous`);
    expect(result.issues, `${c.title} [standardSchema]: invalid[${i}] → issues present`).toBeDefined();
    if (!result.issues) return;
    expect(result.issues.length, `${c.title} [standardSchema]: invalid[${i}] → ≥1 issue`).toBeGreaterThan(0);
    if (getErr) {
      expect(result.issues, `${c.title} [standardSchema]: invalid[${i}] consistency vs getValidationErrors`).toEqual(
        runTypeErrorsToIssues(getErr(v))
      );
    }
    if (expected) {
      expect(result.issues, `${c.title} [standardSchema]: invalid[${i}] expected issues`).toEqual(expected[i]);
    }
  });
}

// =========================================================================
// Friendly renderer coverage — createFriendlyText().errors()
// =========================================================================

/** The `failed` roles a Map / Set entry segment may carry. */
const FRIENDLY_FAILED_ROLES = new Set(['mapKey', 'mapValue', 'setKey']);

/** Every path-segment shape `createFriendlyText`'s descend() can route: an object
 *  field (string), an array / tuple index (number), or a Map / Set entry
 *  ({key: number, failed?}). A segment outside this set would dead-end in
 *  descend — the bug class that silently broke Map/Set and tuple rendering — so
 *  this guard fails loudly if the validator ever emits a new path-segment shape
 *  without createFriendlyText being taught to route it. **/
function assertFriendlySegment(seg: unknown, ctx: string): void {
  if (typeof seg === 'string' || typeof seg === 'number') return;
  if (seg && typeof seg === 'object') {
    const {key, failed} = seg as {key?: unknown; failed?: unknown};
    const okFailed = failed === undefined || (typeof failed === 'string' && FRIENDLY_FAILED_ROLES.has(failed));
    if (typeof key === 'number' && okFailed) return;
  }
  throw new Error(
    `${ctx}: unhandled friendly path segment ${safeStringify(seg)} — createFriendlyText.descend would dead-end; teach it this shape.`
  );
}

/** Suite-wide guard that EVERY type renders a friendly error. Runs the case's
 *  real `getValidationErrors` over each INVALID sample and checks the renderer
 *  copes with the output: (1) every path segment is a shape descend() routes
 *  (the census above), and (2) `createFriendlyText` emits exactly one non-empty
 *  message per error, with a string path, without throwing. Routing CORRECTNESS
 *  per category (object → field, array → rt$items, tuple → rt$slots, Map/Set →
 *  rt$keys/rt$values) is pinned in createFriendlyText.test.ts; this is the cross-suite
 *  net that no type produces an unrenderable error. **/
export function assertFriendlyCoverage(c: AssertableCase): void {
  const factory = resolveThunk(c.getValidationErrors);
  if (!factory) return;
  if (c.factoryThrows) return; // the factory itself throws — not a rendering concern
  const getErrors = factory() as (value: unknown) => RTValidationError[];
  // A bare map (only the required root meta, no field overrides): this net asserts
  // every type's errors render with pure fallback messages. `FriendlyText<unknown>`
  // reduces to `FriendlyMeta`, whose `rt$errors` needs the base `type` key (blank =
  // no custom message, everything falls to the generic fallback).
  const renderer = createFriendlyText<unknown>({rt$label: '', rt$errors: {type: ''}});
  const {invalid} = c.getSamples();
  invalid.forEach((sample, i) => {
    const errs = getErrors(sample);
    errs.forEach((err) => err.path.forEach((seg) => assertFriendlySegment(seg, `${c.title} [friendly]: invalid[${i}]`)));
    const messages = renderer.errors(errs);
    expect(messages, `${c.title} [friendly]: invalid[${i}] → one message per error`).toHaveLength(errs.length);
    messages.forEach((message, j) => {
      expect(typeof message.message, `${c.title} [friendly]: invalid[${i}] msg[${j}] is a string`).toBe('string');
      expect(message.message.length, `${c.title} [friendly]: invalid[${i}] msg[${j}] non-empty`).toBeGreaterThan(0);
      expect(typeof message.path, `${c.title} [friendly]: invalid[${i}] msg[${j}] path is a string`).toBe('string');
    });
  });
}
