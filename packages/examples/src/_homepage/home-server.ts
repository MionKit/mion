import {initMionRouter, route, Routes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core'; 
// @annotate: Automatic Validation and Serialization from Typescript types

interface User {
    id: number;
    name: string;
    age: number;
    createdAt: Date;
    tags: Set<string>;
}
// @annotate: Object based router with rpc methods that receive Fully Validated params

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
export type MyApi = typeof myApi;
startNodeServer({port: 3000});
