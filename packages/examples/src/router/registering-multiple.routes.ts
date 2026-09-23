import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, PublicApi, Routes} from '@mionjs/router';

const mion = createMionRouter();

const authRoutes = {
  logIn: mion.route(
    (ctx, email: string, password: string): string => 'loggedIn'
  ),
  logOut: mion.route((): string => 'loggedOut'),
} satisfies Routes;

const routes = {
  auth: mion.headersFn(
    (ctx, h: HeadersSubset<'Authorization'>): void => undefined
  ),
  sayHello: mion.route((ctx, name: string): string => 'hello ' + name),
} satisfies Routes;

// routes split across files are spread into the one initRoutes call
export const myApi = mion.initRoutes({...routes, ...authRoutes});

export type MyApi = typeof myApi;
// a sub-api can be typed on its own from its routes object
export type AuthApi = PublicApi<typeof authRoutes>;
