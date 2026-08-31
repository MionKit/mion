// format-serialization / Realworld — every REALWORLD case run through every JSON
// encoder × decoder pairing, the binary round-trip, and the value-first schema
// variants. One it() per pairing, delegating to util/serializationAsserts.ts.
import {describe, it} from 'vitest';
import {REALWORLD} from './Realworld.ts';
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

describe('format-serialization / Realworld', () => {
  for (const c of Object.values(REALWORLD)) {
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
