import {createMionRouter, Routes, PublicApi} from '@mionjs/router';

// The route handler is mounted under `/api`, so the ROUTER carries that prefix: it is what every
// route path is built from, and the client is given the same prefix so both agree.
const mion = createMionRouter({basePath: '/api'});

export interface User {
  id: string;
  name: string;
  email: string;
}

export const routes = {
  users: {
    getById: mion.route((ctx, id: string): User => {
      return {id, name: 'John', email: 'john@example.com'};
    }),
    create: mion.route((ctx, user: Omit<User, 'id'>): User => {
      return {id: 'USER-123', ...user};
    }),
  },
} satisfies Routes;

export const myApi = mion.initRoutes(routes);
export type MyApi = PublicApi<typeof routes>;
