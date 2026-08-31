import {
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createUnknownKeyErrorsFn,
  createValidateFn,
  type GetValidationErrorsFn,
} from '@ts-runtypes/core';

// STRICT VALIDATION — the `{checkUnknowns: true}` path: a value is accepted only
// if it validates AND carries no keys the type does not declare.
//
// The shapes mirror container/benchmarks/shared/cases/strict/index.ts case for
// case, so the suite table and the benchmark table line up and neither can drift
// into testing something the other does not measure. The benchmark tree is
// marker-free by design (competitors consume it), so the thunks live here.
//
// Each case carries BOTH the fused function and the two-call composition it
// replaces. That pairing is the point: the composition is the reference
// implementation users are migrating off, so every assertion below is a
// comparison rather than a hand-written expectation, and the two cannot drift
// apart silently.
//
// COVERAGE THAT MUST NOT BE LOST — the two emit paths:
//   - flat_required / nested_required / moltar_dto are all-required with no index
//     signature, which is exactly what countFastPathN demands before it emits the
//     O(1) `cntEK(v) === N` compare. Making any of them optional moves the case to
//     the other path and leaves the count check uncovered here.
//   - realworld_order carries an optional key, so it drops to the key-array scan.
//     That is the realistic shape and the path most real DTOs get.

/** One strict case: the samples, plus the fused functions and the composition
 *  they replace. Deliberately NOT the heavyweight ValidationCase contract — a
 *  compile-time flag has no mock / schema / value-first variants to cover, and
 *  requiring those thunks here would be noise rather than coverage. */
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
  /** The composition the fused pair replaces, for the parity oracle. */
  validate: () => (value: unknown) => boolean;
  hasUnknownKeys: () => (value: unknown) => boolean;
  errors: () => GetValidationErrorsFn;
  unknownKeyErrors: () => GetValidationErrorsFn;
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
    hasUnknownKeys: () => createHasUnknownKeysFn<StrictFlat>(),
    errors: () => createGetValidationErrorsFn<StrictFlat>(),
    unknownKeyErrors: () => createUnknownKeyErrorsFn<StrictFlat>(),
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
    hasUnknownKeys: () => createHasUnknownKeysFn<StrictNested>(),
    errors: () => createGetValidationErrorsFn<StrictNested>(),
    unknownKeyErrors: () => createUnknownKeyErrorsFn<StrictNested>(),
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
    hasUnknownKeys: () => createHasUnknownKeysFn<StrictMoltarDto>(),
    errors: () => createGetValidationErrorsFn<StrictMoltarDto>(),
    unknownKeyErrors: () => createUnknownKeyErrorsFn<StrictMoltarDto>(),
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
    hasUnknownKeys: () => createHasUnknownKeysFn<StrictOrder>(),
    errors: () => createGetValidationErrorsFn<StrictOrder>(),
    unknownKeyErrors: () => createUnknownKeyErrorsFn<StrictOrder>(),
  },
} as const satisfies Record<string, StrictCase>;
