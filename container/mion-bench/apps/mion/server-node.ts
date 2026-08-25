/* ########
 * 2026 mion · License: MIT
 * ######## */
import {startNodeServer} from '@mionjs/platform-node';
import {initMionRouter} from '@mionjs/router';
import {routes} from './routes.ts';
import {BENCH_PORT, MAX_BODY_SIZE} from './config.ts';

await initMionRouter(routes);
await startNodeServer({port: BENCH_PORT, maxBodySize: MAX_BODY_SIZE});
