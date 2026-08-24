import type {SharedCase} from '../types.ts';

export const UTILITY = {
  partial: {
    title: 'Partial<T> — all props become optional',
    description:
      'utility/partial.spec.ts — all properties become optional. Resolves to {name?: string; age?: number; createdAt?: Date}; reuses the object emit with allOptionalCode array-rejection guard.',
    getSamples: () => ({
      valid: [{}, {name: 'John'}, {createdAt: new Date()}, {name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        [], // allOptionalCode rejects arrays
        new Date(), // allOptionalCode rejects native objects
        {name: 42}, // wrong type when prop is present
        {createdAt: 'not date'},
        null,
        undefined,
        {createdAt: new Date('invalid')}, // Invalid Date in optional prop
        new Map(),
        new Set(),
        {age: NaN}, // NaN at optional number
      ],
    }),
  },
  required: {
    title: 'Required<T> — all optional props become required',
    description:
      'utility/required.spec.ts — all properties become required. Resolves to a plain object literal; reuses the object emit.',
    getSamples: () => ({
      valid: [{name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        {},
        {name: 'John'}, // missing age + createdAt
        {name: 'John', age: 30}, // missing createdAt
        {name: 'John', age: 30, createdAt: 'not date'}, // wrong type
        null,
        undefined,
        {name: 'John', age: NaN, createdAt: new Date()}, // NaN at age
        {name: 'John', age: 30, createdAt: new Date('invalid')}, // Invalid Date
      ],
    }),
  },
  pick: {
    title: 'Pick<T, K> — keeps only the named properties',
    description: 'utility/pick.spec.ts — selects a subset of properties. Resolves to {name: string; createdAt: Date}.',
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        // Extra props pass (Pick doesn't imply strict)
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {name: 'John'}, // missing createdAt
        {createdAt: new Date()}, // missing name
        {name: 42, createdAt: new Date()},
        null,
        undefined,
        {name: 'John', createdAt: new Date('invalid')},
      ],
    }),
  },
  omit: {
    title: 'Omit<T, K> — drops the named properties',
    description: 'utility/omit.spec.ts — removes selected properties. Resolves to {name: string; createdAt: Date}.',
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()}, // extra prop still passes
      ],
      invalid: [{name: 'John'}, {createdAt: new Date()}, null, undefined, {name: 'John', createdAt: new Date('invalid')}],
    }),
  },
  exclude_atomic: {
    title: 'Exclude<U, X> on a string-literal union',
    description: 'utility/exclude.spec.ts (atomic case) — excludes union members. Resolves to "name" | "createdAt".',
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', 42, null, undefined, true, '', 'Name'],
    }),
  },
  extract_atomic: {
    title: 'Extract<U, X> on a string-literal union',
    description:
      'utility/extract.spec.ts (atomic case) — extracts matching union members. Resolves to "name" | "createdAt".',
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', null, undefined, true, 42, '', 'Name'],
    }),
  },
  exclude_from_object_union: {
    title: 'Exclude<U, X> on a discriminated object union',
    description: 'utility/exclude.spec.ts (object union) — excludes object members from a discriminated union.',
    getSamples: () => ({
      valid: [
        {kind: 'square', x: 5},
        {kind: 'triangle', base: 4, height: 3},
      ],
      invalid: [
        {kind: 'circle', radius: 3},
        {},
        null,
        undefined,
        {kind: 'square'}, // missing x
        {kind: 'square', x: NaN}, // NaN at x
        {kind: 'triangle', base: 4}, // missing height
      ],
    }),
  },
  non_nullable: {
    title: 'NonNullable<T> — strips null and undefined from a union',
    description: 'utility/nonNullable.spec.ts — removes null + undefined from a union.',
    getSamples: () => ({
      valid: ['hello', 42, 0],
      invalid: [null, undefined, true, {}, [], NaN, Infinity],
    }),
  },
  return_type: {
    title: 'ReturnType<F> — extracts the return type of a function',
    description: "utility/params-return.spec.ts — extracts a function's return type. Resolves to Date.",
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['not date', 42, null, undefined, new Date('invalid'), new Date(NaN), {}, []],
    }),
  },
  readonly: {
    title: 'Readonly<T> — readonly bit erased at runtime',
    description:
      'Readonly<T> marks properties readonly at the TS layer; the readonly bit is erased at runtime so the validator behaves identically to the source object. Regression check.',
    getSamples: () => ({
      valid: [
        {name: 'John', age: 30},
        {name: '', age: 0},
      ],
      invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}, {name: 'John', age: NaN}],
    }),
  },
  intersection_with_required_override: {
    title: 'Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)',
    description:
      'Intersection that flips a property\'s optionality — `Partial<Person>` makes all props optional, then `& Required<Pick<Person, "name">>` re-requires only `name`. tsgo resolves the intersection to {name: string; age?: number; createdAt?: Date}; reuses the object emit.',
    getSamples: () => ({
      valid: [
        {name: 'John'},
        {name: 'John', age: 30},
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {}, // name is required
        {age: 30}, // name still required
        {name: 42}, // wrong type
        {name: 'John', age: '30'}, // wrong type at optional slot
        null,
        undefined,
        {name: 'John', age: NaN}, // NaN at optional
        {name: 'John', createdAt: new Date('invalid')}, // Invalid Date in optional
      ],
    }),
  },
  omit_keeping_optional: {
    title: 'Omit<T, K> preserves optionality of remaining props',
    description: 'Omit preserves the optionality of remaining properties — resolves to {b?: number; c: boolean}.',
    getSamples: () => ({
      valid: [{c: true}, {b: 1, c: false}, {c: true, b: undefined}],
      invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: true, b: NaN}, {c: 0}, {b: 1, c: 1}],
    }),
  },
  keyof_to_literal_union: {
    title: 'keyof T — resolves to a union of string-literal keys',
    description:
      '`keyof Person` where Person has `name: string; age: number; createdAt: Date` resolves to the union `"name" | "age" | "createdAt"`. The validator is the union of three string literals.',
    getSamples: () => ({
      valid: ['name', 'age', 'createdAt'],
      invalid: ['other', '', 42, null, undefined, true, 'Name'],
    }),
  },
  typeof_variable_query: {
    title: 'typeof variable — type query on a runtime value',
    description:
      "`typeof config` where `config` is a bound value resolves to the value's static type. Without `as const` the type is widened (`url: string`, `port: number`); with `as const` it pins to literals. This case verifies the widened path.",
    getSamples: () => ({
      valid: [
        {url: 'http://example.com', port: 8080},
        {url: '', port: 0},
      ],
      invalid: [
        {url: 'x'}, // missing port
        {port: 80}, // missing url
        {url: 42, port: 8080}, // wrong type
        null,
        undefined,
      ],
    }),
  },
  indexed_access_type: {
    title: 'Indexed access type — Person["name"] resolves to string',
    description:
      '`T[K]` reads the value type of a property. `Person["name"]` resolves to `string` at the type-checker layer; the validator is identical to the atomic `string` shape. Pins the resolution path through the cache.',
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, true],
    }),
  },
  conditional_type_resolved: {
    title: 'Conditional type — T extends string ? boolean : number',
    description:
      '`T extends U ? X : Y` resolves at the type-checker layer to either X or Y depending on T. `IsString<"hello">` resolves to `boolean` here. Validation pins that the conditional threads through to the resolved shape.',
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'x', null, undefined, 0, 1],
    }),
  },
  mapped_type_custom: {
    title: 'Custom mapped type — {[K in keyof T]: T[K] | null}',
    description:
      'A user-authored mapped type that augments every prop with `| null`. Tests that resolver + emit thread custom mapped types correctly; Partial / Required / Pick etc. exercise the same machinery via the built-in utility paths.',
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: null, b: 1},
        {a: 'x', b: null},
        {a: null, b: null},
      ],
      invalid: [
        {a: 42, b: 1}, // a not string|null
        {a: 'x', b: 'not number'}, // b not number|null
        {b: 1}, // missing a (undefined ∉ string|null)
        null,
        undefined,
      ],
    }),
  },
  mapped_type_with_conditional_value: {
    title: 'Mapped type whose value is a conditional — per-prop shape diverges',
    description:
      '`{[K in keyof T]: FieldFor<T[K]>}` where `FieldFor<X>` is a conditional that produces a different object shape for each input type. The resolver evaluates the conditional per prop at the type-checker layer, so each prop ends up with its own concrete (and different) validator. Stress-tests the "two-different-validations-from-one-mapping" pattern.',
    getSamples: () => ({
      valid: [
        {
          name: {kind: 'text', value: 'Alice'},
          age: {kind: 'number', value: 30},
          admin: {kind: 'checkbox', value: true},
        },
        // age.min is optional
        {
          name: {kind: 'text', value: 'B'},
          age: {kind: 'number', value: 1, min: 0},
          admin: {kind: 'checkbox', value: false},
        },
      ],
      invalid: [
        // age.kind wrong literal
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'text', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // name.value wrong type
        {
          name: {kind: 'text', value: 42},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // missing required prop
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
        },
        null,
        undefined,
      ],
    }),
  },
  distributive_conditional_over_union: {
    title: 'Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`',
    description:
      'When a conditional type is applied to a generic union, TS distributes the conditional over each member, producing a union of the per-arm results. `T extends any ? {w: T} : never` applied to `string | number` resolves to `{w: string} | {w: number}`. Validator dispatches through the union emit.',
    getSamples: () => ({
      valid: [{w: 'hello'}, {w: 42}],
      invalid: [{w: true}, {w: null}, {}, null, undefined, {w: NaN}],
    }),
  },
  deep_partial_recursive_mapped: {
    title: 'DeepPartial<T> — recursive mapped type with nested optionality',
    description:
      '`type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]}`. Recursively makes every nested object-typed property optional. The resolver evaluates the recursion at the type-checker layer; the validator sees the fully flattened all-optional-deep shape.',
    getSamples: () => ({
      valid: [
        {},
        {display: {}},
        {audio: {volume: 1}},
        {display: {theme: 'light'}, audio: {muted: true}},
        {display: {theme: 'dark', brightness: 0.5}, audio: {volume: 1, muted: false}},
      ],
      invalid: [
        [], // allOptionalCode guard rejects arrays at the outer level
        new Date(), // same — Date is not '[object Object]'
        {display: 'not object'}, // nested object expected
        {display: {theme: 'invalid'}}, // literal-union arm fails
        {audio: {volume: NaN}}, // NaN fails number
        null,
        undefined,
      ],
    }),
  },
} as const satisfies Record<string, SharedCase>;
