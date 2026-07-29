// PROTOTYPE TEST (investigation: docs/investigations/json-schema/) — proves JSON
// Schema literals work as FIRST-CLASS createX inputs through the REAL pipeline
// (vitest runs the ts-runtypes-devtools plugin + the Go resolver).
//
// The load-bearing assertions are the CONVERGENCE ones: `jsonSchema({...})` must
// resolve to the SAME structural id — hence the SAME cached factory object — as
// the hand-written type-first equivalent (`createValidateFn<Expected>()`). That
// single `.toBe` proves the inferred type, the format brands, and the whole
// demand-driven cache path all behave as if the user had written the TS type.
//
// Covers the Phase-2.1 practical checklist from the investigation brief:
// required + optional props, an array prop, a nested object, and type formats
// (uuid / email / string length / integer bounds) — plus enum / const / anyOf.

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  getRunTypeId,
  type RTValidationError,
} from '@ts-runtypes/core';
import type * as TF from '@ts-runtypes/core/formats';
// Side-effect import (same pattern as composeBuilders.test.ts): registers the
// per-kind format MOCK fns. Without it the mock walker silently generates
// format-violating values for format-branded nodes — see the investigation
// note in docs/investigations/json-schema/02-phase2-first-class-input.md.
import '@ts-runtypes/core/formats';
import {jsonSchema} from './jsonSchemaInput.proto.ts';

// The hand-written type-first twin of the schema literal used below. If
// FromJsonSchema<S> computes anything else, every convergence assertion fails.
interface ExpectedAddress {
  street: string;
  city?: string;
}
interface ExpectedUser {
  id: TF.UUIDv4;
  name: TF.String<{minLength: 2; maxLength: 50}>;
  age: TF.Number<{integer: true; min: 0; max: 130}>;
  email?: TF.Email;
  tags: string[];
  address: ExpectedAddress;
}

const VALID_USER = {
  id: '7f2b6a1e-3c4d-4a5b-8c9d-0e1f2a3b4c5d',
  name: 'Ada Lovelace',
  age: 36,
  email: 'ada@example.com',
  tags: ['math', 'engines'],
  address: {street: 'Marylebone Rd 12', city: 'London'},
};

describe('jsonSchema input — object with required/optional/array/nested/formats', () => {
  it('validates and CONVERGES with the hand-written type-first type', () => {
    const isUser = createValidateFn(
      jsonSchema({
        type: 'object',
        properties: {
          id: {type: 'string', format: 'uuid'},
          name: {type: 'string', minLength: 2, maxLength: 50},
          age: {type: 'integer', minimum: 0, maximum: 130},
          email: {type: 'string', format: 'email'},
          tags: {type: 'array', items: {type: 'string'}},
          address: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}},
            required: ['street'],
          },
        },
        required: ['id', 'name', 'age', 'tags', 'address'],
      })
    );

    // Behavior: the generated validator enforces shape AND format constraints.
    expect(isUser(VALID_USER)).toBe(true);
    expect(isUser({...VALID_USER, email: undefined})).toBe(true); // optional prop absent
    expect(isUser({...VALID_USER, address: {street: 'x'}})).toBe(true); // nested optional absent
    expect(isUser({...VALID_USER, id: 'not-a-uuid'})).toBe(false); // uuid format
    expect(isUser({...VALID_USER, email: 'nope'})).toBe(false); // email format
    expect(isUser({...VALID_USER, name: 'A'})).toBe(false); // minLength 2
    expect(isUser({...VALID_USER, age: 150})).toBe(false); // maximum 130
    expect(isUser({...VALID_USER, age: 30.5})).toBe(false); // integer
    expect(isUser({...VALID_USER, tags: ['ok', 7]})).toBe(false); // array item type
    expect(isUser({...VALID_USER, address: {city: 'London'}})).toBe(false); // nested required
    const {address: _address, ...missingAddress} = VALID_USER;
    expect(isUser(missingAddress)).toBe(false); // top-level required
    expect(isUser(null)).toBe(false);

    // CONVERGENCE: same structural id ⇒ the exact same cached factory object.
    expect(isUser).toBe(createValidateFn<ExpectedUser>());
  });

  it('resolves the same structural id as the type-first type (getRunTypeId)', () => {
    const schemaId = getRunTypeId(
      jsonSchema({
        type: 'object',
        properties: {
          id: {type: 'string', format: 'uuid'},
          name: {type: 'string', minLength: 2, maxLength: 50},
          age: {type: 'integer', minimum: 0, maximum: 130},
          email: {type: 'string', format: 'email'},
          tags: {type: 'array', items: {type: 'string'}},
          address: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}},
            required: ['street'],
          },
        },
        required: ['id', 'name', 'age', 'tags', 'address'],
      })
    );
    expect(schemaId).toBe(getRunTypeId<ExpectedUser>());
  });

  it('produces format-aware validation errors with proper paths', () => {
    const userErrors = createGetValidationErrorsFn(
      jsonSchema({
        type: 'object',
        properties: {
          id: {type: 'string', format: 'uuid'},
          name: {type: 'string', minLength: 2, maxLength: 50},
          age: {type: 'integer', minimum: 0, maximum: 130},
          email: {type: 'string', format: 'email'},
          tags: {type: 'array', items: {type: 'string'}},
          address: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}},
            required: ['street'],
          },
        },
        required: ['id', 'name', 'age', 'tags', 'address'],
      })
    );

    const errors = userErrors({...VALID_USER, age: 150, tags: ['ok', 7], address: {}});
    expect(errors.length).toBeGreaterThanOrEqual(3);
    const paths = errors.map((error: RTValidationError) => error.path.join('.'));
    expect(paths).toContain('age');
    expect(paths).toContain('tags.1');
    expect(paths).toContain('address.street');
    // The age failure is a FORMAT bound failure (max), not a typeof failure.
    const ageError = errors.find((error: RTValidationError) => error.path.join('.') === 'age');
    expect(ageError?.format?.name).toBe('numberFormat');

    expect(userErrors(VALID_USER)).toEqual([]);
  });

  it('generates mock data straight from the schema that its own validator accepts', () => {
    const schema = jsonSchema({
      type: 'object',
      properties: {
        id: {type: 'string', format: 'uuid'},
        name: {type: 'string', minLength: 2, maxLength: 50},
        age: {type: 'integer', minimum: 0, maximum: 130},
        email: {type: 'string', format: 'email'},
        tags: {type: 'array', items: {type: 'string'}},
        address: {
          type: 'object',
          properties: {street: {type: 'string'}, city: {type: 'string'}},
          required: ['street'],
        },
      },
      required: ['id', 'name', 'age', 'tags', 'address'],
    });
    const mockUser = createMockDataFn(schema);
    const isUser = createValidateFn(schema);

    for (let i = 0; i < 25; i++) {
      const mocked = mockUser() as ExpectedUser;
      expect(isUser(mocked)).toBe(true);
      expect(typeof mocked.id).toBe('string');
      expect(mocked.age).toBeGreaterThanOrEqual(0);
      expect(mocked.age).toBeLessThanOrEqual(130);
      expect(Array.isArray(mocked.tags)).toBe(true);
      expect(typeof mocked.address.street).toBe('string');
    }
  });
});

describe('jsonSchema input — const / enum / anyOf', () => {
  it('maps const to a literal and converges', () => {
    const isActive = createValidateFn(jsonSchema({const: 'active'}));
    expect(isActive('active')).toBe(true);
    expect(isActive('inactive')).toBe(false);
    expect(isActive).toBe(createValidateFn<'active'>());
  });

  it('maps enum to a literal union and converges', () => {
    const isRole = createValidateFn(jsonSchema({enum: ['admin', 'user', 3]}));
    expect(isRole('admin')).toBe(true);
    expect(isRole('user')).toBe(true);
    expect(isRole(3)).toBe(true);
    expect(isRole('root')).toBe(false);
    expect(isRole(4)).toBe(false);
    expect(isRole).toBe(createValidateFn<'admin' | 'user' | 3>());
  });

  it('maps anyOf to a union and converges', () => {
    const isIdent = createValidateFn(jsonSchema({anyOf: [{type: 'string'}, {type: 'number'}]}));
    expect(isIdent('abc')).toBe(true);
    expect(isIdent(42)).toBe(true);
    expect(isIdent(true)).toBe(false);
    expect(isIdent).toBe(createValidateFn<string | number>());
  });

  it('maps a nullable anyOf (type null arm)', () => {
    const isMaybeName = createValidateFn(jsonSchema({anyOf: [{type: 'string'}, {type: 'null'}]}));
    expect(isMaybeName('x')).toBe(true);
    expect(isMaybeName(null)).toBe(true);
    expect(isMaybeName(undefined)).toBe(false);
    expect(isMaybeName).toBe(createValidateFn<string | null>());
  });

  it('maps additionalProperties-only objects to Record', () => {
    const isScores = createValidateFn(jsonSchema({type: 'object', additionalProperties: {type: 'number'}}));
    expect(isScores({a: 1, b: 2})).toBe(true);
    expect(isScores({})).toBe(true);
    expect(isScores({a: 'x'})).toBe(false);
    expect(isScores).toBe(createValidateFn<Record<string, number>>());
  });
});

describe('jsonSchema input — module-scope const schema (CTA learning case)', () => {
  // A schema shared as a module const needs `as const` to keep literal inference.
  // This case exists to LEARN how the CompTimeArgs scanner treats the assertion;
  // the reflected type rides the brand either way (the runtime value is never
  // consulted), so injection is expected to work even if CTA flags the arg.
  it('infers from a const-bound schema literal', () => {
    const isPoint = createValidateFn(jsonSchema(POINT_SCHEMA));
    expect(isPoint({x: 1, y: 2})).toBe(true);
    expect(isPoint({x: 1})).toBe(false);
    expect(isPoint({x: 1, y: 'nope'})).toBe(false);
    expect(isPoint).toBe(createValidateFn<{x: number; y: number}>());
  });
});

const POINT_SCHEMA = {
  type: 'object',
  properties: {x: {type: 'number'}, y: {type: 'number'}},
  required: ['x', 'y'],
} as const;
