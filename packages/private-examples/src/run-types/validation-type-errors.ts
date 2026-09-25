import {createGetValidationErrorsFn} from '@mionjs/run-types';

interface User {
  name: string;
  age: number;
}

// synchronous: returns the compiled error collector
const getUserErrors = createGetValidationErrorsFn<User>();

const errors = getUserErrors({name: 123, age: 'invalid'});
// [{path: ['name'], expected: 'string'}, {path: ['age'], expected: 'number'}]
