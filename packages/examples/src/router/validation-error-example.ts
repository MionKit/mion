import {RpcError, RunTypeError, ValidationError} from '@mionjs/core';

// Example validation error thrown when invalid data is received
const validationError: ValidationError = new RpcError({
    statusCode: 400,
    type: 'validation-error',
    publicMessage: "Invalid params in 'createUser', validation failed.",
    errorData: {
        typeErrors: [
            {path: ['email'], expected: 'string'},
            {path: ['age'], expected: 'number'},
        ] as RunTypeError[],
    },
});
