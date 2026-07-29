// PROTOTYPE TEST (investigation: docs/investigations/json-schema/) — derived
// JSON Schema OUTPUT from reflected types, through the REAL pipeline: types are
// reflected by the Go resolver, `getRunType<T>()` returns the knotted graph, and
// the walker in jsonSchemaOutput.proto.ts emits draft 2020-12 documents.
//
// Covers: required/optional inversion, formats → keywords, wire projections
// (Date / bigint / Map / Set), tuples via prefixItems, unions, records, enums,
// non-data drop-vs-throw (DataOnly discipline), recursion via $defs/$ref, and a
// full round-trip with the Phase-2.1 input prototype.

import {describe, expect, it} from 'vitest';
import {getRunType, getRunTypeId} from '@ts-runtypes/core';
import type * as TF from '@ts-runtypes/core/formats';
// Side-effect import: registers format mock fns (unrelated here) AND keeps the
// formats module in the runtime graph like real format-using apps have it.
import '@ts-runtypes/core/formats';
import {runTypeToJsonSchema} from './jsonSchemaOutput.proto.ts';
import {jsonSchema} from '@ts-runtypes/core/json-schema';

interface Address {
  street: string;
  city?: string;
}
interface User {
  readonly id: TF.UUIDv4;
  name: TF.String<{minLength: 2; maxLength: 50}>;
  age: TF.Number<{integer: true; min: 0; max: 130}>;
  email?: TF.Email;
  tags: string[];
  address: Address;
}

describe('jsonSchema output — objects, formats, required/optional inversion', () => {
  it('emits the full user document with format keywords', () => {
    const {schema, warnings} = runTypeToJsonSchema(getRunType<User>());

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    // Property-level `?` inverted into the object-level required array.
    expect([...(schema.required as string[])].sort()).toEqual(['address', 'age', 'id', 'name', 'tags']);

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.id).toEqual(
      expect.objectContaining({type: 'string', format: 'uuid', readOnly: true, pattern: expect.stringContaining('-4')})
    );
    expect(properties.name).toEqual(expect.objectContaining({type: 'string', minLength: 2, maxLength: 50}));
    expect(properties.age).toEqual(expect.objectContaining({type: 'integer', minimum: 0, maximum: 130}));
    expect(properties.email).toEqual(expect.objectContaining({type: 'string', format: 'email', minLength: 7, maxLength: 254}));
    expect(properties.tags).toEqual({type: 'array', items: {type: 'string'}});
    expect(properties.address).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: {street: {type: 'string'}, city: {type: 'string'}},
        required: ['street'],
      })
    );
    // The built-in EMAIL pattern is flagless, so it transfers verbatim as a
    // hard `pattern` twin next to the (annotation-only) `format` keyword —
    // exactly the "emit both when cheap" policy from the phase-1 mapping.
    expect(typeof properties.email.pattern).toBe('string');
    expect(warnings.some((warning) => warning.includes('pattern.flags'))).toBe(false);
  });

  it('supports both getRunTypeId call shapes and both getRunType shapes (marker rule)', () => {
    // Static form: caller supplies T.
    const staticId = getRunTypeId<Address>();
    // Reflection form: T inferred from the value.
    const address: Address = {street: 'Main St 1', city: 'Sevilla'};
    const reflectedId = getRunTypeId(address);
    expect(reflectedId).toBe(staticId);

    const fromStatic = runTypeToJsonSchema(getRunType<Address>()).schema;
    const fromValue = runTypeToJsonSchema(getRunType(address)).schema;
    expect(fromValue).toEqual(fromStatic);
  });
});

describe('jsonSchema output — literals, enums, unions, records', () => {
  it('maps literal types to const', () => {
    const {schema} = runTypeToJsonSchema(getRunType<'active'>());
    expect(schema.const).toBe('active');
  });

  it('maps TS enums to enum values (names become annotations at best)', () => {
    enum Color {
      Red,
      Green,
      Blue,
    }
    const {schema} = runTypeToJsonSchema(getRunType<Color>());
    expect(schema.enum).toEqual([0, 1, 2]);
  });

  it('maps unions to anyOf and nullable unions with a null arm', () => {
    const {schema} = runTypeToJsonSchema(getRunType<string | number>());
    expect(schema.anyOf).toEqual([{type: 'string'}, {type: 'number'}]);

    const nullable = runTypeToJsonSchema(getRunType<string | null>()).schema;
    expect(nullable.anyOf).toEqual(expect.arrayContaining([{type: 'string'}, {type: 'null'}]));
  });

  it('maps literal unions to anyOf of consts', () => {
    const {schema} = runTypeToJsonSchema(getRunType<'a' | 'b'>());
    expect(schema.anyOf).toEqual(expect.arrayContaining([{const: 'a'}, {const: 'b'}]));
  });

  it('maps records to additionalProperties', () => {
    const {schema} = runTypeToJsonSchema(getRunType<Record<string, number>>());
    expect(schema).toEqual(expect.objectContaining({type: 'object', additionalProperties: {type: 'number'}}));
  });
});

describe('jsonSchema output — tuples', () => {
  it('emits prefixItems with min/maxItems for fixed tuples', () => {
    const {schema} = runTypeToJsonSchema(getRunType<[string, number]>());
    expect(schema).toEqual(
      expect.objectContaining({
        type: 'array',
        prefixItems: [{type: 'string'}, {type: 'number'}],
        minItems: 2,
        maxItems: 2,
        items: false,
      })
    );
  });

  it('optional members lower minItems; rest becomes items', () => {
    const optional = runTypeToJsonSchema(getRunType<[string, number?]>()).schema;
    expect(optional.minItems).toBe(1);
    expect(optional.items).toBe(false);
    expect(optional.maxItems).toBe(2);

    const rest = runTypeToJsonSchema(getRunType<[number, ...string[]]>()).schema;
    expect(rest.prefixItems).toEqual([{type: 'number'}]);
    expect(rest.items).toEqual({type: 'string'});
    expect(rest.maxItems).toBeUndefined();
  });
});

describe('jsonSchema output — wire projections (Date, bigint, Map, Set)', () => {
  it('emits Date as the ISO wire string', () => {
    const {schema} = runTypeToJsonSchema(getRunType<{createdAt: Date}>());
    const properties = schema.properties as Record<string, unknown>;
    expect(properties.createdAt).toEqual({type: 'string', format: 'date-time'});
  });

  it('emits bigint as the digit-string wire form', () => {
    const {schema} = runTypeToJsonSchema(getRunType<{balance: bigint}>());
    const properties = schema.properties as Record<string, unknown>;
    expect(properties.balance).toEqual(expect.objectContaining({type: 'string', pattern: '^-?[0-9]+$'}));
  });

  it('throws on Map/Set by default (the DataOnly instinct)', () => {
    const mapNode = getRunType<Map<string, number>>();
    expect(() => runTypeToJsonSchema(mapNode)).toThrow(/Map has no canonical JSON Schema form/);
  });

  it("emits the RunTypes wire shape under {mapSet: 'wire'}", () => {
    const mapSchema = runTypeToJsonSchema(getRunType<Map<string, number>>(), {mapSet: 'wire'}).schema;
    expect(mapSchema).toEqual(
      expect.objectContaining({
        type: 'array',
        items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
      })
    );

    const setSchema = runTypeToJsonSchema(getRunType<Set<string>>(), {mapSet: 'wire'}).schema;
    expect(setSchema).toEqual(expect.objectContaining({type: 'array', items: {type: 'string'}, uniqueItems: true}));
  });
});

describe('jsonSchema output — non-data kinds (drop at property, throw at propagating)', () => {
  it('drops function/symbol properties with warnings, keeps the data shape', () => {
    interface WithNonData {
      name: string;
      callback: () => void;
      token: symbol;
    }
    const {schema, warnings} = runTypeToJsonSchema(getRunType<WithNonData>());
    const properties = schema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(['name']);
    expect(schema.required).toEqual(['name']);
    // `callback: () => void` reflects as a methodSignature (checker view), the
    // symbol prop drops via the DataOnly projection — one 'not data' warning each.
    expect(warnings.filter((warning) => warning.includes('not data')).length).toBe(2);
  });

  it('throws for non-data kinds at propagating positions', () => {
    expect(() => runTypeToJsonSchema(getRunType<symbol>())).toThrow(/not data/);
    expect(() => runTypeToJsonSchema(getRunType<Array<() => void>>())).toThrow(/no JSON representation/);
  });
});

describe('jsonSchema output — recursion via $defs/$ref', () => {
  interface TreeNode {
    value: string;
    children?: TreeNode[];
  }

  it('hoists circular nodes into $defs and references them', () => {
    const {schema} = runTypeToJsonSchema(getRunType<TreeNode>());
    // The root itself is the circular node: emitted as a $ref into $defs.
    const ref = schema.$ref as string;
    expect(ref).toMatch(/^#\/\$defs\//);
    const defs = schema.$defs as Record<string, Record<string, unknown>>;
    const entry = defs[ref.replace('#/$defs/', '')];
    expect(entry.type).toBe('object');
    const properties = entry.properties as Record<string, Record<string, unknown>>;
    expect(properties.value).toEqual({type: 'string'});
    expect((properties.children as {items: {$ref: string}}).items.$ref).toBe(ref);
  });
});

describe('jsonSchema output — round-trip with the Phase-2.1 input prototype', () => {
  it('schema → type → schema preserves structure, required set and formats', () => {
    const source = {
      type: 'object',
      properties: {
        id: {type: 'string', format: 'uuid'},
        score: {type: 'integer', minimum: 0, maximum: 100},
        labels: {type: 'array', items: {type: 'string'}},
      },
      required: ['id', 'score'],
    } as const;

    const {schema} = runTypeToJsonSchema(getRunType(jsonSchema(source)));
    expect(schema.type).toBe('object');
    expect([...(schema.required as string[])].sort()).toEqual(['id', 'score']);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.id).toEqual(expect.objectContaining({type: 'string', format: 'uuid'}));
    expect(properties.score).toEqual(expect.objectContaining({type: 'integer', minimum: 0, maximum: 100}));
    expect(properties.labels).toEqual({type: 'array', items: {type: 'string'}});
  });
});
