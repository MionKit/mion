import {RpcError} from '@mionjs/core';
import {Routes, initMionRouter, route} from '@mionjs/router';

export type User = {id: string; name: string};
export type Order = {id: string; userId: string; totalUSD: number};

const routes = {
  users: {
    getById: route((ctx, id: string): User | RpcError<'user-not-found', {requestedId: string}> => {
      if (id !== 'USER-123') {
        return new RpcError({publicMessage: 'User not found', type: 'user-not-found', errorData: {requestedId: id}});
      }
      return {id, name: 'John'};
    }),
  },
  orders: {
    getById: route((ctx, id: string): Order | RpcError<'order-not-found', {requestedId: string}> => {
      if (id === 'ORDER-404') {
        return new RpcError({publicMessage: 'Order not found', type: 'order-not-found', errorData: {requestedId: id}});
      }
      return {id, userId: 'USER-123', totalUSD: 120};
    }),
  },
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type FlowOrdersApi = typeof myApi;
