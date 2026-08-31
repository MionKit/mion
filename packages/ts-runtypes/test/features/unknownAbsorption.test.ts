// `unknown` absorbs its union siblings INSIDE THE CHECKER: `string | unknown`
// IS `unknown` — one type, one structural id — before any RunTypes machinery
// runs. So every authoring form of an absorbed union resolves to the same
// factory as plain `unknown`, the generated functions are unknown's (validate
// accepts everything — the VL021 lint warning tells the author), and the
// convert roundtrip prints the collapsed spelling with the id untouched.
// `never` is the mirror image: it VANISHES from a union.
import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@mionjs/run-types';
import {union, unknown as rtUnknown} from '@mionjs/run-types/builders';

describe('unknown absorption is id-neutral', () => {
  it('value-first, type-first and value call shapes all land on unknown', () => {
    const unknownId = getRunTypeId<unknown>();
    // Value-first: the union builder's type parameter collapses at instantiation.
    expect(getRunTypeId(union([TF.string(), rtUnknown()]))).toBe(unknownId);
    // Type-first: the written union is the same single type.
    type Absorbed = string | unknown;
    expect(getRunTypeId<Absorbed>()).toBe(unknownId);
    // Reflection shape: T inferred from a value of the absorbed union.
    const sample: Absorbed = 42;
    expect(getRunTypeId(sample)).toBe(unknownId);
  });

  it('never vanishes from unions the same way', () => {
    type Dropped = string | never;
    expect(getRunTypeId<Dropped>()).toBe(getRunTypeId<string>());
    const sample: Dropped = 'a';
    expect(getRunTypeId(sample)).toBe(getRunTypeId<string>());
  });
});
