// id-integrity / serializers — for EVERY serialization + format-serialization case, the value-first encoder
// (`createJsonEncoderFn(RT.x())`) must match the type-first one on the samples: same wire ⇒ same runtype.
// Reuses each case's thunks, no per-case data; see util/idIntegrityAsserts.ts.

import {describe, it} from 'vitest';
import {SERIALIZATION_SPEC} from '../serialization/index.ts';
import {FORMAT_SERIALIZATION_SUITE} from '../format-serialization/index.ts';
import type {SerializationCase} from '../serialization/types.ts';
import {assertSerializerIdIntegrity} from '../../util/idIntegrityAsserts.ts';

function register(suiteName: string, suite: Record<string, Record<string, SerializationCase>>): void {
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const c of Object.values(cases)) {
      it(`${suiteName} / ${groupName} — ${c.title}`, () => assertSerializerIdIntegrity(c));
    }
  }
}

describe('id-integrity / serializers — value-first schema encoder output equals type-first', () => {
  register('serialization', SERIALIZATION_SPEC);
  register('format-serialization', FORMAT_SERIALIZATION_SUITE);
});
