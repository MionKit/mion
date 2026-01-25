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
// 1. Restores Date and Set from JSON
// 2. Validates user parameter
const routes = {
    createUser: route((ctx, user: NewUser): User => {
        // user is already validated and types are restored
        console.log(user.birthDate instanceof Date); // true
        console.log(user.tags instanceof Set); // true
        return createUser(user);
    }),
} satisfies Routes;
