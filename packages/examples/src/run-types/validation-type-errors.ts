import {createGetValidationErrors} from '@ts-runtypes/core';

interface User {
    name: string;
    age: number;
}

// createGetValidationErrors is synchronous — returns the compiled error collector.
const getUserErrors = createGetValidationErrors<User>();

const errors = getUserErrors({name: 123, age: 'invalid'});
// Returns one RunTypeError per failed member:
//   [ { path: ['name'], expected: 'string' }, { path: ['age'], expected: 'number' } ]
