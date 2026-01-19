import {Routes, route} from '@mionkit/router';
import {createUser} from './myApp';

// Your TypeScript types ARE the validation schema
interface User {
    id: string;
    email: string;
    age: number;
    birthDate: Date;
    tags: Set<string>;
}

type NewUser = Omit<User, 'id'>;

// mion automatically:
// 1. Validates email is string, age is number, etc.
// 2. Serializes Date and Set for JSON transport
// 3. Restores Date and Set
const routes = {
    createUser: route((ctx, user: NewUser): User => {
        // user is already validated and types are restored
        console.log(user.birthDate instanceof Date); // true
        console.log(user.tags instanceof Set); // true
        return createUser(user);
    }),
} satisfies Routes;
