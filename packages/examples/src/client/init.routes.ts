import {HeadersSubset} from '@mionjs/core';
import {Routes, headersFn, initMionRouter, middleFn, route} from '@mionjs/router';

export type User = {id: string; name: string};

// bodies left out on purpose, this is about the shape the client gets
const routes = {
  auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void => undefined),
  users: {
    getById: route((ctx, id: string): User => ({id, name: 'John'})),
    create: route((ctx, user: User): User => user),
    delete: route((ctx, id: string): string => id),
  },
  log: middleFn((ctx): void => undefined, {runOnError: true}),
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type InitApi = typeof myApi;
