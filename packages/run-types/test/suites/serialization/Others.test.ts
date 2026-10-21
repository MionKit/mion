import {describe, it} from 'vitest';
import {OTHERS} from './Others.ts';
import {
  assertMutateMutateRoundTrip,
  assertMutateCloneRoundTrip,
  assertCloneMutateRoundTrip,
  assertCloneCloneRoundTrip,
  assertCompactRoundTrip,
  assertSchemaJsonRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / Others', () => {
  for (const c of Object.values(OTHERS)) {
    it(`mutate - mutate - ${c.title}`, () => assertMutateMutateRoundTrip(c));
    it(`mutate - clone - ${c.title}`, () => assertMutateCloneRoundTrip(c));
    it(`clone - mutate - ${c.title}`, () => assertCloneMutateRoundTrip(c));
    it(`clone - clone - ${c.title}`, () => assertCloneCloneRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
  }
});
