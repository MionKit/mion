// The compact-JSON maximum of a fully bounded type rides the trailing slot of
// its reflection ROOT row (`jsonMaxBytes`, cachegen/jsonsize on the Go side)
// and surfaces on the registered RunType. A nested node never carries it, and a
// type with any unbounded part (a plain string, a plain array, a Map without
// maxSize) leaves the slot empty. The mion router turns the number into a
// per-route request / response limit, so the arithmetic is pinned here against
// the rules the walk documents: 6 bytes per UTF-16 unit for a string, 24 for
// a number, keys as their JSON literal, brackets and commas as written.
//
// Marker coverage rule: every case runs the static `getRunType<T>()` shape AND
// the value-first `getRunType(value)` shape, and one asserts the two forms
// land on the same registered entry.

import {describe, it, expect} from 'vitest';
import {getRunType, getRunTypeId} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';

interface Item {
  id: TF.String<{maxLength: 36}>;
  qty: number;
}
type Page = TF.List<Item, 50>;
type Params = [orderId: TF.String<{maxLength: 36}>, items: Page];

const ITEM_BYTES = 1 + 5 + (2 + 6 * 36) + 1 + 6 + 24 + 1; // {"id":<218>,"qty":<24>}
const PAGE_BYTES = 2 + 50 * ITEM_BYTES + 49; // [ 50 items, 49 commas ]

describe('jsonMaxBytes on the reflection root', () => {
  it('(static) a bounded object root carries its compact-JSON maximum', () => {
    expect(getRunType<Item>().jsonMaxBytes).toBe(ITEM_BYTES);
  });

  it('(reflect) the value-first form lands on the same root with the same number', () => {
    const item: Item = {id: 'a' as Item['id'], qty: 1};
    expect(getRunType(item)).toBe(getRunType<Item>());
    expect(getRunType(item).jsonMaxBytes).toBe(ITEM_BYTES);
    expect(getRunTypeId(item)).toBe(getRunTypeId<Item>());
  });

  it('(static) a List and a params tuple sum their members with brackets and commas', () => {
    expect(getRunType<Page>().jsonMaxBytes).toBe(PAGE_BYTES);
    expect(getRunType<Params>().jsonMaxBytes).toBe(2 + (2 + 6 * 36) + 1 + PAGE_BYTES);
  });

  it('(reflect) the value-first List builder converges on the same number', () => {
    const page = RT.array(RT.object({id: TF.string({maxLength: 36}), qty: TF.number()}), {maxItems: 50});
    expect(getRunType(page).jsonMaxBytes).toBe(PAGE_BYTES);
    expect(getRunTypeId(page)).toBe(getRunTypeId<Page>());
  });

  it('(static) an unbounded root leaves the slot empty', () => {
    expect(getRunType<string>().jsonMaxBytes).toBeUndefined();
    expect(getRunType<{name: string; qty: number}>().jsonMaxBytes).toBeUndefined();
    expect(getRunType<Item[]>().jsonMaxBytes).toBeUndefined();
    expect(getRunType<Map<string, number>>().jsonMaxBytes).toBeUndefined();
  });

  it('(reflect) an unbounded value-first root leaves the slot empty', () => {
    const loose = {name: 'x', qty: 1};
    expect(getRunType(loose).jsonMaxBytes).toBeUndefined();
  });

  it('(static) a property node never carries the slot, only a root does', () => {
    // Rows are shared app-wide, so a nested TYPE (`number`) that is also a root
    // elsewhere in this bundle carries its own number; a property node is never
    // a root, so it never does.
    const root = getRunType<Item>();
    expect(root.children?.length).toBe(2);
    for (const child of root.children ?? []) expect(child.jsonMaxBytes).toBeUndefined();
  });

  it('(static) sized Map and Set roots are bounded like arrays of their entries', () => {
    // a Map is an array of [key, value] pairs: [ + 2 × ([24,5]) + , + ]
    expect(getRunType<TF.SizedMap<number, boolean, 2>>().jsonMaxBytes).toBe(2 + 2 * (24 + 5 + 3) + 1);
    // a Set is an array of its members
    expect(getRunType<TF.SizedSet<number, 3>>().jsonMaxBytes).toBe(2 + 3 * 24 + 2);
  });

  it('(reflect) the value-first map / set builders converge on the same numbers', () => {
    const sizedMap = RT.map(TF.number(), RT.boolean(), {maxSize: 2});
    const sizedSet = RT.set(TF.number(), {maxSize: 3});
    expect(getRunTypeId(sizedMap)).toBe(getRunTypeId<TF.SizedMap<number, boolean, 2>>());
    expect(getRunTypeId(sizedSet)).toBe(getRunTypeId<TF.SizedSet<number, 3>>());
    expect(getRunType(sizedMap).jsonMaxBytes).toBe(2 + 2 * (24 + 5 + 3) + 1);
    expect(getRunType(sizedSet).jsonMaxBytes).toBe(2 + 3 * 24 + 2);
  });
});
