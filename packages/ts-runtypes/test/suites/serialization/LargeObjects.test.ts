// serialization / LargeObjects — binary round-trip only. The JSON round-trip is intentionally not
// exercised for the large-object stress cases (the prior runner ran no JSON it() for them);
// binary is the representative codec, delegating to its shared helper.
import {describe, it} from 'vitest';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import {
  assertBinaryRoundTrip,
  assertSchemaJsonRoundTrip,
  assertSchemaBinaryRoundTrip,
  assertCompactRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / LargeObjects', () => {
  for (const c of Object.values(LARGE_OBJECTS)) {
    it(`binary - ${c.title}`, () => assertBinaryRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`schema - binary - ${c.title}`, () => assertSchemaBinaryRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
  }
});
