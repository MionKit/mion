import {createMionRouter, Routes} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';

const mion = createMionRouter();
// @annotate: Automatic validation and serialization from TypeScript types

interface User {
  id: number;
  name: string;
  createdAt: Date;
  tags: Set<string>;
}
// @annotate: A plain function is a route; its params arrive fully validated

const routes = {
  getUser: mion.query((ctx, id: number): User | null => {
    if (id !== 1234) return null;
    return {
      id: 1234,
      name: 'John',
      createdAt: new Date(),
      tags: new Set(['admin']),
    };
  }),
  // ...other routes
} satisfies Routes;

export const myApi = await mion.initRoutes(routes);
export type MyApi = typeof myApi;
startNodeServer({port: 3000});
