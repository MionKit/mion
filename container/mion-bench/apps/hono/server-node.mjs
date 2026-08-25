/* ########
 * 2026 mion · License: MIT
 * ######## */
import {serve} from '@hono/node-server';
import {Hono} from 'hono';
import {z} from 'zod';
import {makeSchemas, updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';
import {buildApp} from './app.mjs';

const port = Number(process.env.MION_BENCH_PORT || 3000);
serve({fetch: buildApp(Hono, z, makeSchemas, updateUser, updateSimpleUser).fetch, port});
