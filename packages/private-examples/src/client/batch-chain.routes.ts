import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

type Order = {id: string; userId: string};
type User = {id: string; name: string};

const routes = {
  orders: {
    getById: mion.route((ctx, id: string): Order => ({id, userId: 'USER-123'})),
  },
  users: {
    // in the chain, id comes from the client's inputFrom mapper, which runs here on the server
    getById: mion.route((ctx, id: string): User => ({id, name: 'John'})),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
