import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string};

// bodies left out on purpose, this is about the shape the client gets
const routes = {
  auth: mion.headersFn(
    (ctx, h: HeadersSubset<'Authorization'>): void => undefined
  ),
  users: {
    getById: mion.route((ctx, id: string): User => ({id, name: 'John'})),
    create: mion.route((ctx, user: User): User => user),
    delete: mion.route((ctx, id: string): string => id),
  },
  log: mion.middleFn((ctx): void => undefined, {runOnError: true}),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
