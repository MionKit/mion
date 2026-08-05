// JSON Schema `not` — the negation keyword, end-to-end through the schema
// door: exact validators via the `__rtNot` sentinel, kind-complement statics,
// spec-literal nested negation, and mock soundness. The user-facing TS
// surface bans `Not<Not<F>>`, but the SCHEMA door accepts what 2020-12
// accepts — including nested `not` — because existing documents do.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, createGetValidationErrorsFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type {Not} from '@ts-runtypes/core/formats';
import type * as TF from '@ts-runtypes/core/formats';

describe('JSON Schema not keyword', () => {
  it('negates a sub-kind constraint exactly (validator), keeping the base type', () => {
    const noAPrefix = createValidateFn(runTypeFromJsonSchema({type: 'string', not: {pattern: '^a'}}));
    expect(noAPrefix('bcd')).toBe(true);
    expect(noAPrefix('')).toBe(true);
    expect(noAPrefix('abc')).toBe(false);
    expect(noAPrefix(42)).toBe(false);
    expect(noAPrefix(null)).toBe(false);
  });

  it('negates a format keyword', () => {
    const notEmail = createValidateFn(runTypeFromJsonSchema({type: 'string', not: {format: 'email'}}));
    expect(notEmail('plain words')).toBe(true);
    expect(notEmail('ada@example.com')).toBe(false);
  });

  it('bare not narrows to the kind complement and validates exactly', () => {
    const notString = createValidateFn(runTypeFromJsonSchema({not: {type: 'string'}}));
    expect(notString(42)).toBe(true);
    expect(notString(null)).toBe(true);
    expect(notString(true)).toBe(true);
    expect(notString({})).toBe(true);
    expect(notString([])).toBe(true);
    expect(notString('nope')).toBe(false);
  });

  it('float-only numbers via not multipleOf 1', () => {
    const floatOnly = createValidateFn(runTypeFromJsonSchema({type: 'number', not: {multipleOf: 1}}));
    expect(floatOnly(1.5)).toBe(true);
    expect(floatOnly(-0.25)).toBe(true);
    expect(floatOnly(3)).toBe(false);
    expect(floatOnly('3.5')).toBe(false);
  });

  it('nested not follows the spec literally (double negation recovers the inner set)', () => {
    const emailOnly = createValidateFn(runTypeFromJsonSchema({type: 'string', not: {type: 'string', not: {format: 'email'}}}));
    expect(emailOnly('ada@example.com')).toBe(true);
    expect(emailOnly('plain words')).toBe(false);
    expect(emailOnly(7)).toBe(false);
  });

  it('not: false is a no-op and not: true empties the schema id', () => {
    const anythingString = createValidateFn(runTypeFromJsonSchema({type: 'string', not: false}));
    expect(anythingString('x')).toBe(true);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', not: false}))).toBe(getRunTypeId<string>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', not: true}))).toBe(getRunTypeId<never>());
  });

  it('mocks stay sound under negation', () => {
    const mockNoPrefix = createMockDataFn(runTypeFromJsonSchema({type: 'string', not: {pattern: '^a'}}));
    const noPrefix = createValidateFn(runTypeFromJsonSchema({type: 'string', not: {pattern: '^a'}}));
    const mockNotString = createMockDataFn(runTypeFromJsonSchema({not: {type: 'string'}}));
    const notString = createValidateFn(runTypeFromJsonSchema({not: {type: 'string'}}));
    for (let i = 0; i < 16; i++) {
      expect(noPrefix(mockNoPrefix())).toBe(true);
      expect(notString(mockNotString())).toBe(true);
    }
  });

  it('annotations ($comment, deprecated, readOnly, writeOnly) do not disturb the id', () => {
    const plain = getRunTypeId(runTypeFromJsonSchema({type: 'string'}));
    const annotated = getRunTypeId(
      runTypeFromJsonSchema({type: 'string', $comment: 'x', deprecated: true, readOnly: true, writeOnly: false})
    );
    expect(annotated).toBe(plain);
  });

  it('unknown format values are accepted as annotations (base type, nothing enforced)', () => {
    const iri = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'iri-reference'}));
    expect(iri('anything goes')).toBe(true);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'iri-reference'}))).toBe(getRunTypeId<string>());
  });

  it('sibling-typed structural negation: not {required} excludes matching objects', () => {
    const noSecret = createValidateFn(runTypeFromJsonSchema({type: 'object', not: {required: ['secret']}}));
    expect(noSecret({})).toBe(true);
    expect(noSecret({other: 1})).toBe(true);
    expect(noSecret({secret: 1})).toBe(false); // primitive-valued member still matches the child
    expect(noSecret('str')).toBe(false); // the sibling type gate stands
  });

  it('bare not over a typed object child keeps the other kinds', () => {
    const notAB = createValidateFn(
      runTypeFromJsonSchema({
        not: {type: 'object', properties: {a: {type: 'number'}, b: {type: 'string'}}, required: ['a', 'b']},
      })
    );
    expect(notAB(42)).toBe(true); // child demands objects — non-objects pass the negation
    expect(notAB({a: 1})).toBe(true); // missing b — child rejects, negation accepts
    expect(notAB({a: 1, b: 2})).toBe(true); // b wrong type
    expect(notAB({a: 1, b: 's'})).toBe(false);
    expect(notAB({a: 1, b: 's', extra: 0})).toBe(false); // child is open — still matches
  });
});

// ── The kind-relevance matrix — typed × type-less × value-scoped children ──
// 2020-12 evaluates a type-less subschema by kind relevance: an instance
// whose kind none of the child's constraint keywords touch satisfies the
// child VACUOUSLY, so the negation must exclude that whole kind. Typed
// children are the dual (kinds outside the child's gate always fail it, so
// the negation keeps them wholesale), and value-scoped children (const /
// enum / $ref / combinators) assert on every kind, with null / true / false
// decided statically since they cannot carry the runtime sentinel.
describe('bare not over type-less children excludes the untouched kinds', () => {
  it('string-family child: only failing strings survive', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {pattern: '^a'}}));
    expect(fn('b-side')).toBe(true);
    expect(fn('')).toBe(true);
    expect(fn('abc')).toBe(false); // matches the child
    expect(fn(42)).toBe(false); // a number satisfies {pattern} vacuously
    expect(fn(null)).toBe(false);
    expect(fn(true)).toBe(false);
    expect(fn([])).toBe(false);
    expect(fn({})).toBe(false);
  });

  it('number-family child: only failing numbers survive', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {minimum: 10}}));
    expect(fn(5)).toBe(true);
    expect(fn(15)).toBe(false);
    expect(fn(10)).toBe(false);
    expect(fn('x')).toBe(false);
    expect(fn(null)).toBe(false);
  });

  it('array-family child: short arrays survive, every other kind is excluded', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {minItems: 2}}));
    expect(fn([])).toBe(true);
    expect(fn([1])).toBe(true);
    expect(fn([1, 2])).toBe(false);
    expect(fn('x')).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn({})).toBe(false);
  });

  it('object-family child: objects without the key survive', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {required: ['x']}}));
    expect(fn({})).toBe(true);
    expect(fn({y: 1})).toBe(true);
    expect(fn({x: 1})).toBe(false);
    expect(fn(42)).toBe(false);
    expect(fn(null)).toBe(false);
  });

  it('type-less format child negates within the string kind only', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {format: 'email'}}));
    expect(fn('plain words')).toBe(true);
    expect(fn('ada@example.com')).toBe(false);
    expect(fn(42)).toBe(false);
    expect(fn(null)).toBe(false);
  });

  it('multi-family child keeps one arm per touched family', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {minLength: 3, minimum: 5}}));
    expect(fn('ab')).toBe(true); // fails minLength, so outside the child
    expect(fn('abc')).toBe(false); // minimum is vacuous on strings
    expect(fn(4)).toBe(true); // fails minimum
    expect(fn(6)).toBe(false);
    expect(fn(null)).toBe(false); // both keywords vacuous on null
    expect(fn(true)).toBe(false);
    expect(fn([])).toBe(false);
    expect(fn({})).toBe(false);
  });

  it('converges on the Not<F> spelling through both call shapes', () => {
    type NoAPrefix = Not<TF.String<{pattern: {source: '^a'; flags: 'u'}}>>;
    const doorId = getRunTypeId(runTypeFromJsonSchema({not: {pattern: '^a'}}));
    expect(doorId).toBe(getRunTypeId<NoAPrefix>());
    const reflected = 'b-side' as NoAPrefix;
    expect(getRunTypeId(reflected)).toBe(doorId);
  });
});

describe('bare not over typed children keeps the outside kinds', () => {
  it('multi-kind gate excludes exactly the named kinds', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {type: ['null', 'string']}}));
    expect(fn(null)).toBe(false);
    expect(fn('x')).toBe(false);
    expect(fn(42)).toBe(true);
    expect(fn([])).toBe(true);
    expect(fn(true)).toBe(true);
  });

  it('not type null and not type boolean pin the sentinel-less kinds', () => {
    const notNull = createValidateFn(runTypeFromJsonSchema({not: {type: 'null'}}));
    expect(notNull(null)).toBe(false);
    expect(notNull(0)).toBe(true);
    expect(notNull(false)).toBe(true);
    expect(notNull('')).toBe(true);
    const notBool = createValidateFn(runTypeFromJsonSchema({not: {type: 'boolean'}}));
    expect(notBool(true)).toBe(false);
    expect(notBool(false)).toBe(false);
    expect(notBool(42)).toBe(true);
    expect(notBool(null)).toBe(true);
  });

  it('null inside the gate is excluded while the constraints are null-vacuous', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {type: ['null', 'string'], minLength: 3}}));
    expect(fn(null)).toBe(false); // gate matches and minLength is vacuous, so the child accepts null
    expect(fn('ab')).toBe(true); // fails minLength
    expect(fn('abc')).toBe(false);
    expect(fn(42)).toBe(true); // outside the gate
  });

  it('null inside the gate survives when a value-scoped sibling rejects it', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {type: ['null', 'string'], const: 'a'}}));
    expect(fn(null)).toBe(true); // const 'a' rejects null, so the negation accepts it
    expect(fn('a')).toBe(false);
    expect(fn('b')).toBe(true);
    expect(fn(42)).toBe(true);
  });

  it('not integer keeps the fractional numbers', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {type: 'integer'}}));
    expect(fn(1.5)).toBe(true);
    expect(fn(3)).toBe(false);
    expect(fn('x')).toBe(true);
    expect(fn(null)).toBe(true);
  });
});

describe('bare not over value-scoped children asserts on every kind', () => {
  it('not const excludes exactly the literal', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {const: 5}}));
    expect(fn(5)).toBe(false);
    expect(fn(6)).toBe(true);
    expect(fn('x')).toBe(true);
    expect(fn(null)).toBe(true);
    expect(fn(true)).toBe(true);
    expect(fn([])).toBe(true);
    expect(fn({})).toBe(true);
  });

  it('not const null and not const true decide the sentinel-less kinds statically', () => {
    const notNull = createValidateFn(runTypeFromJsonSchema({not: {const: null}}));
    expect(notNull(null)).toBe(false);
    expect(notNull(0)).toBe(true);
    expect(notNull(false)).toBe(true);
    const notTrue = createValidateFn(runTypeFromJsonSchema({not: {const: true}}));
    expect(notTrue(true)).toBe(false);
    expect(notTrue(false)).toBe(true);
    expect(notTrue(1)).toBe(true);
    expect(notTrue(null)).toBe(true);
  });

  it('not enum excludes each member and keeps everything else', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {enum: [null, 5, 'a']}}));
    expect(fn(null)).toBe(false);
    expect(fn(5)).toBe(false);
    expect(fn('a')).toBe(false);
    expect(fn(6)).toBe(true);
    expect(fn('b')).toBe(true);
    expect(fn(false)).toBe(true);
    expect(fn([])).toBe(true);
  });

  it('not anyOf is the conjunction of the negated members', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {anyOf: [{type: 'string'}, {const: 5}]}}));
    expect(fn('x')).toBe(false);
    expect(fn(5)).toBe(false);
    expect(fn(6)).toBe(true);
    expect(fn(null)).toBe(true);
    expect(fn(true)).toBe(true);
  });

  it('double negation recovers the inner kind across all kinds', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {not: {type: 'string'}}}));
    expect(fn('x')).toBe(true);
    expect(fn(42)).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn(true)).toBe(false);
  });

  it('not $ref negates the referenced definition', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({$defs: {s: {type: 'string'}}, not: {$ref: '#/$defs/s'}}));
    expect(fn('x')).toBe(false);
    expect(fn(42)).toBe(true);
    expect(fn(null)).toBe(true);
  });

  it('an undecidable self-referential not is the never schema, loudly', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({not: {$ref: '#'}}))).toBe(getRunTypeId<never>());
  });
});

describe('not beside sibling value keywords', () => {
  it('sibling type gates a value-scoped child', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', not: {const: 'a'}}));
    expect(fn('a')).toBe(false);
    expect(fn('b')).toBe(true);
    expect(fn(42)).toBe(false);
  });

  it('a null gate arm obeys the value-scoped child verdict', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: ['string', 'null'], not: {const: null}}));
    expect(fn(null)).toBe(false);
    expect(fn('x')).toBe(true);
    expect(fn(42)).toBe(false); // outside the sibling gate
  });

  it('enum beside not drops the negated members only', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({enum: [3, 7, null], not: {const: 3}}));
    expect(fn(3)).toBe(false);
    expect(fn(7)).toBe(true);
    expect(fn(null)).toBe(true);
    expect(fn(5)).toBe(false); // outside the enum
    const boolEnum = createValidateFn(runTypeFromJsonSchema({enum: [true, 'x'], not: {const: true}}));
    expect(boolEnum(true)).toBe(false);
    expect(boolEnum('x')).toBe(true);
    expect(boolEnum(false)).toBe(false);
  });
});

describe('minItems without prefixItems keeps requiring (the pad)', () => {
  it('plain minItems pads an open tuple', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', minItems: 2}));
    expect(fn([])).toBe(false);
    expect(fn([1])).toBe(false);
    expect(fn([1, 2])).toBe(true);
    expect(fn([1, 2, 3])).toBe(true);
  });

  it('minItems beside items pads with the items type', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, minItems: 1}));
    expect(fn([])).toBe(false);
    expect(fn([1])).toBe(true);
    expect(fn(['x'])).toBe(false);
    expect(fn([1, 2])).toBe(true);
  });
});

describe('validation errors agree with validate on statement-base negations', () => {
  // Arrays / tuples / object literals emit statement bodies; the verr walk
  // probes the negated child against a scratch error array. One canonical
  // 'not' error when the child matches, silence when it does not.
  it('array and object bases report the not error exactly when validate rejects', () => {
    const shortErrs = createGetValidationErrorsFn(runTypeFromJsonSchema({not: {minItems: 2}}));
    expect(shortErrs([1, 2]).length).toBeGreaterThan(0);
    expect(shortErrs([1])).toEqual([]);
    const objErrs = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', not: {required: ['secret']}}));
    expect(objErrs({secret: 1}).length).toBeGreaterThan(0);
    expect(objErrs({other: 1})).toEqual([]);
  });
});

describe('negation matrix mocks stay sound', () => {
  it('type-less family negations mock into the surviving arm', () => {
    const notPrefix = runTypeFromJsonSchema({not: {pattern: '^a'}});
    const notPrefixCheck = createValidateFn(notPrefix);
    const notPrefixMock = createMockDataFn(notPrefix);
    const shortArr = runTypeFromJsonSchema({not: {minItems: 2}});
    const shortArrCheck = createValidateFn(shortArr);
    const shortArrMock = createMockDataFn(shortArr);
    for (let i = 0; i < 16; i++) {
      expect(notPrefixCheck(notPrefixMock())).toBe(true);
      expect(shortArrCheck(shortArrMock())).toBe(true);
    }
  });

  it('value-scoped negations mock across the whole domain', () => {
    const notFive = runTypeFromJsonSchema({not: {const: 5}});
    const notFiveCheck = createValidateFn(notFive);
    const notFiveMock = createMockDataFn(notFive);
    const enumSide = runTypeFromJsonSchema({enum: [3, 7, null], not: {const: 3}});
    const enumSideCheck = createValidateFn(enumSide);
    const enumSideMock = createMockDataFn(enumSide);
    for (let i = 0; i < 16; i++) {
      expect(notFiveCheck(notFiveMock())).toBe(true);
      expect(enumSideCheck(enumSideMock())).toBe(true);
    }
  });
});
