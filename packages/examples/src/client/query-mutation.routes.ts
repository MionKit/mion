import {Routes, initMionRouter, mutation, query} from '@mionjs/router';

export type User = {id: string; name: string};

const routes = {
  // read only, the client sends it as a GET
  getUser: query((ctx, id: string): User => ({id, name: 'John'})),
  // changes data, the client always sends it as a POST
  createUser: mutation((ctx, name: string): User => ({id: 'USER-123', name})),
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type MyApi = typeof myApi;
