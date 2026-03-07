import {initApi} from './api.ts';
import {startBunServer} from '@mionkit/platform-bun';

await initApi();
startBunServer({port: 3001});
