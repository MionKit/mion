import {initMionRouter, route, Routes} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';

const routes = {
    // fully validated params
    sayHello: route((ctx, name: string): string => {
        return `Hello ${name}!`;
    }),
} satisfies Routes;

export const myApi = await initMionRouter(routes);
startNodeServer({port: 3000});
export type MyApi = typeof myApi;
