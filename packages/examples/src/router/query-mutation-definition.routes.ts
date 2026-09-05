import {RpcError} from '@mionjs/core';
import {Routes} from '@mionjs/router';
import {mion} from './full-example.app.ts';

type User = {name: string; surname: string};

const routes = {
  // mion.query() for read-only operations
  // client automatically uses GET with ?data=base64url for small payloads
  getUser: mion.query((ctx, id: number): User | RpcError<'user-not-found'> => {
    return {name: 'John', surname: 'Doe'};
  }),

  // mion.mutation() for operations that modify data
  // client always uses POST with body
  createUser: mion.mutation((ctx, user: User): User => {
    return user;
  }),

  // mion.route() declares no intent (client uses POST)
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}`;
  }),
} satisfies Routes;
