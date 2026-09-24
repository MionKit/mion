// serialization / Objects — every OBJECTS case run through every JSON encoder × decoder pairing
// (8 combinations) and the binary round-trip. One `it()` per pairing, each delegating to its
// shared helper in util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {OBJECTS} from './Objects.ts';
import {
  assertMutateMutateRoundTrip,
  assertMutateCloneRoundTrip,
  assertCloneMutateRoundTrip,
  assertCloneCloneRoundTrip,
  assertCompactRoundTrip,
  assertBinaryRoundTrip,
  assertSchemaJsonRoundTrip,
  assertSchemaBinaryRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / Objects', () => {
  for (const c of Object.values(OBJECTS)) {
    it(`mutate - mutate - ${c.title}`, () => assertMutateMutateRoundTrip(c));
    it(`mutate - clone - ${c.title}`, () => assertMutateCloneRoundTrip(c));
    it(`clone - mutate - ${c.title}`, () => assertCloneMutateRoundTrip(c));
    it(`clone - clone - ${c.title}`, () => assertCloneCloneRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
    it(`binary - ${c.title}`, () => assertBinaryRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`schema - binary - ${c.title}`, () => assertSchemaBinaryRoundTrip(c));
  }
});
