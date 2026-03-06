import {initMionRouter, route, Routes} from '@mionkit/router';

const routes = {
    hello: route((ctx, name: string): string => `Hello ${name}!`),
    getTime: route((ctx): Date => new Date()),
} satisfies Routes;

export const myApi = await initMionRouter(routes, {prefix: '{{PREFIX}}'});
export type MyApi = typeof myApi;
