// The value-first Set / Map builders converge on the type-first wrappers and,
// without a bag, on the plain collection: one id each way, both marker shapes.
import {describe, it, expect} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {getRunTypeId} from '@mionjs/run-types';

type BoundedTags = TF.FormattedSet<Set<string>, {maxItems: 3; uniqueItems: true}>;
type NumberSomewhere = TF.FormattedSet<Set<unknown>, {contains: number; minContains: 2}>;
type SmallLookup = TF.FormattedMap<Map<string, number>, {minItems: 1; maxItems: 2}>;

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
});
