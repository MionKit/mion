/* ########
 * 2026 mion · License: MIT
 * ######## */
// The same hono app as the node lane, served by bun's own HTTP server. Only the
// runtime differs, which is the whole point of running both.
import {Hono} from 'hono';
import {z} from 'zod';
import {makeSchemas, updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';
import {buildApp} from './app.mjs';

const port = Number(process.env.MION_BENCH_PORT || 3000);
const app = buildApp(Hono, z, makeSchemas, updateUser, updateSimpleUser);
Bun.serve({port, fetch: app.fetch});
