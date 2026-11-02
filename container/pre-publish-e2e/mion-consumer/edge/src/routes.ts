import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

type User = {name: string; age: number};

const routes = {
    sayHello: mion.route((_ctx, name: string): string => `Hello ${name}!`),
    utils: {
        sum: mion.route((_ctx, a: number, b: number): number => a + b),
    },
    saveUser: mion.route((_ctx, user: User): User => user),
} satisfies Routes;

export const edgeApi = mion.initRoutes(routes);
export type EdgeApi = typeof edgeApi;
