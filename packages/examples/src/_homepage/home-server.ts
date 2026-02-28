import {initMionRouter, route, Routes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/node';
// @annotate: Automatic Validation and Serialization from Typescript types

interface User {
    id: number;
    name: string;
    age: number;
    createdAt: Date;
    tags: Set<string>;
}
interface Order { 
    id: string; 
    userId: number; 
    amount: number;
}
// @annotate: Object based router with rpc methods that receive Fully Validated params

const routes = {
    getUser: route((ctx, id: number): User | null => {
        const tags =  new Set(['tag1', 'tag2'])
        const user: User = {id: 1234, name: 'John',age: 30, createdAt: new Date(), tags};
        if (id === 1234) return user;
        return null;
    }),
    getOrder: route((ctx, id: string): Order | null => {
        const order: Order = {id: 'ORDER-123', userId: 1234, amount: 100};
        if (id === 'ORDER-123') return order;
        return null;
    }),
    sayHello: route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

export const myApi = await initMionRouter(routes);
export type MyApi = typeof myApi;
startNodeServer({port: 3000});
