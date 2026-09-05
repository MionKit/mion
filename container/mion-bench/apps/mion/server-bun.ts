/* ########
 * 2026 mion · License: MIT
 * ######## */
import {startBunServer} from '@mionjs/platform-bun';
import './routes.ts';
import {BENCH_PORT, MAX_BODY_SIZE} from './config.ts';

await startBunServer({port: BENCH_PORT, maxBodySize: MAX_BODY_SIZE});
