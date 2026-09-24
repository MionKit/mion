import {
  createGetValidationErrorsFn,
  createValidateFn,
  type GetValidationErrorsFn,
  type RTValidationError,
} from '@mionjs/run-types';

// STRICT VALIDATION — the `{checkUnknowns: true}` path: a value is accepted only
// if it validates AND carries no keys the type does not declare.
//
// The shapes mirror container/benchmarks/shared/cases/strict/index.ts case for
// case, so the suite table and the benchmark table line up and neither can drift
// into testing something the other does not measure. The benchmark tree is
// marker-free by design (competitors consume it), so the thunks live here.
//
// Each case carries the fused functions, the plain validators, and the keys the
// type declares. The plain report plus `undeclaredKeyErrors` over those keys is
// an independent reference for the fused report, so every assertion is a
// comparison rather than a hand-written expectation per sample.
//
// COVERAGE THAT MUST NOT BE LOST — the two emit paths:
//   - flat_required / nested_required / moltar_dto are all-required with no index
//     signature, which is exactly what countFastPathN demands before it emits the
//     O(1) `cntEK(v) === N` compare. Making any of them optional moves the case to
//     the other path and leaves the count check uncovered here.
//   - realworld_order carries an optional key, so it drops to the key-array scan.
//     That is the realistic shape and the path most real DTOs get.

/** The keys a type declares, for the in-test reference: `null` is a leaf, a nested
 *  object declares its own keys, and a one-element array declares its element. **/
export type DeclaredKeys = {readonly [key: string]: DeclaredKeys | null} | readonly [DeclaredKeys];

/** Reference report: one `{expected: 'never'}` per key `declared` leaves out, at any
 *  depth. A non-object, or an array where an object is declared, has no undeclared
 *  keys; its shape is the plain report's business. **/
export function undeclaredKeyErrors(value: unknown, declared: DeclaredKeys, path: (string | number)[] = []): RTValidationError[] {
  if (Array.isArray(declared)) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => undeclaredKeyErrors(item, declared[0], [...path, index]));
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const props = declared as {readonly [key: string]: DeclaredKeys | null};
  const errors: RTValidationError[] = [];
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(props, key)) errors.push({path: [...path, key], expected: 'never'});
    else if (props[key] !== null)
      errors.push(...undeclaredKeyErrors((value as Record<string, unknown>)[key], props[key], [...path, key]));
  }
  return errors;
}

/** One strict case: the samples, the fused functions, and the reference pieces
 *  they are checked against. Deliberately NOT the heavyweight ValidationCase
 *  contract: a compile-time flag has no mock / schema / value-first variants to
 *  cover, and requiring those thunks here would be noise rather than coverage. */
export interface StrictCase {
  title: string;
  description: string;
  /** Values the type accepts AND that carry no undeclared keys. */
  valid: unknown[];
  /** Values that must be rejected, each for a stated reason (see the inline
   *  comments per case — a type error, a missing key, or an undeclared one). */
  invalid: unknown[];
  /** `createValidateFn<T>(undefined, {checkUnknowns: true})`. */
  validateStrict: () => (value: unknown) => boolean;
  /** `createGetValidationErrorsFn<T>(undefined, {checkUnknowns: true})`. */
  errorsStrict: () => GetValidationErrorsFn;
  /** The plain validators: the type half of the reference. */
  validate: () => (value: unknown) => boolean;
  errors: () => GetValidationErrorsFn;
  /** The keys `T` declares, the undeclared-key half of the reference. For a
   *  union it is the merged allowlist: every key ANY member declares. */
  declaredKeys: DeclaredKeys;
  /** Set where the fused answer deliberately differs from the reference, so the
   *  parity assertions are replaced by an explicit divergence assertion rather
   *  than silently relaxed. Unions are the only such shape: the merged allowlist
   *  cannot tell which member a value matched, while the fused validator
   *  inherits validate's OR chain and answers per branch. */
  divergesFromReference?: true;
}

export interface StrictFlat {
  id: number;
  name: string;
  active: boolean;
}

export interface StrictNested {
  name: string;
  inner: {x: number; y: string};
}

/** The moltar/typescript-runtime-type-benchmarks DTO, measured on the strict
 *  path in the benchmark as `assertStrict`. */
export interface StrictMoltarDto {
  number: number;
  negNumber: number;
  maxNumber: number;
  string: string;
  longString: string;
  boolean: boolean;
  deeplyNested: {foo: string; num: number; bool: boolean};
}

/** REALWORLD.order's shape, unchanged: a nested object, an array of objects, a
 *  second nested object, a union, and one OPTIONAL key — the optional is what
 *  puts this case on the key-array scan rather than the count fast path. */
export interface StrictOrder {
  id: string;
  customer: {id: number; email: string};
  items: {sku: string; name: string; qty: number; price: number}[];
  shipping: {street: string; city: string; state: string; zip: string; country: string};
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
}

const LONG_STRING =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vulputate elit, ' +
  'sed sagittis metus. Nullam consequat, ex ac dignissim commodo, eros nulla ' +
  'consequat lacus, nec facilisis nisi lorem sed ligula.';

const okFlat: StrictFlat = {id: 1, name: 'Ann', active: true};
const okNested: StrictNested = {name: 'n', inner: {x: 1, y: 'y'}};
const okMoltar: StrictMoltarDto = {
  number: 1,
  negNumber: -1,
  maxNumber: Number.MAX_VALUE,
  string: 'string',
  longString: LONG_STRING,
  boolean: true,
  deeplyNested: {foo: 'bar', num: 1, bool: false},
};
const okOrder: StrictOrder = {
  id: 'ord-1',
  customer: {id: 7, email: 'buyer@example.com'},
  items: [
    {sku: 'A-1', name: 'Widget', qty: 2, price: 9.5},
    {sku: 'B-2', name: 'Gadget', qty: 1, price: 24},
  ],
  shipping: {street: '1 Main St', city: 'Lisbon', state: 'LX', zip: '1000-001', country: 'PT'},
  status: 'paid',
  total: 43,
};

/** A discriminated union. Each member closes over ITS OWN keys under the fused
 *  validator, which is where it parts company with the merged allowlist. */
export interface StrictCircle {
  kind: 'circle';
  radius: number;
}
export interface StrictSquare {
  kind: 'square';
  side: number;
}
export type StrictShape = StrictCircle | StrictSquare;

/** The same question with no discriminant to lean on. */
export type StrictEither = {a: string} | {b: number};

export const STRICT = {
  flat_required: {
    title: 'Flat all-required object (strict)',
    description: 'Three required scalar properties. Accepted only when the key set matches the type exactly.',
    valid: [okFlat, {id: 2, name: '', active: false}],
    invalid: [
      {...okFlat, extra: 1}, // the case this group exists for: valid shape, one undeclared key
      {id: 1, name: 'Ann'}, // missing a required key
      {...okFlat, id: '1'}, // wrong type
      {id: 1, name: 'Ann', wrong: true}, // swapped key — same COUNT as the type, different names
      null,
      'not-an-object',
    ],
    validateStrict: () => createValidateFn<StrictFlat>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictFlat>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictFlat>(),
    errors: () => createGetValidationErrorsFn<StrictFlat>(),
    declaredKeys: {id: null, name: null, active: null},
  },

  nested_required: {
    title: 'Nested all-required object (strict)',
    description: 'A required nested object. Undeclared keys are rejected at the root and inside the nested value alike.',
    valid: [okNested, {name: '', inner: {x: -0.5, y: ''}}],
    invalid: [
      {...okNested, extra: 1}, // undeclared key at the root
      {name: 'n', inner: {x: 1, y: 'y', extra: 1}}, // undeclared key NESTED — the check runs per object
      {name: 'n', inner: {x: 1}}, // missing nested key
      {name: 'n', inner: {x: 1, y: 2}}, // wrong nested type
      null,
      'not-an-object',
    ],
    validateStrict: () => createValidateFn<StrictNested>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictNested>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictNested>(),
    errors: () => createGetValidationErrorsFn<StrictNested>(),
    declaredKeys: {name: null, inner: {x: null, y: null}},
  },

  moltar_dto: {
    title: 'Moltar benchmark DTO (strict)',
    description:
      'The flat scalar record with one nested object from the published typescript-runtime-type-benchmarks comparison, on the strict path.',
    valid: [okMoltar, {...okMoltar, number: 0, boolean: false, deeplyNested: {foo: '', num: -0.5, bool: true}}],
    invalid: [
      {...okMoltar, extra: 1},
      {...okMoltar, deeplyNested: {foo: 'bar', num: 1, bool: false, extra: 1}},
      {...okMoltar, number: '1'},
      {...okMoltar, deeplyNested: {foo: 'bar', num: 1}},
      null,
      'not-an-object',
    ],
    validateStrict: () => createValidateFn<StrictMoltarDto>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictMoltarDto>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictMoltarDto>(),
    errors: () => createGetValidationErrorsFn<StrictMoltarDto>(),
    declaredKeys: {
      number: null,
      negNumber: null,
      maxNumber: null,
      string: null,
      longString: null,
      boolean: null,
      deeplyNested: {foo: null, num: null, bool: null},
    },
  },

  realworld_order: {
    title: 'Real-world order DTO (strict)',
    description:
      'A nested order: customer, an items array, a shipping address, a status union and one optional note. Every level is closed, so an undeclared key anywhere is a rejection.',
    // The optional `note` is a DECLARED key, so present and absent are both
    // valid. That pair is what says strict means "no undeclared keys", not
    // "all required".
    valid: [okOrder, {...okOrder, note: 'leave at the door', status: 'shipped'}],
    invalid: [
      {...okOrder, extra: 1}, // undeclared key at the root
      {...okOrder, customer: {id: 7, email: 'buyer@example.com', extra: 1}}, // undeclared key in the nested object
      {...okOrder, items: [{sku: 'A-1', name: 'Widget', qty: 2, price: 9.5, extra: 1}]}, // undeclared key inside an array element
      {...okOrder, shipping: {...okOrder.shipping, extra: 1}}, // undeclared key in the second nested object
      {
        customer: okOrder.customer,
        items: okOrder.items,
        shipping: okOrder.shipping,
        status: okOrder.status,
        total: okOrder.total,
      }, // missing required `id`
      {...okOrder, total: '43'}, // wrong type
      {...okOrder, status: 'refunded'}, // outside the union
      null,
      'not-an-object',
    ],
    validateStrict: () => createValidateFn<StrictOrder>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictOrder>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictOrder>(),
    errors: () => createGetValidationErrorsFn<StrictOrder>(),
    declaredKeys: {
      id: null,
      customer: {id: null, email: null},
      items: [{sku: null, name: null, qty: null, price: null}],
      shipping: {street: null, city: null, state: null, zip: null, country: null},
      status: null,
      total: null,
      note: null,
    },
  },

  union_discriminated: {
    title: 'Discriminated union of objects (strict)',
    description:
      'Circle or Square, told apart by `kind`. The fused validator closes each branch over its own keys, so a circle carrying `side` is rejected even though `side` is declared somewhere in the union.',
    valid: [
      {kind: 'circle', radius: 1},
      {kind: 'square', side: 2},
    ],
    invalid: [
      {kind: 'circle', radius: 1, extra: true}, // a key no member declares
      {kind: 'circle', radius: 1, side: 2}, // the OTHER member's key
      {kind: 'square', side: 2, radius: 1}, // the same, the other way round
      {kind: 'triangle', base: 1}, // outside the union
      {kind: 'circle'}, // missing its own property
      {kind: 'circle', radius: 'big'}, // wrong type
      null,
      'not-an-object',
    ],
    divergesFromReference: true,
    validateStrict: () => createValidateFn<StrictShape>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictShape>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictShape>(),
    errors: () => createGetValidationErrorsFn<StrictShape>(),
    declaredKeys: {kind: null, radius: null, side: null},
  },

  union_open: {
    title: 'Union of objects with no discriminant (strict)',
    description:
      "The same question with nothing to tell the branches apart. A value carrying both members' keys matches neither branch cleanly, so it is rejected.",
    valid: [{a: 'x'}, {b: 1}],
    invalid: [
      {a: 'x', c: 1}, // a key no member declares
      {a: 'x', b: 1}, // both members' keys at once
      {a: 1}, // wrong type
      {}, // matches no member
      null,
      'not-an-object',
    ],
    divergesFromReference: true,
    validateStrict: () => createValidateFn<StrictEither>(undefined, {checkUnknowns: true}),
    errorsStrict: () => createGetValidationErrorsFn<StrictEither>(undefined, {checkUnknowns: true}),
    validate: () => createValidateFn<StrictEither>(),
    errors: () => createGetValidationErrorsFn<StrictEither>(),
    declaredKeys: {a: null, b: null},
  },
} as const satisfies Record<string, StrictCase>;
