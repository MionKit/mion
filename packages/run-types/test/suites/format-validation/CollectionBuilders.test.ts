// The value-first Set / Map builders converge on the type-first wrappers and,
// without a bag, on the plain collection: one id each way, both marker shapes.
// All three collection wrappers take the SAME bag, FormattedCollectionParams.
import {describe, it, expect} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {getRunTypeId} from '@mionjs/run-types';

type BoundedTags = TF.FormattedSet<Set<string>, {maxItems: 3; uniqueItems: true}>;
type NumberSomewhere = TF.FormattedSet<Set<unknown>, {contains: number; minContains: 2}>;
type SmallLookup = TF.FormattedMap<Map<string, number>, {minItems: 1; maxItems: 2}>;
type UniqueLookup = TF.FormattedMap<Map<{id: number}, string>, {uniqueItems: true}>;
type AdminSomewhere = TF.FormattedMap<Map<string, number>, {contains: ['admin', unknown]}>;

// The deprecated pre-rename spellings still name the same bags (one release).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const sameBag: Equal<TF.FormattedArrayParams, TF.FormattedCollectionParams> = true;
const sameValueFirstBag: Equal<TF.FormattedArrayParamsValueFirst, TF.FormattedCollectionParamsValueFirst> = true;

describe('format-validation / collection builders', () => {
  it('a bare set() / map() keeps the plain collection id', () => {
    expect(getRunTypeId(RT.set(TF.string()))).toBe(getRunTypeId<Set<string>>());
    expect(getRunTypeId(RT.map(TF.string(), TF.number()))).toBe(getRunTypeId<Map<string, number>>());
  });

  it('set(item, params) is FormattedSet, both marker shapes', () => {
    const tags: BoundedTags = new Set(['a']) as BoundedTags;
    expect(getRunTypeId(RT.set(TF.string(), {maxItems: 3, uniqueItems: true}))).toBe(getRunTypeId<BoundedTags>());
    expect(getRunTypeId(tags)).toBe(getRunTypeId<BoundedTags>());
    expect(getRunTypeId(RT.set(RT.unknown(), {contains: TF.number(), minContains: 2}))).toBe(getRunTypeId<NumberSomewhere>());
    expect(getRunTypeId<BoundedTags>()).not.toBe(getRunTypeId<Set<string>>());
  });

  it('map(key, value, params) is FormattedMap, both marker shapes', () => {
    const lookup: SmallLookup = new Map([['a', 1]]) as SmallLookup;
    expect(getRunTypeId(RT.map(TF.string(), TF.number(), {minItems: 1, maxItems: 2}))).toBe(getRunTypeId<SmallLookup>());
    expect(getRunTypeId(lookup)).toBe(getRunTypeId<SmallLookup>());
    expect(getRunTypeId<SmallLookup>()).not.toBe(getRunTypeId<Map<string, number>>());
  });

  it('a Map takes the whole collection bag: uniqueItems and a contains tuple', () => {
    const unique: UniqueLookup = new Map([[{id: 1}, 'a']]) as UniqueLookup;
    expect(getRunTypeId(RT.map(RT.object({id: TF.number()}), TF.string(), {uniqueItems: true}))).toBe(
      getRunTypeId<UniqueLookup>()
    );
    expect(getRunTypeId(unique)).toBe(getRunTypeId<UniqueLookup>());
    // A Map's entry is its [key, value] pair, so the contains child is a tuple.
    expect(
      getRunTypeId(RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]})}))
    ).toBe(getRunTypeId<AdminSomewhere>());
    expect(getRunTypeId<AdminSomewhere>()).not.toBe(getRunTypeId<Map<string, number>>());
  });

  it('the deprecated params-bag aliases still name the renamed bags', () => {
    expect(sameBag).toBe(true);
    expect(sameValueFirstBag).toBe(true);
  });
});
