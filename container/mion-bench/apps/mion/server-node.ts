/* ########
 * 2026 mion · License: MIT
 * ######## */
import {startNodeServer} from '@mionjs/platform-node';
import './routes.ts';
import {BENCH_PORT, MAX_BODY_SIZE} from './config.ts';

await startNodeServer({port: BENCH_PORT, maxBodySize: MAX_BODY_SIZE});
