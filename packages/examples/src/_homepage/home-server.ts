import {initMionRouter, route, Routes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core';

// @annotate: All Serialization and Validation is based on Typescript types 
interface User {
    id: number;
    name: string;
    age: number;
    createdAt: Date;
    tags: Set<string>;
}

// @log: Routes are just simple functions that receive Fully Validated params
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

export const myApi = await initMionRouter(routes);

// @annotate: Export the type to use in the client
export type MyApi = typeof myApi;

// @log: Router supports multiple platforms, here we start a Node.js server
startNodeServer({port: 3000});
