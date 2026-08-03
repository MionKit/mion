// OneOf / AnyOf — the exactly-one and at-least-one combinators, in all
// three authoring modes: the OneOf<[…]> / AnyOf<[…]> types, the RT.oneOf /
// RT.anyOf builders, and JSON Schema oneOf / anyOf. anyOf is the plain
// union (at-least-one IS union validation, so it converges on the union's
// id); oneOf rides per-branch CARRIERS — every non-nullish member
// intersects an optional `__rtOneOf` prop holding the branch tuple, so the
// grouping survives union flattening, consumption keeps plain-union DX
// (discriminated switches, widening, narrowing), the union node carries
// the branch list, and validate counts branch matches (exactly one).
// Nullish branches stay plain (an intersection would reduce them away).
// Marker rule: both getRunTypeId call shapes pinned with a hash-equivalence
// pair.
import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  getRunTypeId,
  getRunType,
  type OneOf,
  type AnyOf,
  type DataOnly,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';

interface ArmA {
  a: string;
}
interface ArmB {
  b: string;
}

describe('oneOf — exactly-one across the three authoring modes', () => {
  it('converges on ONE cached factory: type-first, RT.oneOf, schema door', () => {
    const typeFirst = getRunTypeId<OneOf<[ArmA, ArmB]>>();
    const valueFirst = getRunTypeId(RT.oneOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})]));
    const schemaDoor = getRunTypeId(
      runTypeFromJsonSchema({
        oneOf: [
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {b: {type: 'string'}}, required: ['b']},
        ],
      })
    );
    expect(valueFirst).toBe(typeFirst);
    expect(schemaDoor).toBe(typeFirst);
  });

  it('is a distinct identity from the plain union', () => {
    expect(getRunTypeId<OneOf<[ArmA, ArmB]>>()).not.toBe(getRunTypeId<ArmA | ArmB>());
  });

  it('projects a clean union node with the branch list attached', () => {
    const node = getRunType<OneOf<[ArmA, ArmB]>>();
    expect(node.children?.length).toBe(2);
    expect(node.oneOf?.length).toBe(2);
  });

  it('rejects a value matching two branches where the union accepts it', () => {
    const exactlyOne = createValidateFn<OneOf<[ArmA, ArmB]>>();
    const atLeastOne = createValidateFn<ArmA | ArmB>();
    expect(exactlyOne({a: 'x'})).toBe(true);
    expect(exactlyOne({b: 'y'})).toBe(true);
    expect(exactlyOne({a: 'x', b: 'y'})).toBe(false);
    expect(atLeastOne({a: 'x', b: 'y'})).toBe(true);
    expect(exactlyOne({})).toBe(false);
    expect(exactlyOne(null)).toBe(false);
  });

  it('keeps a null branch intact (the nullable-via-oneOf idiom)', () => {
    const nullable = createValidateFn(
      runTypeFromJsonSchema({
        oneOf: [{type: 'object', properties: {a: {type: 'string'}}, required: ['a']}, {type: 'null'}],
      })
    );
    expect(nullable(null)).toBe(true);
    expect(nullable({a: 'x'})).toBe(true);
    expect(nullable({})).toBe(false);
    expect(nullable(1)).toBe(false);
  });

  it('counts BRANCHES, not flattened members: a union-valued branch matches once', () => {
    type Grouped = FromJsonSchema<{
      readonly oneOf: readonly [
        {
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}};
          readonly required: readonly ['a'];
        },
        {
          readonly anyOf: readonly [
            {
              readonly type: 'object';
              readonly properties: {readonly b: {readonly type: 'string'}};
              readonly required: readonly ['b'];
            },
            {
              readonly type: 'object';
              readonly properties: {readonly c: {readonly type: 'string'}};
              readonly required: readonly ['c'];
            },
          ];
        },
      ];
    }>;
    const grouped = createValidateFn<Grouped>();
    // b+c both live in branch 2 — ONE branch matched, so it passes.
    expect(grouped({b: 'x', c: 'y'})).toBe(true);
    // a+b span branch 1 and branch 2 — two branches, rejected.
    expect(grouped({a: 'x', b: 'y'})).toBe(false);
  });

  it('nests: an inner OneOf branch keeps its own exclusivity', () => {
    const nested = createValidateFn<OneOf<[OneOf<[ArmA, ArmB]>, {c: string}]>>();
    expect(nested({a: 'x'})).toBe(true);
    expect(nested({c: 'z'})).toBe(true);
    // Matches BOTH inner branches → fails the inner OneOf → matches only… nothing.
    expect(nested({a: 'x', b: 'y'})).toBe(false);
    // Matches inner (via a) AND the outer c branch → two outer branches.
    expect(nested({a: 'x', c: 'z'})).toBe(false);
  });

  it('verr: matched-none reports the union error, matched-several the oneOf error', () => {
    const verr = createGetValidationErrorsFn<OneOf<[ArmA, ArmB]>>();
    expect(verr({a: 'x'})).toEqual([]);
    const none = verr({});
    expect(none.length).toBeGreaterThan(0);
    expect(none[0]?.expected).toBe('union');
    const multi = verr({a: 'x', b: 'y'});
    expect(multi.length).toBeGreaterThan(0);
    expect(multi[0]?.format).toEqual({name: 'oneOf', formatPath: ['oneOf'], val: 2});
  });

  it('mocks land in exactly one branch — validate(mock()) holds', () => {
    const mock = createMockDataFn<OneOf<[ArmA, ArmB]>>();
    const validate = createValidateFn<OneOf<[ArmA, ArmB]>>();
    for (let i = 0; i < 50; i++) expect(validate(mock())).toBe(true);
  });

  it('mock.unionIndex picks the oneOf BRANCH (the author call, no fallback)', () => {
    const mockB = createMockDataFn<OneOf<[ArmA, ArmB]>>(undefined, {mock: {unionIndex: 1}});
    const validate = createValidateFn<OneOf<[ArmA, ArmB]>>();
    for (let i = 0; i < 20; i++) {
      const value = mockB() as ArmB;
      expect(typeof value.b).toBe('string');
      expect(validate(value)).toBe(true);
    }
    const outOfRange = createMockDataFn<OneOf<[ArmA, ArmB]>>(undefined, {mock: {unionIndex: 5}});
    expect(() => outOfRange()).toThrow(/unionIndex/);
  });

  // 33 duplicate 'd' branches + one satisfiable branch at index 33: rotation
  // must reach PAST the old fixed 32-attempt budget to find it (the budget
  // now scales with branch count), and an author-picked duplicate branch
  // throws loudly instead of silently falling back.
  type WideOneOf = OneOf<
    [
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      'd',
      42,
    ]
  >;
  it('rotation reaches branches past 32 (scaled attempt budget)', () => {
    const mock = createMockDataFn<WideOneOf>();
    const validate = createValidateFn<WideOneOf>();
    for (let i = 0; i < 10; i++) {
      const value = mock();
      expect(value).toBe(42); // the only branch a candidate can win exclusively
      expect(validate(value)).toBe(true);
    }
    const pickedDuplicate = createMockDataFn<WideOneOf>(undefined, {mock: {unionIndex: 0}});
    expect(() => pickedDuplicate()).toThrow(/exactly one branch/);
  });

  it('duplicate branches accept nothing (every match is a double match)', () => {
    const dup = createValidateFn(runTypeFromJsonSchema({oneOf: [{type: 'string'}, {type: 'string'}]}));
    expect(dup('anything')).toBe(false);
    expect(dup(1)).toBe(false);
  });

  it('duplicate NULL branches accept nothing (the carrier-less degenerate)', () => {
    // Nullish branches carry no sentinel by design, so the all-nullish
    // duplicate used to land as plain `null` and silently accept what
    // exactly-one rejects. The arm formula now resolves a duplicated
    // nullish branch to never, in the schema door and the OneOf<[…]> twin.
    expect(getRunTypeId(runTypeFromJsonSchema({oneOf: [{type: 'null'}, {type: 'null'}]}))).toBe(getRunTypeId<never>());
    const dupNull = createValidateFn(runTypeFromJsonSchema({oneOf: [{type: 'null'}, {type: 'null'}]}));
    expect(dupNull(null)).toBe(false);
    expect(dupNull('x')).toBe(false);
    type StaticTwin = OneOf<[null, null]>;
    const staticPin: [StaticTwin] extends [never] ? true : false = true;
    expect(staticPin).toBe(true);
    expect(getRunTypeId<StaticTwin>()).toBe(getRunTypeId<never>());
  });

  it('duplicate null beside a real branch: null rejected by count, the branch stays', () => {
    type Mixed = FromJsonSchema<{
      readonly oneOf: readonly [{readonly type: 'null'}, {readonly type: 'null'}, {readonly type: 'string'}];
    }>;
    // The type excludes the over-matched null (it can never win exactly-one)…
    // @ts-expect-error — null is not assignable to the surviving carrier'd branch
    const rejected: Mixed = null;
    void rejected;
    const accepted: Mixed = 'x';
    const staticId = getRunTypeId<Mixed>();
    expect(getRunTypeId(accepted)).toBe(staticId); // marker pair: reflection agrees
    // …and the runtime counts the duplicates from the branch tuple.
    const fn = createValidateFn(runTypeFromJsonSchema({oneOf: [{type: 'null'}, {type: 'null'}, {type: 'string'}]}));
    expect(fn('x')).toBe(true); // one match — the string branch
    expect(fn(null)).toBe(false); // two matches — both null branches
    expect(fn(1)).toBe(false); // zero matches
  });

  it('a single null branch stays valid (no duplicate, the nullable idiom intact)', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({oneOf: [{type: 'null'}, {type: 'string'}]}));
    expect(fn(null)).toBe(true);
    expect(fn('x')).toBe(true);
    expect(fn(1)).toBe(false);
  });

  it('a single-branch oneOf normalizes to the branch itself', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({oneOf: [{type: 'string'}]}))).toBe(getRunTypeId<string>());
  });

  it('an empty oneOf accepts nothing (never)', () => {
    type Empty = FromJsonSchema<{readonly oneOf: readonly []}>;
    const pin: [Empty] extends [never] ? true : false = true;
    expect(pin).toBe(true);
  });

  it('constraining siblings beside oneOf poison to never (loud, never silent widening)', () => {
    type WithType = FromJsonSchema<{
      readonly type: 'string';
      readonly oneOf: readonly [{readonly minLength: 1}, {readonly maxLength: 2}];
    }>;
    const typePin: [WithType] extends [never] ? true : false = true;
    expect(typePin).toBe(true);
    type InAllOf = FromJsonSchema<{
      readonly allOf: readonly [
        {readonly oneOf: readonly [{readonly type: 'string'}, {readonly type: 'number'}]},
        {readonly type: 'string'},
      ];
    }>;
    const allOfPin: [InAllOf] extends [never] ? true : false = true;
    expect(allOfPin).toBe(true);
  });

  it('DataOnly keeps the value space and the exclusivity survives the projection', () => {
    const validate = createValidateFn<DataOnly<OneOf<[ArmA, ArmB]>>>();
    expect(validate({a: 'x'})).toBe(true);
    expect(validate({a: 'x', b: 'y'})).toBe(false);
  });
});

describe('anyOf — at-least-one is the union itself', () => {
  it('AnyOf<[…]> and RT.anyOf converge on the plain union id', () => {
    const plain = getRunTypeId<ArmA | ArmB>();
    expect(getRunTypeId<AnyOf<[ArmA, ArmB]>>()).toBe(plain);
    expect(getRunTypeId(RT.anyOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})]))).toBe(plain);
  });

  it('accepts a value matching several branches', () => {
    const any = createValidateFn<AnyOf<[ArmA, ArmB]>>();
    expect(any({a: 'x'})).toBe(true);
    expect(any({a: 'x', b: 'y'})).toBe(true);
    expect(any({})).toBe(false);
  });
});

describe('oneOf — type-level acceptance and plain-union consumption DX', () => {
  interface KindA {
    kind: 'a';
    x: number;
  }
  interface KindB {
    kind: 'b';
    y: string;
  }

  it('accepts every branch value at the type level', () => {
    const objA: OneOf<[ArmA, ArmB]> = {a: 'x'};
    const objB: OneOf<[ArmA, ArmB]> = {b: 'y'};
    const prim1: OneOf<[string, number]> = 'text';
    const prim2: OneOf<[string, number]> = 42;
    const withNull: OneOf<[ArmA, null]> = null;
    const lit: OneOf<['on', 'off']> = 'on';
    const viaSchema: FromJsonSchema<{readonly oneOf: readonly [{readonly type: 'string'}, {readonly type: 'number'}]}> = 'text';
    // @ts-expect-error — a non-branch value must not assign
    const bad: OneOf<[string, number]> = true;
    expect([objA, objB, prim1, prim2, withNull, lit, viaSchema, bad]).toBeDefined();
  });

  it('switches on a discriminant like a plain union', () => {
    const u = {kind: 'a', x: 1} as OneOf<[KindA, KindB]>;
    switch (u.kind) {
      case 'a': {
        const n: number = u.x;
        expect(n).toBe(1);
        break;
      }
      case 'b': {
        const s: string = u.y;
        expect(s).toBeDefined();
        break;
      }
    }
  });

  it('widens back to the plain union', () => {
    const u = {kind: 'a', x: 1} as OneOf<[KindA, KindB]>;
    const plain: KindA | KindB = u;
    expect(plain.kind).toBe('a');
  });

  it('typeof narrowing leaves no phantom arm', () => {
    const u = 'text' as OneOf<[string, number]>;
    if (typeof u === 'string') {
      const s: string = u;
      expect(s).toBe('text');
    } else {
      const n: number = u;
      expect(n).toBeDefined();
    }
  });

  it('a null branch narrows away like a plain union member', () => {
    const u = null as OneOf<[KindA, null]>;
    if (u !== null) {
      const k: 'a' = u.kind;
      expect(k).toBeDefined();
    }
    expect(u).toBeNull();
  });

  it('a union-valued branch keeps its own null (the distributive arm check)', () => {
    // Branch 2 is itself `{b} | null` — the nullish check must distribute
    // INTO the branch so its null stays plain instead of dying in an
    // intersection; null then validates via branch 2 exactly once.
    const nullable = createValidateFn(
      runTypeFromJsonSchema({
        oneOf: [
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {
            anyOf: [{type: 'object', properties: {b: {type: 'string'}}, required: ['b']}, {type: 'null'}],
          },
        ],
      })
    );
    expect(nullable(null)).toBe(true);
    expect(nullable({a: 'x'})).toBe(true);
    expect(nullable({b: 'y'})).toBe(true);
    expect(nullable({a: 'x', b: 'y'})).toBe(false);
  });

  it('wide unions: 40 branches with no recursion wall', () => {
    type Wide = OneOf<
      [
        'w01',
        'w02',
        'w03',
        'w04',
        'w05',
        'w06',
        'w07',
        'w08',
        'w09',
        'w10',
        'w11',
        'w12',
        'w13',
        'w14',
        'w15',
        'w16',
        'w17',
        'w18',
        'w19',
        'w20',
        'w21',
        'w22',
        'w23',
        'w24',
        'w25',
        'w26',
        'w27',
        'w28',
        'w29',
        'w30',
        'w31',
        'w32',
        'w33',
        'w34',
        'w35',
        'w36',
        'w37',
        'w38',
        'w39',
        'w40',
      ]
    >;
    const validate = createValidateFn<Wide>();
    expect(validate('w01')).toBe(true);
    expect(validate('w40')).toBe(true);
    expect(validate('w41')).toBe(false);
    expect(getRunType<Wide>().oneOf?.length).toBe(40);
  });

  it('a branch that subtypes a sibling: runtime stays exact under type reduction', () => {
    // {a; b} subtypes {a}; the union FACE may reduce to the supertype arm,
    // but the branch tuple in the carrier keeps both — a value matching
    // both branches still fails exactly-one.
    type Narrow = FromJsonSchema<{
      readonly oneOf: readonly [
        {
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}};
          readonly required: readonly ['a'];
        },
        {
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}; readonly b: {readonly type: 'number'}};
          readonly required: readonly ['a', 'b'];
        },
      ];
    }>;
    const validate = createValidateFn<Narrow>();
    expect(validate({a: 'x'})).toBe(true); // matches branch 1 only
    expect(validate({a: 'x', b: 1})).toBe(false); // matches both branches
    expect(getRunType<Narrow>().oneOf?.length).toBe(2);
  });
});

describe('oneOf — carrier interning regression', () => {
  // In a LARGE written type, tsgo may not intern two spellings of the
  // identical carrier tuple to one type object; carrier detection must
  // dedupe by canonical print, or the level reads as ambiguous and the
  // exclusivity silently drops (caught by the jsonschema fuzz lane,
  // seed 1644750389). This pins the reduced fixture.
  it('two non-interned carrier spellings still detect as one level', () => {
    type BrandedArr = Array<string> & {readonly __rtFormatName?: 'formattedArray'; readonly __rtFormatParams?: {maxItems: 4}};
    type T = Record<
      string,
      [
        Record<string, null>,
        (
          | ({tag: string} & {readonly __rtOneOf?: [{tag: string}, Array<BrandedArr>]})
          | (Array<BrandedArr> & {readonly __rtOneOf?: [{tag: string}, Array<BrandedArr>]})
        ),
        string,
        string,
      ]
    >;
    const typeFirst = getRunTypeId<T>();
    const schemaDoor = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'object',
        additionalProperties: {
          type: 'array',
          prefixItems: [
            {type: 'object', additionalProperties: {type: 'null'}},
            {
              oneOf: [
                {type: 'object', properties: {tag: {type: 'string'}}, required: ['tag']},
                {type: 'array', items: {type: 'array', items: {type: 'string'}, maxItems: 4}},
              ],
            },
            {type: 'string'},
            {type: 'string'},
          ],
          minItems: 4,
          items: false,
        },
      })
    );
    expect(schemaDoor).toBe(typeFirst);
    // And the exclusivity actually enforces at this depth.
    const validate = createValidateFn<T>();
    expect(validate({k: [{}, {tag: 'x'}, 'a', 'b']})).toBe(true);
    expect(validate({k: [{}, [['s']], 'a', 'b']})).toBe(true);
  });
});

describe('oneOf — marker rule', () => {
  it('static shape: getRunTypeId<T>()', () => {
    expect(getRunTypeId<OneOf<[ArmA, ArmB]>>()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('reflection shape: getRunTypeId(value)', () => {
    const v: OneOf<[ArmA, ArmB]> = {a: 'x'};
    expect(getRunTypeId(v)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('hash equivalence: both shapes resolve the same cache entry', () => {
    const v: OneOf<[ArmA, ArmB]> = {b: 'y'};
    expect(getRunTypeId(v)).toBe(getRunTypeId<OneOf<[ArmA, ArmB]>>());
  });
});
