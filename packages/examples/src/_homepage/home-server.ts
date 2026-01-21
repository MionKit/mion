import {initMionRouter, route, Routes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core';

interface User {
    id: number;
    name: string;
    age: number;
    createdAt: Date;
    tags: Set<string>;
}

const routes = {
    getUser: route((ctx, id: number): User | RpcError<'user-not-found'> => {
        return {
            id: 1234,
            name: 'John',
            age: 30,
            createdAt: new Date(),
            tags: new Set(['tag1', 'tag2']),
        };
    }),
    sayHello: route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

export const myApi = initMionRouter(routes);
startNodeServer({port: 3000});
export type MyApi = typeof myApi;
