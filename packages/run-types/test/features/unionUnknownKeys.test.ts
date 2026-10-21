// `{checkUnionUnknowns: true}`: the validator rejects a key the UNION MEMBER that matched leaves undeclared, and does
// nothing anywhere else. Three probes per type, so a family that changes its answer names itself: plain validate, this
// option, and `{checkUnknowns: true}`. Group A pins the shapes the check runs on, B the shapes it must stay inert on
// (against plain validate's own answer, and for three of them against its emitted body byte for byte), C depth, D why
// the key families cannot all agree.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createValidateFn, getRunTypeId} from '../../src/index.ts';
import {getFnHash, getRTFnCaches} from '@mionjs/run-types/runtime';
import {entryCode} from '../../src/runtypes/rtUtils.ts';

// ---------------------------------------------------------------- types

type ObjectOrObject = {a: string} | {b: number};
interface Cat {
  kind: 'cat';
  meows: boolean;
}
interface Dog {
  kind: 'dog';
  barks: number;
}
type Pet = Cat | Dog;
type ObjectOrNumbers = {a: string} | Record<string, number>;
type ObjectOrStrings = {a: string} | Record<string, string>;
type SamePropType = {a: number} | Record<string, number>;
type TwoPropsOrNumbers = {a: string; b: number} | Record<string, number>;
type DiscriminatedOrNumbers = {kind: 'cat'; meows: boolean} | Record<string, number>;
type ObjectOrUnknowns = {a: string} | Record<string, unknown>;
type TwoRecords = Record<string, number> | Record<string, string>;
type ThreeObjects = {a: string} | {b: number} | {c: boolean};
type SharedPropName = {id: string; x: number} | {id: number; y: string};
type OptionalProp = {a: string; b?: number} | {c: string};
type ObjectsAndAtomic = {a: string} | {b: number} | number;

type ObjectOrNumber = {a: string} | number;
type ObjectOrManyAtomics = {a: string} | number | string | null;
type RecordOrNumber = Record<string, number> | number;
type TwoAtomics = string | number;
type DateOrString = Date | string;
type ArrayOrNumber = {a: string}[] | number;
type MapOrString = Map<string, number> | string;
class Marker {
  name = 'marker';
}
type ClassOrString = Marker | string;
type PlainObject = {a: string};

type NestedUnion = {pet: Pet};
type UnionInArray = ObjectOrObject[];
type UnionInTuple = [ObjectOrObject, string];
type UnionAsRecordValue = Record<string, ObjectOrObject>;
type NestedObjectOrNumbers = {a: {x: string}} | Record<string, number>;

// ---------------------------------------------------------------- harness

/** The three validators for one type, each built at its own call site so every marker resolves. */
interface Probe {
  plain: (value: unknown) => boolean;
  unionKeys: (value: unknown) => boolean;
  strict: (value: unknown) => boolean;
}

/** One value and the answer each probe must give for it. */
interface Row {
  label: string;
  value: unknown;
  plain: boolean;
  unionKeys: boolean;
  strict: boolean;
}

function check(probe: Probe, rows: Row[]) {
  for (const row of rows) {
    expect(probe.plain(row.value), `${row.label}: validate`).toBe(row.plain);
    expect(probe.unionKeys(row.value), `${row.label}: checkUnionUnknowns`).toBe(row.unionKeys);
    expect(probe.strict(row.value), `${row.label}: checkUnknowns`).toBe(row.strict);
    // checkUnionUnknowns is a narrowing of validate and a widening of checkUnknowns, on every shape.
    expect(row.unionKeys, `${row.label}: must not accept what validate rejects`).toBe(row.unionKeys && row.plain);
    expect(row.strict, `${row.label}: must not accept what checkUnionUnknowns rejects`).toBe(row.strict && row.unionKeys);
  }
}

/** Asserts checkUnionUnknowns answers exactly as plain validate does, which is Group B's whole claim. */
function inert(probe: Probe, values: unknown[]) {
  for (const value of values) {
    expect(probe.unionKeys(value), `inert on ${JSON.stringify(value)}`).toBe(probe.plain(value));
  }
}

// ---------------------------------------------------------------- Group A: the check runs

describe('the check runs on a union with two or more key-bearing members', () => {
  it('A1 two object members', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrObject>(),
      unionKeys: createValidateFn<ObjectOrObject>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrObject>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean first member', value: {a: 'x'}, plain: true, unionKeys: true, strict: true},
      {label: 'sibling member key', value: {a: 'x', b: 1}, plain: true, unionKeys: false, strict: false},
      {label: 'key belonging to nobody', value: {a: 'x', zzz: 9}, plain: true, unionKeys: false, strict: false},
      {label: 'clean second member', value: {b: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'empty object', value: {}, plain: false, unionKeys: false, strict: false},
    ]);
  });

  it('A2 discriminated members, dep-called because they are named', () => {
    const probe: Probe = {
      plain: createValidateFn<Pet>(),
      unionKeys: createValidateFn<Pet>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<Pet>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean cat', value: {kind: 'cat', meows: true}, plain: true, unionKeys: true, strict: true},
      {label: 'cat carrying dog key', value: {kind: 'cat', meows: true, barks: 3}, plain: true, unionKeys: false, strict: false},
      {label: 'cat carrying stray key', value: {kind: 'cat', meows: true, zzz: 9}, plain: true, unionKeys: false, strict: false},
      {label: 'clean dog', value: {kind: 'dog', barks: 2}, plain: true, unionKeys: true, strict: true},
    ]);
  });

  it('A3 object plus a number record', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrNumbers>(),
      unionKeys: createValidateFn<ObjectOrNumbers>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrNumbers>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean object', value: {a: 'x'}, plain: true, unionKeys: true, strict: true},
      {label: 'matches neither member', value: {a: 'x', evil: 'garbage'}, plain: true, unionKeys: false, strict: false},
      {label: 'extra is a number but a is not', value: {a: 'x', evil: 1}, plain: true, unionKeys: false, strict: false},
      {label: 'a real record', value: {p: 1, q: 2}, plain: true, unionKeys: true, strict: true},
      {label: 'empty object is a record', value: {}, plain: true, unionKeys: true, strict: true},
    ]);
  });

  it('A4 the extra key is accepted when the value really is a record', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrStrings>(),
      unionKeys: createValidateFn<ObjectOrStrings>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrStrings>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {
        label: 'every value a string, so it IS a record',
        value: {a: 'x', evil: 'garbage'},
        plain: true,
        unionKeys: true,
        strict: true,
      },
      {label: 'one value is not', value: {a: 'x', evil: 1}, plain: true, unionKeys: false, strict: false},
      {label: 'a plain record', value: {p: '1', q: '2'}, plain: true, unionKeys: true, strict: true},
    ]);
  });

  it('A5 the declared prop has the record value type', () => {
    const probe: Probe = {
      plain: createValidateFn<SamePropType>(),
      unionKeys: createValidateFn<SamePropType>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<SamePropType>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean object', value: {a: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'extra number, still a record', value: {a: 1, evil: 2}, plain: true, unionKeys: true, strict: true},
      {label: 'extra is not a number', value: {a: 1, evil: 's'}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('A6 two declared props plus a record', () => {
    const probe: Probe = {
      plain: createValidateFn<TwoPropsOrNumbers>(),
      unionKeys: createValidateFn<TwoPropsOrNumbers>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<TwoPropsOrNumbers>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean object', value: {a: 'x', b: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'extra string', value: {a: 'x', b: 1, evil: 'g'}, plain: true, unionKeys: false, strict: false},
      {
        label: 'extra number, a still blocks the record',
        value: {a: 'x', b: 1, evil: 2},
        plain: true,
        unionKeys: false,
        strict: false,
      },
    ]);
  });

  it('A7 a discriminant does not rescue the pooled check', () => {
    const probe: Probe = {
      plain: createValidateFn<DiscriminatedOrNumbers>(),
      unionKeys: createValidateFn<DiscriminatedOrNumbers>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<DiscriminatedOrNumbers>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean cat', value: {kind: 'cat', meows: true}, plain: true, unionKeys: true, strict: true},
      {label: 'cat with an extra', value: {kind: 'cat', meows: true, evil: 2}, plain: true, unionKeys: false, strict: false},
      {label: 'a plain record', value: {p: 1}, plain: true, unionKeys: true, strict: true},
    ]);
  });

  it('A8 a Record<string, unknown> member really does declare every key', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrUnknowns>(),
      unionKeys: createValidateFn<ObjectOrUnknowns>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrUnknowns>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'anything extra', value: {a: 'x', evil: 'garbage'}, plain: true, unionKeys: true, strict: true},
      {label: 'unrelated keys', value: {p: 1, q: []}, plain: true, unionKeys: true, strict: true},
    ]);
  });

  it('A9 two records, no object member at all', () => {
    const probe: Probe = {
      plain: createValidateFn<TwoRecords>(),
      unionKeys: createValidateFn<TwoRecords>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<TwoRecords>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'all numbers', value: {p: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'all strings', value: {p: 's'}, plain: true, unionKeys: true, strict: true},
      {label: 'mixed, so neither', value: {p: 1, q: 's'}, plain: false, unionKeys: false, strict: false},
    ]);
  });

  it('A10 three object members', () => {
    const probe: Probe = {
      plain: createValidateFn<ThreeObjects>(),
      unionKeys: createValidateFn<ThreeObjects>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ThreeObjects>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: {a: 'x'}, plain: true, unionKeys: true, strict: true},
      {label: 'key from the third member', value: {a: 'x', c: true}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('A11 a shared prop name with different types', () => {
    const probe: Probe = {
      plain: createValidateFn<SharedPropName>(),
      unionKeys: createValidateFn<SharedPropName>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<SharedPropName>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean first member', value: {id: 'a', x: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'carries the other member key', value: {id: 'a', x: 1, y: 'b'}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('A12 an optional prop is DECLARED, not absent', () => {
    const probe: Probe = {
      plain: createValidateFn<OptionalProp>(),
      unionKeys: createValidateFn<OptionalProp>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<OptionalProp>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'optional absent', value: {a: 'x'}, plain: true, unionKeys: true, strict: true},
      {label: 'optional present', value: {a: 'x', b: 1}, plain: true, unionKeys: true, strict: true},
      {label: 'sibling member key', value: {a: 'x', c: 'y'}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('A13 an atomic beside two objects does not switch the check off', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectsAndAtomic>(),
      unionKeys: createValidateFn<ObjectsAndAtomic>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectsAndAtomic>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'the atomic member', value: 5, plain: true, unionKeys: true, strict: true},
      {label: 'sibling member key', value: {a: 'x', b: 1}, plain: true, unionKeys: false, strict: false},
    ]);
  });
});

// ---------------------------------------------------------------- Group B: the check must NOT run

describe('the check stays inert below two key-bearing members', () => {
  it('B1 one object member beside a number', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrNumber>(),
      unionKeys: createValidateFn<ObjectOrNumber>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrNumber>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [{a: 'x'}, {a: 'x', evil: 1}, 5, 'no']);
    // The contrast that proves the two options are different tools.
    expect(probe.unionKeys({a: 'x', evil: 1})).toBe(true);
    expect(probe.strict({a: 'x', evil: 1})).toBe(false);
  });

  it('B2 several atomics, still one object', () => {
    const probe: Probe = {
      plain: createValidateFn<ObjectOrManyAtomics>(),
      unionKeys: createValidateFn<ObjectOrManyAtomics>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ObjectOrManyAtomics>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [{a: 'x'}, {a: 'x', evil: 1}, 5, 'text', null]);
  });

  it('B3 one record declares every key, so nothing can be unknown', () => {
    const probe: Probe = {
      plain: createValidateFn<RecordOrNumber>(),
      unionKeys: createValidateFn<RecordOrNumber>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<RecordOrNumber>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [{p: 1}, {p: 1, q: 2}, 5, 'no']);
  });

  it('B4 no key-bearing member at all', () => {
    const probe: Probe = {
      plain: createValidateFn<TwoAtomics>(),
      unionKeys: createValidateFn<TwoAtomics>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<TwoAtomics>(undefined, {checkUnknowns: true}),
    };
    inert(probe, ['x', 5, {}, {a: 1}, null]);
  });

  it('B5 Date exposes no properties by name', () => {
    const probe: Probe = {
      plain: createValidateFn<DateOrString>(),
      unionKeys: createValidateFn<DateOrString>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<DateOrString>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [new Date(0), 'x', 5, {}]);
  });

  it('B6 an array member is atomic, so the union has no object member', () => {
    const probe: Probe = {
      plain: createValidateFn<ArrayOrNumber>(),
      unionKeys: createValidateFn<ArrayOrNumber>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ArrayOrNumber>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [[{a: 'x'}], [{a: 'x', evil: 1}], 5]);
    // checkUnknowns still reaches the element, which is the whole difference between the two options.
    expect(probe.unionKeys([{a: 'x', evil: 1}])).toBe(true);
    expect(probe.strict([{a: 'x', evil: 1}])).toBe(false);
  });

  it('B7 a Map holds entries, not properties', () => {
    const probe: Probe = {
      plain: createValidateFn<MapOrString>(),
      unionKeys: createValidateFn<MapOrString>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<MapOrString>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [new Map([['a', 1]]), 'x', 5]);
  });

  it('B8 one named class member', () => {
    const probe: Probe = {
      plain: createValidateFn<ClassOrString>(),
      unionKeys: createValidateFn<ClassOrString>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<ClassOrString>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [new Marker(), {name: 'marker', evil: 1}, 'x']);
  });

  it('B9 the option is inert outside a union', () => {
    const probe: Probe = {
      plain: createValidateFn<PlainObject>(),
      unionKeys: createValidateFn<PlainObject>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<PlainObject>(undefined, {checkUnknowns: true}),
    };
    inert(probe, [{a: 'x'}, {a: 'x', evil: 1}, {}, 5]);
    expect(probe.unionKeys({a: 'x', evil: 1})).toBe(true);
    expect(probe.strict({a: 'x', evil: 1})).toBe(false);
  });
});

// ---------------------------------------------------------------- Group B, the stronger form

/** One family's emitted body for `typeId`, its 4-char family hash blanked out so two families can be compared byte for byte. */
function bodyOf(fnKey: string, typeId: string): string {
  const hash = getFnHash(fnKey);
  const entry = (getRTFnCaches().rtFnsCache as Record<string, any>)[`${hash}_${typeId}`];
  expect(entry, `no ${fnKey} entry compiled for ${typeId}`).toBeDefined();
  return entryCode(entry).split(hash).join('FN');
}

describe('an inert option emits the plain body, byte for byte', () => {
  // Behavioural equality can hide a check that runs and happens to pass on every value tried; body equality cannot.
  it('B1 one object member beside a number', () => {
    createValidateFn<ObjectOrNumber>();
    createValidateFn<ObjectOrNumber>(undefined, {checkUnionUnknowns: true});
    const id = getRunTypeId<ObjectOrNumber>();
    expect(bodyOf('validateUnionKeys', id)).toBe(bodyOf('validate', id));
  });

  it('B4 no key-bearing member at all', () => {
    createValidateFn<TwoAtomics>();
    createValidateFn<TwoAtomics>(undefined, {checkUnionUnknowns: true});
    const id = getRunTypeId<TwoAtomics>();
    expect(bodyOf('validateUnionKeys', id)).toBe(bodyOf('validate', id));
  });

  it('B9 not a union, reached through the value-first marker shape', () => {
    createValidateFn<PlainObject>();
    createValidateFn<PlainObject>(undefined, {checkUnionUnknowns: true});
    // The value-first call shape, the Marker test coverage rule's second half.
    const id = getRunTypeId({a: 'x'} as PlainObject);
    expect(bodyOf('validateUnionKeys', id)).toBe(bodyOf('validate', id));
  });
});

// ---------------------------------------------------------------- Group C: depth

describe('where the check sits, and where it stops', () => {
  it('C1 a union under a property', () => {
    const probe: Probe = {
      plain: createValidateFn<NestedUnion>(),
      unionKeys: createValidateFn<NestedUnion>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<NestedUnion>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: {pet: {kind: 'cat', meows: true}}, plain: true, unionKeys: true, strict: true},
      {label: 'sibling key', value: {pet: {kind: 'cat', meows: true, barks: 3}}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('C2 a union inside an array', () => {
    const probe: Probe = {
      plain: createValidateFn<UnionInArray>(),
      unionKeys: createValidateFn<UnionInArray>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<UnionInArray>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: [{a: 'x'}, {b: 1}], plain: true, unionKeys: true, strict: true},
      {label: 'sibling key', value: [{a: 'x', b: 1}], plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('C3 a union in a tuple slot', () => {
    const probe: Probe = {
      plain: createValidateFn<UnionInTuple>(),
      unionKeys: createValidateFn<UnionInTuple>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<UnionInTuple>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: [{a: 'x'}, 'z'], plain: true, unionKeys: true, strict: true},
      {label: 'sibling key', value: [{a: 'x', b: 1}, 'z'], plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('C4 a union as a record value type', () => {
    const probe: Probe = {
      plain: createValidateFn<UnionAsRecordValue>(),
      unionKeys: createValidateFn<UnionAsRecordValue>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<UnionAsRecordValue>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: {k: {a: 'x'}}, plain: true, unionKeys: true, strict: true},
      {label: 'sibling key', value: {k: {a: 'x', b: 1}}, plain: true, unionKeys: false, strict: false},
    ]);
  });

  it('C5 a plain object inside a member is not a union node', () => {
    // checkUnionUnknowns asks only what the MATCHED member declares, so a key on a nested plain object is not its business.
    const probe: Probe = {
      plain: createValidateFn<NestedObjectOrNumbers>(),
      unionKeys: createValidateFn<NestedObjectOrNumbers>(undefined, {checkUnionUnknowns: true}),
      strict: createValidateFn<NestedObjectOrNumbers>(undefined, {checkUnknowns: true}),
    };
    check(probe, [
      {label: 'clean', value: {a: {x: 'v'}}, plain: true, unionKeys: true, strict: true},
      {label: 'extra on the NESTED object', value: {a: {x: 'v', evil: 1}}, plain: true, unionKeys: true, strict: false},
      {label: 'extra on the union node', value: {a: {x: 'v'}, evil: 'g'}, plain: true, unionKeys: false, strict: false},
    ]);
  });
});

// ---------------------------------------------------------------- Group D: why the families disagree

describe('the key families cannot all agree, and this is the line', () => {
  // Codecs pool every member's keys (all keys once a record joins); answering per branch would mean validating in each.
  // The clone decoder stands in for the pooled families below.
  it('the pooled answer admits a sibling key that the matched branch rejects', () => {
    const validate = createValidateFn<Pet>();
    const cloneDecode = createJsonDecoderFn<Pet>(undefined, {strategy: 'clone'});
    const unionKeys = createValidateFn<Pet>(undefined, {checkUnionUnknowns: true});
    const mixed = {kind: 'cat', meows: true, barks: 3};
    expect(validate(mixed)).toBe(true);
    expect(cloneDecode(JSON.stringify(mixed))).toStrictEqual(mixed);
    expect(unionKeys(mixed)).toBe(false);
  });

  it('a key belonging to NO member is rejected by both, and that must never drift', () => {
    const cloneDecode = createJsonDecoderFn<Pet>(undefined, {strategy: 'clone'});
    const unionKeys = createValidateFn<Pet>(undefined, {checkUnionUnknowns: true});
    const stray = {kind: 'cat', meows: true, zzz: 9};
    const stripped = cloneDecode(JSON.stringify(stray)) as Record<string, unknown>;
    expect(stripped.zzz).toBeUndefined();
    expect(stripped).toEqual({kind: 'cat', meows: true});
    expect(unionKeys(stray)).toBe(false);
  });

  it('a record member blinds the pooled families for the whole subtree', () => {
    const cloneDecode = createJsonDecoderFn<ObjectOrNumbers>(undefined, {strategy: 'clone'});
    const unionKeys = createValidateFn<ObjectOrNumbers>(undefined, {checkUnionUnknowns: true});
    const value = {a: 'x', evil: 'garbage'};
    expect(cloneDecode(JSON.stringify(value))).toStrictEqual(value);
    expect(unionKeys(value)).toBe(false);
  });
});
