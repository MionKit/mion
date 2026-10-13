/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The routes every plain JSON mion lane serves. The handler signatures ARE the schema: the
// build-time resolver reads `user: User` and compiles the validator, deserializer and
// serializer from it. Nothing here declares a schema, which is the difference the
// benchmark is measuring.
import {Routes, createMionRouter} from '@mionjs/router';
import {hello, updateSimpleUser, updateUser} from './handlers.ts';

// One router per process, created and initialized HERE: the server entries
// import this file and then listen. The route params here (a User with plain strings) have no
// maximum, so every route takes the adapter's maxBodySize, which each server entry sets.
const mion = createMionRouter();

const routes = {
  hello: mion.route(hello),
  updateUser: mion.route(updateUser),
  updateSimpleUser: mion.route(updateSimpleUser),
} satisfies Routes;

export type BenchApi = typeof routes;

mion.initRoutes(routes);
