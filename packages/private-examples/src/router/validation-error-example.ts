import {RpcError, RunTypeError, ValidationError} from '@mionjs/core';

const validationError: ValidationError = new RpcError({
  statusCode: 422,
  type: 'validation-error',
  publicMessage: "Invalid params in 'createUser', validation failed.",
  errorData: {
    typeErrors: [
      {path: ['email'], expected: 'string'},
      {path: ['age'], expected: 'number'},
    ] as RunTypeError[],
  },
});
