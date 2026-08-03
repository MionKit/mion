// format-validation / StructuralFormat — the JSON Schema structural
// keywords (formattedArray / formattedObject, contains / patternProperties /
// propertyNames) and the oneOf / anyOf combinators, through the same
// per-variant it() matrix as StringFormat: 5 validate + 5
// getValidationErrors forms + the schema/json-schema contracts + 2
// mockType forms per case.
import {describe, it} from 'vitest';
import {STRUCTURAL_FORMAT} from './StructuralFormat.ts';
import {
  assertValidateStatic,
  assertValidateReflect,
  assertValidateDeserializeStatic,
  assertValidateDeserializeReflect,
  assertValidateSchema,
  assertValidateJsonSchema,
  assertFormatGetValidationErrorsStatic,
  assertFormatGetValidationErrorsReflect,
  assertFormatGetValidationErrorsDeserializeStatic,
  assertFormatGetValidationErrorsDeserializeReflect,
  assertGetValidationErrorsSchema,
  assertGetValidationErrorsJsonSchema,
  assertMockTypeStatic,
  assertMockTypeReflect,
  titleFor,
} from '../../util/validationAsserts.ts';

describe('format-validation / StructuralFormat', () => {
  for (const c of Object.values(STRUCTURAL_FORMAT)) {
    it(titleFor(c, 'validate/static'), () => assertValidateStatic(c));
    it(titleFor(c, 'validate/reflect'), () => assertValidateReflect(c));
    it(titleFor(c, 'validate/deserialize-static'), () => assertValidateDeserializeStatic(c));
    it(titleFor(c, 'validate/deserialize-reflect'), () => assertValidateDeserializeReflect(c));
    it(titleFor(c, 'validate/schema'), () => assertValidateSchema(c));
    it(titleFor(c, 'validate/json-schema'), () => assertValidateJsonSchema(c));

    it(titleFor(c, 'getValidationErrors/format'), () => assertFormatGetValidationErrorsStatic(c));
    it(titleFor(c, 'getValidationErrors/reflect'), () => assertFormatGetValidationErrorsReflect(c));
    it(titleFor(c, 'getValidationErrors/deserialize-static'), () => assertFormatGetValidationErrorsDeserializeStatic(c));
    it(titleFor(c, 'getValidationErrors/deserialize-reflect'), () => assertFormatGetValidationErrorsDeserializeReflect(c));
    it(titleFor(c, 'getValidationErrors/schema'), () => assertGetValidationErrorsSchema(c));
    it(titleFor(c, 'getValidationErrors/json-schema'), () => assertGetValidationErrorsJsonSchema(c));

    it(titleFor(c, 'mockType/static'), () => assertMockTypeStatic(c));
    it(titleFor(c, 'mockType/reflect'), () => assertMockTypeReflect(c));
  }
});
