// A MIXED record — named members beside an index signature — in both
// authoring forms.
//
// `object(...)` carries named members but no index; `record(...)` carries an
// index but no named members. Their INTERSECTION is exactly the shape, because
// `Record<K, V> & {…}` is what TypeScript resolves the mixed object literal to.
//
// The members are NOT constrained to the index's type — TypeScript only
// requires each to be assignable to it — so each variant below (narrower,
// optional, readonly, typed index) is a DISTINCT type and gets its own pin.
import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@mionjs/run-types';
import {intersection, record, object, optional, propMod, union, literal, unknown as rtUnknown} from '@mionjs/run-types/builders';

describe('mixed record — named members beside an index', () => {
  it('a narrower member converges in both forms', () => {
    interface Mixed {
      name: string;
      [key: string]: unknown;
    }
    const typeFirst = getRunTypeId<Mixed>();
    expect(getRunTypeId(intersection(record(rtUnknown()), object({name: TF.string()})))).toBe(typeFirst);
    const sample: Mixed = {name: 'ada'};
    expect(getRunTypeId(sample)).toBe(typeFirst);
  });

  it('an optional member converges', () => {
    interface Loose {
      name?: string;
      [key: string]: unknown;
    }
    expect(getRunTypeId(intersection(record(rtUnknown()), object({name: optional(TF.string())})))).toBe(getRunTypeId<Loose>());
    const sample: Loose = {};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<Loose>());
  });

  it('a readonly member converges', () => {
    interface Frozen {
      readonly name: string;
      [key: string]: unknown;
    }
    expect(getRunTypeId(intersection(record(rtUnknown()), object({name: propMod({readonly: true}, TF.string())})))).toBe(
      getRunTypeId<Frozen>()
    );
  });

  it('a narrower member over a TYPED index converges in both forms', () => {
    interface Typed {
      id: 'a' | 'b';
      [key: string]: string;
    }
    const typeFirst = getRunTypeId<Typed>();
    expect(getRunTypeId(intersection(record(TF.string()), object({id: union([literal('a'), literal('b')])})))).toBe(typeFirst);
    const sample: Typed = {id: 'a'};
    expect(getRunTypeId(sample)).toBe(typeFirst);
  });

  it('a number-keyed index beside a member converges', () => {
    interface NumericMixed {
      id: number;
      [key: number]: number;
    }
    expect(getRunTypeId(intersection(record(TF.number(), TF.number()), object({id: TF.number()})))).toBe(
      getRunTypeId<NumericMixed>()
    );
  });

  it('index shapes record(...) can say on its own', () => {
    // Any KEY type, and several signatures sharing one value type ARE a
    // union-keyed record.
    expect(getRunTypeId(record(TF.number(), TF.string()))).toBe(getRunTypeId<{[key: number]: string}>());
    expect(getRunTypeId(record(union([TF.string(), TF.number()]), TF.number()))).toBe(
      getRunTypeId<{[k: string]: number; [n: number]: number}>()
    );
  });
});
