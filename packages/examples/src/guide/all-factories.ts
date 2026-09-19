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
  createMockDataFn,
  createStandardSchema,
} from '@mionjs/run-types';

type User = {id: bigint; name: string; signedUpAt: Date};

// start-factories
// one call per type at module level; each function is compiled at build time
const isUser = createValidateFn<User>();
const userErrors = createGetValidationErrorsFn<User>();
const userHasExtras = createHasUnknownKeysFn<User>();
const userExtraErrors = createUnknownKeyErrorsFn<User>();
const cloneUser = createCloneExactShapeFn<User>();
const cleanUser = createFormatTransformFn<User>();

// untrusted input: restores and checks in one walk, throws on a mismatch
const parseUser = createParseFn<User>();

// JSON as a string
const encodeUser = createJsonEncoderFn<User>();
const decodeUser = createJsonDecoderFn<User>();

// JSON as a value when you own the envelope; pair the same strategy on both sides
const prepareUser = createPrepareForJsonFn<User>();
const restoreUser = createRestoreFromJsonFn<User>();
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
  userErrors,
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
