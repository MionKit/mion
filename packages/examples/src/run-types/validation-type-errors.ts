import {createTypeErrorsFn} from '@mionkit/run-types';

interface User {
    name: string;
    age: number;
}

const getUserErrors = await createTypeErrorsFn<User>();

const errors = getUserErrors({name: 123, age: 'invalid'});
// Returns: [
//   { path: ['name'], expected: 'string', actual: 'number' },
//   { path: ['age'], expected: 'number', actual: 'string' }
// ]
