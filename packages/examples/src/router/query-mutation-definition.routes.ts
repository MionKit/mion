import {RpcError} from '@mionjs/core';
import {Routes, route, query, mutation} from '@mionjs/router';

type User = {name: string; surname: string};

const routes = {
    // query() for read-only operations
    // client automatically uses GET with ?data=base64url for small payloads
    getUser: query((ctx, id: number): User | RpcError<'user-not-found'> => {
        return {name: 'John', surname: 'Doe'};
    }),

    // mutation() for operations that modify data
    // client always uses POST with body
    createUser: mutation((ctx, user: User): User => {
        return user;
    }),

    // route() still works as before (no query/mutation intent, client uses POST)
    sayHello: route((ctx, name: string): string => {
        return `Hello ${name}`;
    }),
} satisfies Routes;
