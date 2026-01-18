import {initMionRouter, route, Routes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/http';

const routes = {
    // fully validated params
    sayHello: route((ctx, name: string): string => {
        return `Hello ${name}!`;
    }),
} satisfies Routes;

export const myApi = initMionRouter(routes);
startNodeServer({port: 3000});
export type MyApi = typeof myApi;
