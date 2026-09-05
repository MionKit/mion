import {createMionRouter, Routes} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';

const mion = createMionRouter();
// @annotate: Automatic Validation and Serialization from Typescript types

interface User {
  id: number;
  name: string;
  age: number;
  createdAt: Date;
  tags: Set<string>;
}
interface Order {
  id: string;
  userId: number;
  amount: number;
}
// @annotate: Object based router with rpc methods that receive Fully Validated params

const routes = {
  getUser: mion.query((ctx, id: number): User | null => {
    if (id !== 1234) return null;
    const tags = new Set(['tag1', 'tag2']);
    const user: User = {
      id: 1234,
      name: 'John',
      age: 30,
      createdAt: new Date(),
      tags,
    };
    return user;
  }),
  getOrder: mion.query((ctx, id: string): Order | null => {
    if (id !== 'ORDER-123') return null;
    const order: Order = {id: 'ORDER-123', userId: 1234, amount: 100};
    return order;
  }),
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

export const myApi = await mion.initRoutes(routes);
export type MyApi = typeof myApi;
startNodeServer({port: 3000});
