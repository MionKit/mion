// CLAUDE.md marker coverage rule for this suite: the lane's generated modules
// exercise the builder form only (createValidateFn(runTypeFromJsonSchema(s))),
// so this file pins the PAIRED getRunTypeId call shapes over a representative
// suite schema — static getRunTypeId<T>() and reflection getRunTypeId(value) —
// with the hash-equivalence assertion tying them (and the builder) to ONE
// cache entry. Mirrors the shape in
// test/suites/json-schema-define/jsonSchemaDefine.test.ts.

import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';

// The shape additionalProperties.json and properties.json build their groups
// around: a two-property object with one required member.
const SUITE_SCHEMA = {
  type: 'object',
  properties: {foo: {type: 'string'}, bar: {type: 'integer'}},
  required: ['foo'],
} as const;

describe('json-schema official — marker coverage rule (paired getRunTypeId shapes)', () => {
  it('static <T>, reflection (value) and builder forms resolve ONE hash', () => {
    // Static form: the recovered type supplied explicitly.
    const idStatic = getRunTypeId<FromJsonSchema<typeof SUITE_SCHEMA>>();
    // Reflection form: T inferred from a value's declared type.
    const reflectValue = {foo: 'hello', bar: 1} as FromJsonSchema<typeof SUITE_SCHEMA>;
    expect(getRunTypeId(reflectValue)).toBe(idStatic);
    // Builder form: the schema literal itself — what every generated call site uses.
    expect(getRunTypeId(runTypeFromJsonSchema(SUITE_SCHEMA))).toBe(idStatic);
  });
});
