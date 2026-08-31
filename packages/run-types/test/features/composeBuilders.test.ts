// End-to-end proof that the value-first COMPOSER + reflection builders lower to
// the same precompiled RunType graph the type-first surface produces. Each
// builder is fed to `createValidateFn` (schema form) and asserted against
// valid/invalid samples; convergence is asserted with `.toBe` against the
// equivalent `createValidateFn<T>()` (same structural id ⇒ same cached factory).
//
// Convergence cases deliberately use `boolean` / object-of-boolean / literals —
// kinds with NO format brand — so the value-first id equals the bare type-first
// id. (A `TF.string()` builder carries `TF.String<{}>`, which converges with
// `TF.String<{}>`, not the bare `string`; behaviour is identical either way.)

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
import {
  array,
  tuple,
  union,
  intersection,
  record,
  object,
  boolean,
  literal,
  regexp,
  circular,
  self,
  func,
  parameters,
  templateLiteral,
  optional,
  partial,
  required,
  pick,
  omit,
  exclude,
  extract,
  nonNullable,
  readonly,
  returnType,
} from '@mionjs/run-types/builders';
import '@mionjs/run-types/formats';

describe('compose builders — array', () => {
  it('validates and converges with the type-first array', () => {
    const isBoolArr = createValidateFn(array(boolean()));
    expect(isBoolArr([true, false])).toBe(true);
    expect(isBoolArr([])).toBe(true);
    expect(isBoolArr([true, 1])).toBe(false);
    expect(isBoolArr('nope')).toBe(false);
    // convergence: array(boolean()) ⇒ boolean[]
    expect(isBoolArr).toBe(createValidateFn<boolean[]>());
  });

  it('validates a string-format element array', () => {
    const isStrArr = createValidateFn(array(TF.string()));
    expect(isStrArr(['a', 'b'])).toBe(true);
    expect(isStrArr([1])).toBe(false);
  });
});

describe('compose builders — tuple', () => {
  it('validates a fixed [string, number] tuple', () => {
    const isPair = createValidateFn(tuple({required: [TF.string(), TF.number()]}));
    expect(isPair(['a', 1])).toBe(true);
    expect(isPair(['a', 'b'])).toBe(false);
    expect(isPair(['a'])).toBe(false);
    expect(isPair(['a', 1, 2])).toBe(false);
  });

  it('converges with the type-first tuple (boolean elements)', () => {
    expect(createValidateFn(tuple({required: [boolean(), boolean()]}))).toBe(createValidateFn<[boolean, boolean]>());
  });
});

describe('compose builders — tuple with rest', () => {
  it('validates [number, ...string[]]', () => {
    const isRest = createValidateFn(tuple({required: [TF.number()], rest: TF.string()}));
    expect(isRest([1])).toBe(true);
    expect(isRest([1, 'a', 'b'])).toBe(true);
    expect(isRest([1, 'a', 2])).toBe(false); // rest element must be string
    expect(isRest(['a'])).toBe(false); // first element must be number
    expect(isRest([])).toBe(false); // leading number is required
  });

  it('converges with the type-first rest tuple (boolean head + boolean rest)', () => {
    expect(createValidateFn(tuple({required: [boolean()], rest: boolean()}))).toBe(createValidateFn<[boolean, ...boolean[]]>());
  });
});

describe('compose builders — union', () => {
  it('validates and converges with the type-first union', () => {
    const isBoolOrLit = createValidateFn(union([boolean(), literal('x')]));
    expect(isBoolOrLit(true)).toBe(true);
    expect(isBoolOrLit('x')).toBe(true);
    expect(isBoolOrLit('y')).toBe(false);
    expect(isBoolOrLit(1)).toBe(false);
    // convergence: union([boolean(), literal('x')]) ⇒ boolean | 'x'
    expect(isBoolOrLit).toBe(createValidateFn<boolean | 'x'>());
  });

  it('validates a discriminated union of objects', () => {
    const isShape = createValidateFn(
      union([object({kind: literal('a'), n: TF.number()}), object({kind: literal('b'), s: TF.string()})])
    );
    expect(isShape({kind: 'a', n: 1})).toBe(true);
    expect(isShape({kind: 'b', s: 'hi'})).toBe(true);
    expect(isShape({kind: 'a', s: 'hi'})).toBe(false);
  });
});

describe('compose builders — intersection', () => {
  it('validates the merged object and converges', () => {
    const isMerged = createValidateFn(intersection(object({a: boolean()}), object({b: boolean()})));
    expect(isMerged({a: true, b: false})).toBe(true);
    expect(isMerged({a: true})).toBe(false);
    expect(isMerged({b: false})).toBe(false);
    // intersection collapses to the merged object {a: boolean; b: boolean}
    expect(isMerged).toBe(createValidateFn<{a: boolean; b: boolean}>());
  });
});

describe('compose builders — record', () => {
  it('validates a string-index record and converges', () => {
    const isRec = createValidateFn(record(boolean()));
    expect(isRec({x: true, y: false})).toBe(true);
    expect(isRec({})).toBe(true);
    expect(isRec({x: 1})).toBe(false);
    expect(isRec(null)).toBe(false);
    expect(isRec).toBe(createValidateFn<Record<string, boolean>>());
  });
});

describe('compose builders — object (now RunType<T>)', () => {
  it('validates via createValidateFn and converges with type-first', () => {
    const isObj = createValidateFn(object({a: boolean(), b: TF.number()}));
    expect(isObj({a: true, b: 1})).toBe(true);
    expect(isObj({a: true, b: 'x'})).toBe(false);
    expect(isObj({a: true})).toBe(false);
    // the object-of-boolean half converges with the bare type-first object
    expect(createValidateFn(object({a: boolean()}))).toBe(createValidateFn<{a: boolean}>());
  });
});

describe('leaf builders — literal / regexp', () => {
  it('literal(value) validates and converges per literal kind', () => {
    expect(createValidateFn(literal('a'))('a')).toBe(true);
    expect(createValidateFn(literal('a'))('b')).toBe(false);
    expect(createValidateFn(literal(true))(true)).toBe(true);
    expect(createValidateFn(literal(true))(false)).toBe(false);
    expect(createValidateFn(literal(42))(42)).toBe(true);
    expect(createValidateFn(literal(42))(43)).toBe(false);
    // convergence with the type-first literal types
    expect(createValidateFn(literal('a'))).toBe(createValidateFn<'a'>());
    expect(createValidateFn(literal(true))).toBe(createValidateFn<true>());
  });

  it('regexp() validates RegExp instances and converges', () => {
    const isRe = createValidateFn(regexp());
    expect(isRe(/x/)).toBe(true);
    expect(isRe('x')).toBe(false);
    expect(isRe).toBe(createValidateFn<RegExp>());
  });
});

describe('compose builders — null member survives composition (InferType carrier)', () => {
  // Regression: a bare-`T` carrier + `NonNullable` collapsed `literal(null)` to
  // `never`, silently dropping the null arm/slot/prop from union/tuple/object.
  it('union keeps the literal(null) arm and converges', () => {
    const isBoolOrNull = createValidateFn(union([boolean(), literal(null)]));
    expect(isBoolOrNull(true)).toBe(true);
    expect(isBoolOrNull(null)).toBe(true);
    expect(isBoolOrNull(undefined)).toBe(false);
    expect(isBoolOrNull).toBe(createValidateFn<boolean | null>());
  });

  it('object keeps a null-typed property', () => {
    const isObj = createValidateFn(object({a: literal(null), b: boolean()}));
    expect(isObj({a: null, b: true})).toBe(true);
    expect(isObj({a: undefined, b: true})).toBe(false);
    expect(isObj).toBe(createValidateFn<{a: null; b: boolean}>());
  });

  it('tuple keeps a null slot', () => {
    const isTup = createValidateFn(tuple({required: [boolean(), literal(null)]}));
    expect(isTup([true, null])).toBe(true);
    expect(isTup([true, undefined])).toBe(false);
    expect(isTup).toBe(createValidateFn<[boolean, null]>());
  });
});

describe('compose builders — circular (recursive self-reference)', () => {
  it('validates a recursive linked-list node', () => {
    const LNodeSchema = circular(object({value: TF.number(), next: union([self(), literal(null)])}));
    const isNode = createValidateFn(LNodeSchema);
    expect(isNode({value: 1, next: null})).toBe(true);
    expect(isNode({value: 1, next: {value: 2, next: null}})).toBe(true);
    expect(isNode({value: 1, next: {value: 2, next: {value: 3, next: null}}})).toBe(true);
    expect(isNode({value: 1, next: {value: 'x', next: null}})).toBe(false); // nested value wrong type
    expect(isNode({value: 1})).toBe(false); // missing next
  });
});

describe('compose builders — getValidationErrors schema form', () => {
  it('createGetValidationErrorsFn returns [] for valid, non-empty for invalid', () => {
    const errs = createGetValidationErrorsFn(array(boolean()));
    expect(errs([true, false])).toEqual([]);
    expect(errs([1]).length).toBeGreaterThan(0);
  });
});

describe('compose builders — parameters (Parameters<F>) + func tuple-overload', () => {
  it('extracts a fixed param tuple and converges (brand-free)', () => {
    const isPair = createValidateFn(parameters(func({params: [boolean(), boolean()]})));
    expect(isPair([true, false])).toBe(true);
    expect(isPair([true])).toBe(false);
    expect(isPair([true, 1])).toBe(false);
    expect(isPair('nope')).toBe(false);
    expect(isPair).toBe(createValidateFn<[boolean, boolean]>());
  });

  it('keeps a trailing-optional param via the func tuple-overload and converges', () => {
    const isOpt = createValidateFn(parameters(func({params: tuple({required: [boolean()], optional: [boolean()]})})));
    expect(isOpt([true])).toBe(true);
    expect(isOpt([true, false])).toBe(true);
    expect(isOpt([true, 1])).toBe(false);
    expect(isOpt).toBe(createValidateFn<[boolean, boolean?]>());
  });

  it('keeps a rest param via the func tuple-overload (behavioral — mirrors the wired case)', () => {
    // Head ≠ rest type (number head, string rest) so the rest segment is exercised
    // distinctly; TF.number()/TF.string() carry a format brand so this asserts behavior,
    // not `.toBe`. Same shape the call_signature_params_with_rest case proves.
    const isRest = createValidateFn(parameters(func({params: tuple({required: [TF.number()], rest: TF.string()})})));
    expect(isRest([1])).toBe(true); // head only, zero rest
    expect(isRest([1, 'a', 'b'])).toBe(true);
    expect(isRest([1, 'a', 2])).toBe(false); // rest element must be string
    expect(isRest(['a'])).toBe(false); // head must be number
  });

  it('validates realistic (branded) params behaviorally — mirrors call_signature_params', () => {
    const isArgs = createValidateFn(parameters(func({params: [TF.number(), boolean()], ret: TF.string()})));
    expect(isArgs([1, true])).toBe(true);
    expect(isArgs([1, 'no'])).toBe(false);
    expect(isArgs(['no', true])).toBe(false);
  });
});

describe('compose builders — record key (string | number | template-literal)', () => {
  it('validates a template-literal-keyed record and converges', () => {
    const isApi = createValidateFn(record(templateLiteral(['api/', TF.string()]), boolean()));
    expect(isApi({'api/users': true})).toBe(true);
    expect(isApi({})).toBe(true);
    expect(isApi({'api/users': 1})).toBe(false); // value must be boolean
    expect(isApi({nope: true})).toBe(false); // key must match the `api/${string}` pattern
    expect(isApi).toBe(createValidateFn<Record<`api/${string}`, boolean>>());
  });
});

describe('utility builders — convergence with type-first', () => {
  // Each utility builder brands the RESOLVED stdlib utility type, so `.toBe`
  // (reference identity ⇒ same structural id) proves `createValidateFn(partial(model))`
  // lands on the SAME cached factory as the type-first `createValidateFn<Partial<T>>()`.
  // Brand-free kinds (boolean / literals) so the value-first id equals the BARE
  // type-first id — a `TF.string()`/`TF.number()`/`date()` builder carries `FormatX<{}>`,
  // which converges with `FormatX<{}>`, not the bare kind (see header).
  it('partial(model) converges with Partial<T>', () => {
    expect(createValidateFn(partial(object({a: boolean(), b: boolean()})))).toBe(
      createValidateFn<Partial<{a: boolean; b: boolean}>>()
    );
  });

  it('required(model) converges with Required<T>', () => {
    expect(createValidateFn(required(object({a: optional(boolean()), b: optional(boolean())})))).toBe(
      createValidateFn<Required<{a?: boolean; b?: boolean}>>()
    );
  });

  it('pick(model, keys) converges with Pick<T, K>', () => {
    expect(createValidateFn(pick(object({a: boolean(), b: boolean()}), ['a']))).toBe(
      createValidateFn<Pick<{a: boolean; b: boolean}, 'a'>>()
    );
  });

  it('omit(model, keys) converges with Omit<T, K>', () => {
    expect(createValidateFn(omit(object({a: boolean(), b: boolean()}), ['a']))).toBe(
      createValidateFn<Omit<{a: boolean; b: boolean}, 'a'>>()
    );
  });

  it('exclude(union, removed) converges with Exclude<U, X>', () => {
    expect(createValidateFn(exclude(union([literal('x'), literal('y'), literal('z')]), literal('y')))).toBe(
      createValidateFn<Exclude<'x' | 'y' | 'z', 'y'>>()
    );
  });

  it('extract(union, extracted) converges with Extract<U, X>', () => {
    expect(
      createValidateFn(extract(union([literal('x'), literal('y'), literal('z')]), union([literal('x'), literal('z')])))
    ).toBe(createValidateFn<Extract<'x' | 'y' | 'z', 'x' | 'z'>>());
  });

  it('nonNullable(union) converges with NonNullable<T>', () => {
    expect(createValidateFn(nonNullable(union([boolean(), literal(null), literal(undefined)])))).toBe(
      createValidateFn<NonNullable<boolean | null | undefined>>()
    );
  });

  it('readonly(model) converges with Readonly<T>', () => {
    expect(createValidateFn(readonly(object({a: boolean(), b: boolean()})))).toBe(
      createValidateFn<Readonly<{a: boolean; b: boolean}>>()
    );
  });

  it('returnType(fn) converges with ReturnType<F>', () => {
    expect(createValidateFn(returnType(func({params: [boolean()], ret: boolean()})))).toBe(
      createValidateFn<ReturnType<(a: boolean) => boolean>>()
    );
  });

  it('intersection(partial, required(pick)) converges (composite, mirrors intersection_with_required_override)', () => {
    const model = () => object({a: boolean(), b: boolean()});
    expect(createValidateFn(intersection(partial(model()), required(pick(model(), ['a']))))).toBe(
      createValidateFn<Partial<{a: boolean; b: boolean}> & Required<Pick<{a: boolean; b: boolean}, 'a'>>>()
    );
  });
});
