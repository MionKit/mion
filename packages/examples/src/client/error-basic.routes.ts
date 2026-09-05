import {RpcError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string};

// the returned error is part of the signature, so the client knows it exists
const routes = {
  users: {
    getById: mion.route(
      (ctx, id: string): User | RpcError<'user-not-found'> => {
        if (id !== '123')
          return new RpcError({
            publicMessage: `User ${id} not found`,
            type: 'user-not-found',
          });
        return {id, name: 'John'};
      }
    ),
  },
} satisfies Routes;

const myApi = await mion.initRoutes(routes);

export type MyApi = typeof myApi;
