// format-serialization / Currency — every CURRENCY case run through every JSON
// encoder × decoder pairing and the binary round-trip, exactly like
// NumberFormat: the brand must never change what goes on the wire.
import {describe, it} from 'vitest';
import {CURRENCY} from './Currency.ts';
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

describe('format-serialization / Currency', () => {
  for (const c of Object.values(CURRENCY)) {
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
