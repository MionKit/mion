// validation / Array — per-variant it() blocks: every ARRAY case yields up to
// 12 it()s (5 validate + 5 getValidationErrors + 2 mockType), each driven by its own
// helper in util/validationAsserts.ts. A missing thunk is signaled by the
// " (not implemented)" suffix in the it() title (built at registration time).
import {describe, it} from 'vitest';
import {ARRAY} from './Array.ts';
import {
  assertValidateStatic,
  assertValidateReflect,
  assertValidateDeserializeStatic,
  assertValidateDeserializeReflect,
  assertValidateSchema,
  assertGetValidationErrorsStatic,
  assertGetValidationErrorsReflect,
  assertGetValidationErrorsDeserializeStatic,
  assertGetValidationErrorsDeserializeReflect,
  assertGetValidationErrorsSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('validation / Array', () => {
  for (const c of Object.values(ARRAY)) {
    it(titleFor(c, 'validate/static'), () => assertValidateStatic(c));
    it(titleFor(c, 'validate/reflect'), () => assertValidateReflect(c));
    it(titleFor(c, 'validate/deserialize-static'), () => assertValidateDeserializeStatic(c));
    it(titleFor(c, 'validate/deserialize-reflect'), () => assertValidateDeserializeReflect(c));
    it(titleFor(c, 'validate/schema'), () => assertValidateSchema(c));

    it(titleFor(c, 'getValidationErrors/static'), () => assertGetValidationErrorsStatic(c));
    it(titleFor(c, 'getValidationErrors/reflect'), () => assertGetValidationErrorsReflect(c));
    it(titleFor(c, 'getValidationErrors/deserialize-static'), () => assertGetValidationErrorsDeserializeStatic(c));
    it(titleFor(c, 'getValidationErrors/deserialize-reflect'), () => assertGetValidationErrorsDeserializeReflect(c));
    it(titleFor(c, 'getValidationErrors/schema'), () => assertGetValidationErrorsSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
