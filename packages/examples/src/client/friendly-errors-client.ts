/* eslint-disable @typescript-eslint/no-unused-vars */
import {getFriendlyErrors} from '@mionkit/core';
import {RouteParamType, initClient} from '@mionkit/client';
import type {MyApi} from './friendly-errors-server.ts';
import {userFriendlyErrors} from './friendly-errors-map.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
type User = RouteParamType<MyApi['setUser'], 0>;

const invalidUser = {
    name: 'A', // Too short (min 2)
    age: 5, // no errors
    balance: -100n, // Negative (min 0)
    isActive: 'yes' as unknown as boolean, // Wrong type
    tags: 'not-an-array' as unknown as string[], // Wrong type
    createdAt: 'invalid-date',
    nested: {
        email: 'invalid-email',
        score: -10, // Negative (min 0)
    },
};
const [user, error] = await routes.setUser(invalidUser as User).call();
if (error?.type === 'validation-error') {
    const validationErrors = error.errorData?.typeErrors || [];
    // getFriendlyErrors() aggregates all errors per field and calls handler once with all params
    const friendlyErrors = getFriendlyErrors<User>(validationErrors, userFriendlyErrors);
    console.log(friendlyErrors.age); // undefined, age is valid
    console.log(friendlyErrors.name); // 'Name must be at least 2 characters' (single string per field)
}
if (error?.type === 'user-exists') {
    console.log('User already exists');
}
console.log('User created:', user);
