import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

type User = {id: string; name: string; email: string};
// each order belongs to a user
type Order = {id: string; userId: string; totalUSD: number};

// stand-in for your database
declare const db: {
  orders: {findById(id: string): Promise<Order>};
  users: {findById(id: string): Promise<User>};
};

const routes = {
  orders: {
    getById: mion.route(
      (ctx, id: string): Promise<Order> => db.orders.findById(id)
    ),
  },
  users: {
    // in the chain, id is the order's userId, picked by the client's inputFrom mapper on the server
    getById: mion.route(
      (ctx, id: string): Promise<User> => db.users.findById(id)
    ),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
