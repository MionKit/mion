import {describe, it} from 'vitest';
import {ATOMIC} from './Atomic.ts';
import {
  assertMutateMutateRoundTrip,
  assertMutateCloneRoundTrip,
  assertCloneMutateRoundTrip,
  assertCloneCloneRoundTrip,
  assertCompactRoundTrip,
  assertSchemaJsonRoundTrip,
} from '../../util/serializationAsserts.ts';

describe('serialization / Atomic', () => {
  for (const c of Object.values(ATOMIC)) {
    it(`mutate - mutate - ${c.title}`, () => assertMutateMutateRoundTrip(c));
    it(`mutate - clone - ${c.title}`, () => assertMutateCloneRoundTrip(c));
    it(`clone - mutate - ${c.title}`, () => assertCloneMutateRoundTrip(c));
    it(`clone - clone - ${c.title}`, () => assertCloneCloneRoundTrip(c));
    it(`compact - ${c.title}`, () => assertCompactRoundTrip(c));
    it(`schema - json - ${c.title}`, () => assertSchemaJsonRoundTrip(c));
  }
});
