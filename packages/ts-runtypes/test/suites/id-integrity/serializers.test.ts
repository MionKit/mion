// id-integrity / serializers — for EVERY serialization + format-serialization
// case, assert the value-first schema encoder (`createJsonEncoderFn(RT.x())` /
// `createBinaryEncoderFn(RT.x())`) produces output identical to the type-first
// encoder (`createJsonEncoderFn<T>()` / `createBinaryEncoderFn<T>()`) on the case's
// samples. Identical wire output ⇒ both forms resolved the same runtype. Reuses
// each case's existing schema + type-first encoder thunks — no per-case data
// added. See util/idIntegrityAsserts.ts for the mechanism.

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
