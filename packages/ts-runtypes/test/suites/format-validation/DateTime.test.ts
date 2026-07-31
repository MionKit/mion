// format-validation / DateTime — per-variant it() blocks: every DATETIME case
// yields 12 it()s (5 validate + 5 getValidationErrors + 2 mockType). The five
// getValidationErrors forms are the format payload across static / reflect /
// deserialize-static / deserialize-reflect (assertFormatGetValidationErrors*, proving
// the format error survives every type-resolution path) plus the value-first schema
// contract (assertGetValidationErrorsSchema). Missing thunks → " (not implemented)" suffix.
import {describe, it} from 'vitest';
import {DATETIME} from './DateTime.ts';
import {
  assertValidateStatic,
  assertValidateReflect,
  assertValidateDeserializeStatic,
  assertValidateDeserializeReflect,
  assertValidateSchema,
  assertFormatGetValidationErrorsStatic,
  assertFormatGetValidationErrorsReflect,
  assertFormatGetValidationErrorsDeserializeStatic,
  assertFormatGetValidationErrorsDeserializeReflect,
  assertGetValidationErrorsSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('format-validation / DateTime', () => {
  for (const c of Object.values(DATETIME)) {
    it(titleFor(c, 'validate/static'), () => assertValidateStatic(c));
    it(titleFor(c, 'validate/reflect'), () => assertValidateReflect(c));
    it(titleFor(c, 'validate/deserialize-static'), () => assertValidateDeserializeStatic(c));
    it(titleFor(c, 'validate/deserialize-reflect'), () => assertValidateDeserializeReflect(c));
    it(titleFor(c, 'validate/schema'), () => assertValidateSchema(c));

    it(titleFor(c, 'getValidationErrors/format'), () => assertFormatGetValidationErrorsStatic(c));
    it(titleFor(c, 'getValidationErrors/reflect'), () => assertFormatGetValidationErrorsReflect(c));
    it(titleFor(c, 'getValidationErrors/deserialize-static'), () => assertFormatGetValidationErrorsDeserializeStatic(c));
    it(titleFor(c, 'getValidationErrors/deserialize-reflect'), () => assertFormatGetValidationErrorsDeserializeReflect(c));
    it(titleFor(c, 'getValidationErrors/schema'), () => assertGetValidationErrorsSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
