// The API this Next app serves. Ordinary mion routes: the build compiles their validators
// and serializers, and the route handler under app/api/ dispatches to them.
import {createMionRouter, type PublicApi, type Routes} from '@mionjs/router';

// basePath is what puts `/api` into every route path. The catch-all handler lives under
// app/api/, and a client resolves a route's ABSOLUTE path against its baseURL, which would
// otherwise drop the prefix — so the router has to carry it, not the client.
const mion = createMionRouter({basePath: '/api'});

export type Greeting = {message: string; at: Date};

export const routes = {
  sayHello: mion.route((ctx, name: string): Greeting => ({message: `Hello ${name}!`, at: new Date('2026-01-02T03:04:05.000Z')})),
  // a second route on the COMPACT (positional) wire, so the lane covers both encoders
  addNumbers: mion.route((ctx, a: number, b: number): number => a + b, {encoder: 'compact'}),
} satisfies Routes;

export const api = mion.initRoutes(routes);
export type MionApi = PublicApi<typeof routes>;
