// serialization / Tuples — every TUPLES case run through every JSON encoder × decoder pairing
// (10 combinations) and the binary round-trip. One `it()` per pairing, each delegating to its
// shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {TUPLES} from './Tuples.ts';
import {
  assertMutatePreserveRoundTrip,
  assertMutateStripRoundTrip,
  assertClonePreserveRoundTrip,
  assertCloneStripRoundTrip,
  assertDirectPreserveRoundTrip,
  assertDirectStripRoundTrip,
  assertCompactRoundTrip,
  assertBinaryRoundTrip,
  assertSchemaJsonRoundTrip,
  assertSchemaBinaryRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / Tuples', () => {
  for (const c of Object.values(TUPLES)) {
    it(`mutate - preserve - ${c.title}`, () => assertMutatePreserveRoundTrip(c));
    it(`mutate - strip - ${c.title}`, () => assertMutateStripRoundTrip(c));
    it(`clone - preserve - ${c.title}`, () => assertClonePreserveRoundTrip(c));
    it(`clone - strip - ${c.title}`, () => assertCloneStripRoundTrip(c));
    it(`direct - preserve - ${c.title}`, () => assertDirectPreserveRoundTrip(c));
    it(`direct - strip - ${c.title}`, () => assertDirectStripRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
    it(`binary - ${c.title}`, () => assertBinaryRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`schema - binary - ${c.title}`, () => assertSchemaBinaryRoundTrip(c));
  }
});
