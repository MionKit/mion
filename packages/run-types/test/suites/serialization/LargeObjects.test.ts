// serialization / LargeObjects — the large-object stress cases through the default clone JSON pairing, the
// compact wire and the value-first schema pair.
import {describe, it} from 'vitest';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import {assertCloneCloneRoundTrip, assertSchemaJsonRoundTrip, assertCompactRoundTrip} from '../../util/serializationAsserts.ts';

describe('serialization / LargeObjects', () => {
  for (const c of Object.values(LARGE_OBJECTS)) {
    it(`clone - clone - ${c.title}`, () => assertCloneCloneRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
  }
});
