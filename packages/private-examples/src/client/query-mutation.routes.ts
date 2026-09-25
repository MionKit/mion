import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string};

const routes = {
  getUser: mion.query((ctx, id: string): User => ({id, name: 'John'})),
  createUser: mion.mutation(
    (ctx, name: string): User => ({id: 'USER-123', name})
  ),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
