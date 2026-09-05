import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string};

const routes = {
  // read only, the client sends it as a GET
  getUser: mion.query((ctx, id: string): User => ({id, name: 'John'})),
  // changes data, the client always sends it as a POST
  createUser: mion.mutation(
    (ctx, name: string): User => ({id: 'USER-123', name})
  ),
} satisfies Routes;

const myApi = await mion.initRoutes(routes);

export type MyApi = typeof myApi;
