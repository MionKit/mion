// StandardJSONSchemaV1 surface — end-to-end through the full vite-plugin
// pipeline. Three layers:
//
//   1. GOLDEN documents: `createJsonSchemaFn<T>()` returns the exact document
//      the Go schemadoc renderer emitted for representative shapes (wire-first
//      standard keywords + the jsType/rtFormat dialect rows), through BOTH
//      call shapes (marker-coverage rule) with an equivalence assertion.
//   2. Converter semantics: createStandardSchema's `~standard.jsonSchema`
//      serves the same document on input() and output(); `{portable: true}`
//      strips every dialect keyword; an unsupported target throws.
//   3. Cross-suite sweep: every validation + format-validation case that
//      carries a standardSchema thunk emits a JSON-serializable document
//      whose portable form is dialect-free — the whole supported type space
//      emits, not just the goldens.

import {describe, it, test, expect} from 'vitest';
import '@mionjs/run-types/formats'; // value side-effect: register the format runtime checks
import {createJsonSchemaFn, createStandardSchema, JSON_SCHEMA_DIALECT_KEYWORDS} from '@mionjs/run-types';
import type {StandardJSONSchemaV1, StandardSchemaV1} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {VALIDATION_SUITE} from '../suites/validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../suites/format-validation/index.ts';

const DIALECT_KEYS = new Set<string>(JSON_SCHEMA_DIALECT_KEYWORDS);

// Collects every object key in a document, recursively.
function collectKeys(value: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((element) => collectKeys(element, into));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

interface Order {
  readonly id: string;
  total: bigint;
  placed: Date;
  note?: string;
}

interface LinkedNode {
  value: string;
  next?: LinkedNode;
}

describe('createJsonSchemaFn<T> — golden documents', () => {
  test('static form: atoms, JS-only leaves, modifiers', () => {
    expect(createJsonSchemaFn<string>()()).toEqual({type: 'string'});
    expect(createJsonSchemaFn<'a' | 'b'>()()).toEqual({enum: ['a', 'b']});
    expect(createJsonSchemaFn<[string, number]>()()).toEqual({
      type: 'array',
      prefixItems: [{type: 'string'}, {type: 'number'}],
      minItems: 2,
      items: false,
    });
    expect(createJsonSchemaFn<Order>()()).toEqual({
      type: 'object',
      properties: {
        id: {type: 'string'},
        total: {type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'},
        placed: {type: 'string', format: 'date-time', jsType: 'Date'},
        note: {type: 'string'},
      },
      required: ['id', 'total', 'placed'],
      tsReadonly: ['id'],
    });
    expect(createJsonSchemaFn<Map<string, number>>()()).toEqual({
      type: 'array',
      items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false},
      jsType: 'Map',
    });
    expect(createJsonSchemaFn<TF.String<{minLength: 2}>>()()).toEqual({
      type: 'string',
      minLength: 2,
      rtFormat: 'stringFormat',
      rtFormatParams: {minLength: 2},
    });
  });

  test('recursion closes with the root reference', () => {
    expect(createJsonSchemaFn<LinkedNode>()()).toEqual({
      type: 'object',
      properties: {value: {type: 'string'}, next: {$ref: '#'}},
      required: ['value'],
    });
  });

  test('reflection form resolves the same document as the static form', () => {
    const order: Order = {id: 'o1', total: 1n, placed: new Date()};
    expect(createJsonSchemaFn(order)()).toEqual(createJsonSchemaFn<Order>()());
    const value = 'hello';
    expect(createJsonSchemaFn(value)()).toEqual(createJsonSchemaFn<string>()());
  });

  test('value-first schema form resolves through the builder id', () => {
    const doc = createJsonSchemaFn(RT.object({a: RT.boolean()}))();
    expect(doc).toEqual({type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']});
  });
});

describe('createStandardSchema — the StandardJSONSchemaV1 converter', () => {
  test('one object satisfies both standard interfaces (compile + runtime)', () => {
    const schema = createStandardSchema<Order>();
    // Compile-time: assignable to both vendored interfaces.
    const asValidation: StandardSchemaV1<unknown, unknown> = schema;
    const asJsonSchema: StandardJSONSchemaV1 = schema;
    expect(asValidation['~standard'].version).toBe(1);
    expect(typeof asJsonSchema['~standard'].jsonSchema.input).toBe('function');
  });

  test('input() and output() serve the same document as createJsonSchemaFn', () => {
    const schema = createStandardSchema<Order>();
    const doc = createJsonSchemaFn<Order>()();
    expect(schema['~standard'].jsonSchema.input()).toEqual(doc);
    expect(schema['~standard'].jsonSchema.output()).toEqual(doc);
  });

  test('portable strips every dialect keyword; the standard half survives', () => {
    const schema = createStandardSchema<Order>();
    const portable = schema['~standard'].jsonSchema.input({libraryOptions: {portable: true}});
    expect(portable).toEqual({
      type: 'object',
      properties: {
        id: {type: 'string'},
        total: {type: 'string', pattern: '^-?[0-9]+$'},
        placed: {type: 'string', format: 'date-time'},
        note: {type: 'string'},
      },
      required: ['id', 'total', 'placed'],
    });
  });

  test('the supported target is accepted; others throw', () => {
    const converter = createStandardSchema<string>()['~standard'].jsonSchema;
    expect(converter.input({target: 'draft-2020-12'})).toEqual({type: 'string'});
    expect(() => converter.input({target: 'draft-07'})).toThrow(RangeError);
    expect(() => converter.output({target: 'openapi-3.0'})).toThrow(RangeError);
  });
});

// Cross-suite sweep: every case with a standardSchema thunk emits a document.
function sweepCase(factory: () => StandardSchemaV1<unknown>): void {
  const schema = factory() as unknown as StandardJSONSchemaV1;
  const doc = schema['~standard'].jsonSchema.input();
  expect(doc, 'document must be a plain object').toBeTypeOf('object');
  // JSON-serializable (a document is data, never functions/bigints).
  expect(() => JSON.stringify(doc)).not.toThrow();
  const portable = schema['~standard'].jsonSchema.input({libraryOptions: {portable: true}});
  const keys = collectKeys(portable, new Set<string>());
  for (const key of keys) {
    expect(DIALECT_KEYS.has(key), `portable document leaked dialect keyword '${key}'`).toBe(false);
  }
}

describe('json-schema documents / validation suite sweep', () => {
  for (const [groupName, group] of Object.entries(VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        const thunk = c.standardSchema;
        if (!thunk || thunk === 'not-supported' || c.factoryThrows) continue;
        it(`${c.title} — jsonSchemaDoc`, () => sweepCase(thunk));
      }
    });
  }
});

describe('json-schema documents / format-validation suite sweep', () => {
  for (const [groupName, group] of Object.entries(FORMAT_VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        const thunk = c.standardSchema;
        if (!thunk || thunk === 'not-supported' || c.factoryThrows) continue;
        it(`${c.title} — jsonSchemaDoc`, () => sweepCase(thunk));
      }
    });
  }
});
