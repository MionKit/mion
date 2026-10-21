import {
  createValidateFn,
  createGetValidationErrorsFn,
  createRemoveUnknownKeysFn,
  createFormatTransformFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
  createJsonSchemaFn,
  createStandardSchema,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type User = {id: bigint; name: string; signedUpAt: Date};

// start-factories
// one call per type, at module level
const isUser = createValidateFn<User>();
const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
const isUserUnionKeys = createValidateFn<User>(undefined, {
  checkUnionUnknowns: true,
});

const userErrors = createGetValidationErrorsFn<User>();
const userErrorsStrict = createGetValidationErrorsFn<User>(undefined, {
  checkUnknowns: true,
});
const userErrorsUnionKeys = createGetValidationErrorsFn<User>(undefined, {
  checkUnionUnknowns: true,
});

const removeUserExtras = createRemoveUnknownKeysFn<User>();
const cleanUser = createFormatTransformFn<User>();

// JSON as a string
const encodeUser = createJsonEncoderFn<User>(undefined, {strategy: 'clone'});
const decodeUser = createJsonDecoderFn<User>(undefined, {strategy: 'clone'});

// JSON as a value inside your own JSON; same strategy on both sides
const prepareUser = createPrepareForJsonFn<User>();
const restoreUser = createRestoreFromJsonFn<User>();
const prepareUserMutate = createPrepareForJsonFn<User>(undefined, {
  strategy: 'mutate',
});
const restoreUserMutate = createRestoreFromJsonFn<User>(undefined, {
  strategy: 'mutate',
});
const compactUser = createPrepareForJsonFn<User>(undefined, {
  strategy: 'compact',
});
const uncompactUser = createRestoreFromJsonFn<User>(undefined, {
  strategy: 'compact',
});

// everything else
const userSchema = createJsonSchemaFn<User>();
const mockUser = createMockDataFn<User>();
const userStandardSchema = createStandardSchema<User>();
// end-factories

export {
  isUser,
  isUserStrict,
  isUserUnionKeys,
  userErrors,
  userErrorsStrict,
  userErrorsUnionKeys,
  prepareUserMutate,
  restoreUserMutate,
  compactUser,
  uncompactUser,
  removeUserExtras,
  cleanUser,
  encodeUser,
  decodeUser,
  prepareUser,
  restoreUser,
  userSchema,
  mockUser,
  userStandardSchema,
};
