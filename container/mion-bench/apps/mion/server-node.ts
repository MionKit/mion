/* ########
 * 2026 mion · License: MIT
 * ######## */
import {startNodeServer} from '@mionjs/platform-node';
import {mion, routes} from './routes.ts';
import {BENCH_PORT, MAX_BODY_SIZE} from './config.ts';

await mion.initRoutes(routes);
await startNodeServer({port: BENCH_PORT, maxBodySize: MAX_BODY_SIZE});
