import {
  createValidateFn,
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createUnknownKeyErrorsFn,
  createCloneExactShapeFn,
  createFormatTransformFn,
  createParseFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
  createStringifyJsonFn,
  createStripUnknownKeysFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createBinarySizerFn,
  createJsonSchemaFn,
  createStandardSchema,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type User = {id: bigint; name: string; signedUpAt: Date};

// start-factories
// one call per type at module level; the options pick which function is compiled
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

const userHasExtras = createHasUnknownKeysFn<User>();
const userExtraErrors = createUnknownKeyErrorsFn<User>();
const cloneUser = createCloneExactShapeFn<User>();
const cleanUser = createFormatTransformFn<User>();

// untrusted input: restores and checks in one walk, throws on a mismatch
const parseUser = createParseFn<User>();
const parseUserStrip = createParseFn<User>(undefined, {strategy: 'strip'});
const parseUserFail = createParseFn<User>(undefined, {strategy: 'fail'});

// JSON as a string; each strategy is its own compiled function
const encodeUser = createJsonEncoderFn<User>(undefined, {strategy: 'clone'});
const decodeUser = createJsonDecoderFn<User>(undefined, {strategy: 'strip'});

// JSON as a value when you own the envelope; pair the same strategy on both sides
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

// the same road, with no strategy to pick
const stringifyUser = createStringifyJsonFn<User>();
const stripUserExtras = createStripUnknownKeysFn<User>();

// binary
const toBinary = createBinaryEncoderFn<User>();
const fromBinary = createBinaryDecoderFn<User>();
const binarySize = createBinarySizerFn<User>();

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
  parseUserStrip,
  parseUserFail,
  prepareUserMutate,
  restoreUserMutate,
  compactUser,
  uncompactUser,
  userHasExtras,
  userExtraErrors,
  cloneUser,
  cleanUser,
  parseUser,
  encodeUser,
  decodeUser,
  prepareUser,
  restoreUser,
  stringifyUser,
  stripUserExtras,
  toBinary,
  fromBinary,
  binarySize,
  userSchema,
  mockUser,
  userStandardSchema,
};
