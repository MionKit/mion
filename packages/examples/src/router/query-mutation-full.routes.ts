import {RpcError, HeadersSubset} from '@mionjs/core';
import {Routes, initMionRouter, query, mutation, headersFn} from '@mionjs/router';

type User = {id: number; name: string; email: string};
type NewUser = {name: string; email: string};

const routes = {
    auth: headersFn((ctx, {headers}: HeadersSubset<'Authorization'>): void => {
        if (!headers.Authorization) throw new RpcError({publicMessage: 'Not Authorized', type: 'not-authorized'});
    }),

    users: {
        // read-only: fetching data — benefits from GET caching
        getById: query((ctx, id: number): User | RpcError<'user-not-found'> => {
            return {id, name: 'John', email: 'john@example.com'};
        }),

        // read-only: searching/listing data
        search: query((ctx, term: string): User[] => {
            return [{id: 1, name: 'John', email: 'john@example.com'}];
        }),

        // mutations: operations that modify state
        create: mutation((ctx, newUser: NewUser): User => {
            return {id: 1, ...newUser};
        }),

        update: mutation((ctx, user: User): User | RpcError<'user-not-found'> => {
            return user;
        }),

        delete: mutation((ctx, id: number): boolean | RpcError<'user-not-found'> => {
            return true;
        }),
    },
} satisfies Routes;

export const myApi = await initMionRouter(routes);
export type MyApi = typeof myApi;
