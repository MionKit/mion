import {createIsTypeFn} from '@mionkit/run-types';

interface User {
    name: string;
    age: number;
}

const isUser = await createIsTypeFn<User>();

isUser({name: 'John', age: 30}); // true
isUser({name: 'John'}); // false (missing age)
isUser({name: 'John', age: '30'}); // false (age is string)
