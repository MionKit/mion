import {createGetValidationErrorsFn} from '@mionjs/run-types';

interface User {
  name: string;
  age: number;
}

// createGetValidationErrorsFn is synchronous — returns the compiled error collector.
const getUserErrors = createGetValidationErrorsFn<User>();

const errors = getUserErrors({name: 123, age: 'invalid'});
// Returns one RunTypeError per failed member:
//   [ { path: ['name'], expected: 'string' }, { path: ['age'], expected: 'number' } ]
