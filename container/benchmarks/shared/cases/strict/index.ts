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
// Every case is all-required with no index signature — the exact eligibility
// `countFastPathN` demands before it emits the count check instead of the
// key-array scan. An OPTIONAL property anywhere would silently drop the case back
// to the scan and quietly remove the coverage this group is for.

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
} as const satisfies Record<string, SharedCase>;
