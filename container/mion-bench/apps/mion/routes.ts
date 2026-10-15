/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Routes for every plain JSON mion lane. No schema is declared: the resolver compiles one from the
// handler types, which is the difference the benchmark measures.
import {Routes, createMionRouter} from '@mionjs/router';
import {hello, updateSimpleUser, updateUser} from './handlers.ts';

// One router per process: each server entry imports this file, then listens with its own maxBodySize.
// Every route takes that maxBodySize, since a User (plain strings) declares no maximum.
// `alwaysAwait: false`: every handler here is sync, so no step is awaited and a route answers without a promise.
const mion = createMionRouter({alwaysAwait: false});

const routes = {
  hello: mion.route(hello),
  updateUser: mion.route(updateUser),
  updateSimpleUser: mion.route(updateSimpleUser),
} satisfies Routes;

export type BenchApi = typeof routes;

mion.initRoutes(routes);
