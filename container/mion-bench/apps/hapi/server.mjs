/* ########
 * 2026 mion · License: MIT
 * ######## */
import Hapi from '@hapi/hapi';
import {z} from 'zod';
import {makeSchemas, updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';

const {UserSchema, SimpleUserSchema} = makeSchemas(z);
const port = Number(process.env.MION_BENCH_PORT || 3000);

// 10 MB so the payload sweep's largest body is accepted rather than 413'd.
const server = Hapi.server({port, host: '127.0.0.1', routes: {payload: {maxBytes: 10 * 1024 * 1024}}});

const handle = (schema, handler) => (request, h) => {
  const parsed = schema.safeParse(request.payload);
  if (!parsed.success) return h.response({error: 'Validation failed'}).code(400);
  return handler(parsed.data);
};

server.route([
  {method: 'GET', path: '/hello', handler: () => ({hello: 'world'})},
  {method: 'POST', path: '/updateUser', handler: handle(UserSchema, updateUser)},
  {method: 'POST', path: '/updateSimpleUser', handler: handle(SimpleUserSchema, updateSimpleUser)},
]);

await server.start();
