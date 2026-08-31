// The compile-time cold-start size estimate is emitted into the trailing slot of
// every `tb` (binary-encoder) entry tuple, but it used to stop there: the
// registration path built the cache entry from an explicit field list that
// omitted it, so the only reader was createBinaryEncoderFn, from inside its own
// closure. It now rides the entry, reachable through getRT(rtFnHash) like every
// other field the tuple carries.
//
// The Go side gates the slot on an un-varianted `toBinary` entry, so `tb` is the
// only family that ever populates it — asserted both ways below.

import {describe, it, expect} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {createBinaryEncoderFn, createValidateFn, getRTFnCaches} from '@mionjs/run-types';

interface SizedUser {
  id: number;
  name: string;
  tags: string[];
}

// Every registered entry of a family, as [cacheKey, entry] pairs.
function entriesOfFamily(familyTag: string): {key: string; binarySizeEstimate?: number}[] {
  const {rtFnsCache} = getRTFnCaches();
  const found: {key: string; binarySizeEstimate?: number}[] = [];
  for (const key of Object.keys(rtFnsCache)) {
    const entry = rtFnsCache[key];
    if (entry && entry.familyTag === familyTag) found.push({key, binarySizeEstimate: entry.binarySizeEstimate});
  }
  return found;
}

describe('binarySizeEstimate on the compiled fn cache entry', () => {
  it('a tb entry carries the compile-time estimate', () => {
    // Demand the tb family; the encoder itself is irrelevant to the assertion,
    // it just forces the entry to register.
    createBinaryEncoderFn<SizedUser>();
    const withEstimate = entriesOfFamily('tb').filter((entry) => typeof entry.binarySizeEstimate === 'number');
    expect(withEstimate.length, 'expected at least one tb entry carrying an estimate').toBeGreaterThan(0);
    for (const entry of withEstimate) {
      expect(entry.binarySizeEstimate, `${entry.key} must carry a positive byte estimate`).toBeGreaterThan(0);
    }
  });

  it('scales with the shape — a bare number estimates far below an object', () => {
    createBinaryEncoderFn<number>();
    createBinaryEncoderFn<SizedUser>();
    const estimates = entriesOfFamily('tb')
      .map((entry) => entry.binarySizeEstimate)
      .filter((estimate): estimate is number => typeof estimate === 'number');
    // A number is 8 bytes plus framing; the object carries three members
    // including a string array. The point is that it is a real per-type
    // measurement, not a constant.
    expect(Math.min(...estimates)).toBeLessThan(Math.max(...estimates));
  });

  it('is absent on every other family', () => {
    createValidateFn<SizedUser>();
    for (const familyTag of ['val', 'pj', 'rj', 'sj']) {
      for (const entry of entriesOfFamily(familyTag)) {
        expect(entry.binarySizeEstimate, `${familyTag} entry ${entry.key} must not carry an estimate`).toBeUndefined();
      }
    }
  });

  it('reaches the entry for a value-first run-type schema too', () => {
    const schema = RT.object({id: TF.number(), name: TF.string()});
    createBinaryEncoderFn(schema);
    const withEstimate = entriesOfFamily('tb').filter((entry) => typeof entry.binarySizeEstimate === 'number');
    expect(withEstimate.length).toBeGreaterThan(0);
  });
});
