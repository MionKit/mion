// STRICT — the full strict path: a value is accepted only if it validates AND
// carries no keys the type does not declare.
//
// Why this group exists as its own suite rather than a flag on the others: it is
// the ONLY group that reaches the `runsAfterValidation` key-count fast path, and
// therefore the only one that exercises `rt::countEnumKeys` — the pure fn that
// picks a different counter per JavaScript engine (`for-in` on V8, a
// prototype-guarded `Object.keys` on JavaScriptCore). Without these cases the
// benchmark suite never calls that code at all, so running the suite under Bun
// would prove nothing about the branch. See docs/done/bun-benchmark-lane.md.
//
// The group is deliberately cross-library, not a RunTypes vanity group: closedness
// is expressible by every competitor here (TypeBox `additionalProperties: false`,
// zod `strictObject`, ajv `additionalProperties: false`, typia `createEquals`), so
// the numbers compare like for like.
//
// The shapes here are mirrored case-for-case by the test suite at
// packages/ts-runtypes/test/suites/strict-validation/, which drives them through
// the real factories (this tree stays marker-free so competitors can consume it).
// Keep the two in step: a case added on one side belongs on the other.
//
// STRICT MEANS NO UNDECLARED KEYS. It does NOT mean all-required. Every case here
// composes `validate(v) && !hasUnknownKeys(v)`, which is what a cross-library
// comparison needs — the competitors express closedness that way too. RunTypes
// now also has a single-function form (`{checkUnknowns: true}`), measured
// separately rather than here, so this group keeps comparing like for like.
// What an optional property DOES change is which code path runs, and this group
// covers both on purpose:
//   - flat_required / nested_required / moltar_dto are all-required with no index
//     signature, the exact eligibility `countFastPathN` demands before it emits the
//     `cntEK(v) !== N` count check. Keep them that way or the per-engine counter loses
//     its only coverage.
//   - realworld_order carries an optional key, so it drops to the key-array scan. That
//     is the point: it is the realistic shape, and the scan is what most real DTOs get.

import type {SharedCase} from '../types.ts';

// ── Types (imported by the ts-runtypes / typia competitors) ──────────────────

export interface StrictFlat {
  id: number;
  name: string;
  active: boolean;
}

export interface StrictNested {
  name: string;
  inner: {x: number; y: string};
}

/** The moltar/typescript-runtime-type-benchmarks DTO, same shape as
 *  REALWORLD.toBeChecked — measured here on the strict path, which is the mode
 *  their `assertStrict` case reports. */
export interface StrictMoltarDto {
  number: number;
  negNumber: number;
  maxNumber: number;
  string: string;
  longString: string;
  boolean: boolean;
  deeplyNested: {foo: string; num: number; bool: boolean};
}

/** REALWORLD.order's shape, unchanged, measured on the strict path — the realistic
 *  end of this group: a nested object, an array of objects, a second nested object,
 *  a union, and one OPTIONAL key. The optional is what puts this case on the
 *  key-array scan instead of the count fast path. */
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

// ── Cases ────────────────────────────────────────────────────────────────────

export const STRICT = {
  flat_required: {
    title: 'Flat all-required object (strict)',
    description: 'Three required scalar properties. Accepted only when the key set matches the type exactly.',
    getSamples: () => {
      const ok: StrictFlat = {id: 1, name: 'Ann', active: true};
      return {
        valid: [ok, {id: 2, name: '', active: false}],
        invalid: [
          {...ok, extra: 1}, // the case this group exists for: structurally valid, one undeclared key
          {id: 1, name: 'Ann'}, // missing a required key
          {...ok, id: '1'}, // wrong type
          {id: 1, name: 'Ann', wrong: true}, // swapped key — same COUNT as the type, different names
          null,
          'not-an-object',
        ],
      };
    },
  },

  nested_required: {
    title: 'Nested all-required object (strict)',
    description: 'A required nested object. Undeclared keys are rejected at the root and inside the nested value alike.',
    getSamples: () => {
      const ok: StrictNested = {name: 'n', inner: {x: 1, y: 'y'}};
      return {
        valid: [ok, {name: '', inner: {x: -0.5, y: ''}}],
        invalid: [
          {...ok, extra: 1}, // undeclared key at the root
          {name: 'n', inner: {x: 1, y: 'y', extra: 1}}, // undeclared key NESTED — the count check runs per object
          {name: 'n', inner: {x: 1}}, // missing nested key
          {name: 'n', inner: {x: 1, y: 2}}, // wrong nested type
          null,
          'not-an-object',
        ],
      };
    },
  },

  moltar_dto: {
    title: 'Moltar benchmark DTO (strict)',
    description:
      'The flat scalar record with one nested object from the published typescript-runtime-type-benchmarks comparison, measured on the strict path.',
    getSamples: () => {
      const ok: StrictMoltarDto = {
        number: 1,
        negNumber: -1,
        maxNumber: Number.MAX_VALUE,
        string: 'string',
        longString: LONG_STRING,
        boolean: true,
        deeplyNested: {foo: 'bar', num: 1, bool: false},
      };
      return {
        valid: [ok, {...ok, number: 0, boolean: false, deeplyNested: {foo: '', num: -0.5, bool: true}}],
        invalid: [
          {...ok, extra: 1},
          {...ok, deeplyNested: {foo: 'bar', num: 1, bool: false, extra: 1}},
          {...ok, number: '1'},
          {...ok, deeplyNested: {foo: 'bar', num: 1}},
          null,
          'not-an-object',
        ],
      };
    },
  },

  realworld_order: {
    title: 'Real-world order DTO (strict)',
    description:
      'A nested order: customer, an items array, a shipping address, a status union and one optional note. Every level is closed, so an undeclared key anywhere is a rejection.',
    getSamples: () => {
      const ok: StrictOrder = {
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
      return {
        // The optional `note` is a DECLARED key, so present and absent are both valid.
        // That pair is what says strict means "no undeclared keys", not "all required".
        valid: [ok, {...ok, note: 'leave at the door', status: 'shipped'}],
        invalid: [
          {...ok, extra: 1}, // undeclared key at the root
          {...ok, customer: {id: 7, email: 'buyer@example.com', extra: 1}}, // undeclared key in the nested object
          {...ok, items: [{sku: 'A-1', name: 'Widget', qty: 2, price: 9.5, extra: 1}]}, // undeclared key inside an array element
          {...ok, shipping: {...ok.shipping, extra: 1}}, // undeclared key in the second nested object
          {customer: ok.customer, items: ok.items, shipping: ok.shipping, status: ok.status, total: ok.total}, // missing the required `id`
          {...ok, total: '43'}, // wrong type
          {...ok, status: 'refunded'}, // outside the union
          null,
          'not-an-object',
        ],
      };
    },
  },
} as const satisfies Record<string, SharedCase>;
