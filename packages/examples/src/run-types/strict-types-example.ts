import {createIsTypeFn, createTypeErrorsFn} from '@mionjs/run-types';

interface User {
    name: string;
    age: number;
}

// With strictTypes, extra properties are rejected
const isUser = await createIsTypeFn<User>({strictTypes: true});

isUser({name: 'John', age: 30}); // true
isUser({name: 'John', age: 30, extra: 'value'}); // false (unknown property 'extra')

// typeErrors also reports unknown properties
const getUserErrors = await createTypeErrorsFn<User>({strictTypes: true});

getUserErrors({name: 'John', age: 30}); // []
getUserErrors({name: 'John', age: 30, extra: 'value'});
// Returns: [{ path: ['extra'], expected: 'never' }]
