// id-integrity / runTypeFromJsonSchema — for EVERY validation + format-validation +
// serialization + format-serialization case whose runTypeFromJsonSchema thunks are filled,
// assert the runTypeFromJsonSchema-authored form (`createValidateFn(runTypeFromJsonSchema({…}))` /
// `createJsonEncoderFn(runTypeFromJsonSchema({…}))`) resolves the SAME runtype as the
// type-first form: cached-factory reference identity for validators,
// byte-identical wire output for serializers. Reuses each case's existing
// thunks — no per-case data added; pending / `'not-supported'` thunks no-op, so
// this driver goes live automatically as the runTypeFromJsonSchema column drains
// milestone-by-milestone. See util/idIntegrityAsserts.ts for the mechanism and
// the `jsonSchemaIdDivergent` opt-out (a SEPARATE divergence set from the
// value-first `idDivergent`).
//
// The two suite families are registered in SEPARATE register() calls per suite
// (never merged into one object): validation and format-validation both define
// REALWORLD / DATETIME group keys, so a spread would silently drop groups.

import {describe, it} from 'vitest';
import {VALIDATION_SUITE} from '../validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../format-validation/index.ts';
import {SERIALIZATION_SPEC} from '../serialization/index.ts';
import {FORMAT_SERIALIZATION_SUITE} from '../format-serialization/index.ts';
import type {ValidationCase} from '../validation/types.ts';
import type {SerializationCase} from '../serialization/types.ts';
import {assertJsonSchemaValidatorIdIntegrity, assertJsonSchemaSerializerIdIntegrity} from '../../util/idIntegrityAsserts.ts';

function registerValidators(suiteName: string, suite: Record<string, Record<string, ValidationCase>>): void {
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const c of Object.values(cases)) {
      it(`${suiteName} / ${groupName} — ${c.title}`, () => assertJsonSchemaValidatorIdIntegrity(c));
    }
  }
}

function registerSerializers(suiteName: string, suite: Record<string, Record<string, SerializationCase>>): void {
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const c of Object.values(cases)) {
      it(`${suiteName} / ${groupName} — ${c.title}`, () => assertJsonSchemaSerializerIdIntegrity(c));
    }
  }
}

describe('id-integrity / runTypeFromJsonSchema validators — schema-literal ↔ type-first resolve one cached factory', () => {
  registerValidators('validation', VALIDATION_SUITE);
  registerValidators('format-validation', FORMAT_VALIDATION_SUITE);
});

describe('id-integrity / runTypeFromJsonSchema serializers — schema-literal encoder output equals type-first', () => {
  registerSerializers('serialization', SERIALIZATION_SPEC);
  registerSerializers('format-serialization', FORMAT_SERIALIZATION_SUITE);
});
