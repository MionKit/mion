/* ########
 * 2026 mion · License: MIT
 * ######## */
import {startBunServer} from '@mionjs/platform-bun';
import {initMionRouter} from '@mionjs/router';
import {routes} from './routes.ts';
import {BENCH_PORT, MAX_BODY_SIZE} from './config.ts';

await initMionRouter(routes);
await startBunServer({port: BENCH_PORT, maxBodySize: MAX_BODY_SIZE});
