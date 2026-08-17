// format-validation / Currency — every CURRENCY case through the same
// per-variant it() blocks as NumberFormat: 5 validate + 5 getValidationErrors
// forms (the format payload asserted across static / reflect /
// deserialize-static / deserialize-reflect + the value-first schema contract) +
// 2 mockType forms — plus a focused pair proving the `isCurrency` param is
// echoed onto error payloads end-to-end (the friendly renderer's money
// discriminator) in both marker call shapes.
import {describe, it, expect} from 'vitest';
import * as TF from '@ts-runtypes/core/formats';
import {createGetValidationErrorsFn} from '@ts-runtypes/core';
import {CURRENCY} from './Currency.ts';
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

describe('format-validation / Currency', () => {
  for (const c of Object.values(CURRENCY)) {
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

  it('the isCurrency param is echoed onto error payloads (static form)', () => {
    const errors = createGetValidationErrorsFn<TF.Currency<{max: 100}>>()(101);
    expect(errors[0]?.format?.name).toBe('numberFormat');
    expect(errors[0]?.format?.isCurrency).toBe(true);
  });

  it('the isCurrency param is echoed onto error payloads (value-first form)', () => {
    const errors = createGetValidationErrorsFn(TF.currency({max: 100}))(101);
    expect(errors[0]?.format?.name).toBe('numberFormat');
    expect(errors[0]?.format?.isCurrency).toBe(true);
  });

  it('a plain number error never carries the flag', () => {
    const errors = createGetValidationErrorsFn<TF.Number<{max: 100}>>()(101);
    expect(errors[0]?.format?.isCurrency).toBeUndefined();
  });
});
